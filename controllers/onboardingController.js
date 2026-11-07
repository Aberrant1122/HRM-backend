const crypto = require('node:crypto');
const { sequelize, User, OnboardingCase, OnboardingItem, OnboardingEvent } = require('../models');
const { Op } = require('sequelize');
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const positive = value => Number.isSafeInteger(value) && value > 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1000-01-01' && value <= '9999-12-31' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const actions = ['create', 'add_item', 'edit_item', 'complete_item', 'waive_item', 'reopen_item', 'complete_case', 'reopen_case'];

function normalize(body, actorId, employeeId) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Command body required');
  if (Object.keys(body).some(key => !['commandKey','action','expectedVersion','itemId','title','responsibleId','dueDate','reason'].includes(key))) fail(400, 'Unknown command field');
  if (!actions.includes(body.action) || typeof body.commandKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.commandKey)) fail(400, 'Valid action and UUID commandKey required');
  if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) fail(400, 'expectedVersion must be a nonnegative integer');
  const command = { actorId, employeeId, action: body.action, expectedVersion: body.expectedVersion };
  if (body.action.endsWith('_item') && body.action !== 'add_item') {
    if (!positive(body.itemId)) fail(400, 'Valid itemId required');
    command.itemId = body.itemId;
  }
  if (['add_item','edit_item'].includes(body.action)) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200) fail(400, 'Item title must be 1–200 characters');
    if (body.responsibleId != null && !positive(body.responsibleId)) fail(400, 'Responsible person must be an existing account ID');
    if (body.dueDate != null && !date(body.dueDate)) fail(400, 'Due date must be a valid YYYY-MM-DD');
    Object.assign(command, { title: body.title.trim(), responsibleId: body.responsibleId ?? null, dueDate: body.dueDate ?? null });
  }
  if (!['create','add_item'].includes(body.action)) {
    if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 1000) fail(400, 'An attributed reason of 1–1000 characters is required');
    command.reason = body.reason.trim();
  }
  // Reject fields that the chosen action would otherwise silently ignore.
  for (const key of ['itemId','title','responsibleId','dueDate','reason']) if (key in body && !(key in command)) fail(400, `Field ${key} is not valid for this action`);
  return command;
}

async function snapshot(employeeId, transaction, before) {
  const employee = await User.findByPk(employeeId, { attributes: ['id','fullName','email','role','status'], transaction });
  if (!employee) fail(404, 'Employee account not found');
  const onboarding = await OnboardingCase.findOne({ where: { employeeId }, transaction });
  if (!onboarding) return { employee, onboarding: null, items: [], history: [], hasEarlierHistory: false, people: [] };
  const items = await OnboardingItem.findAll({ where: { caseId: onboarding.id }, order: [['id','ASC']], transaction });
  const history = await OnboardingEvent.findAll({ where: { caseId: onboarding.id, ...(before && { version: { [Op.lt]: before } }) }, attributes: ['id','caseId','actorId','action','version','details','createdAt'], order: [['version','DESC']], limit: 101, transaction });
  const hasEarlierHistory = history.length > 100;
  const page = history.slice(0, 100);
  const ids = [...new Set([...items.map(item => item.responsibleId), ...page.map(event => event.actorId)].filter(Boolean))];
  const people = ids.length ? await User.findAll({ where: { id: ids }, attributes: ['id','fullName','role','status'], transaction }) : [];
  return { employee, onboarding, items, history: page, hasEarlierHistory, people };
}

const readSnapshot = (employeeId, before) => sequelize.transaction(
  { isolationLevel: 'REPEATABLE READ', readOnly: true },
  transaction => snapshot(employeeId, transaction, before)
);

function errorResponse(res, error) {
  if (error.code && Number.isInteger(error.code)) return res.status(error.code).json({ success: false, message: error.message });
  if (['SequelizeUniqueConstraintError','SequelizeForeignKeyConstraintError'].includes(error.name)) return res.status(409).json({ success: false, message: 'Record changed or command key already used. Reload before continuing.' });
  console.error('Onboarding request failed:', error.message);
  return res.status(500).json({ success: false, message: 'Onboarding unavailable' });
}

exports.read = async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    if (!positive(employeeId) || !/^\d+$/.test(req.params.employeeId)) fail(400, 'Valid employee ID required');
    const before = req.query.before === undefined ? undefined : Number(req.query.before);
    if (req.query.before !== undefined && (typeof req.query.before !== 'string' || !/^\d+$/.test(req.query.before) || !positive(before))) fail(400, 'Valid history cursor required');
    return res.json({ success: true, data: await readSnapshot(employeeId, before) });
  } catch (error) { return errorResponse(res, error); }
};

exports.command = async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    if (!positive(employeeId) || !/^\d+$/.test(req.params.employeeId)) fail(400, 'Valid employee ID required');
    const input = normalize(req.body, req.user.id, employeeId);
    const commandKey = req.body.commandKey.toLowerCase();
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const outcome = await sequelize.transaction(async transaction => {
      // Every command locks the same employee then case. Assignment alone grants no access.
      const employee = await User.findByPk(employeeId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!employee) fail(404, 'Employee account not found');
      const previous = await OnboardingEvent.findOne({ where: { commandKey }, transaction });
      if (previous) {
        if (previous.payloadHash !== payloadHash) fail(409, 'Command key was used for different content or actor');
        return { replayed: true, appliedVersion: previous.version };
      }
      let onboarding = await OnboardingCase.findOne({ where: { employeeId }, transaction, lock: transaction.LOCK.UPDATE });
      if (input.action === 'create') {
        if (onboarding) fail(409, 'An onboarding checklist already exists for this account');
        if (employee.role !== 'employee') fail(409, 'New checklists require an existing employee-role account');
        if (input.expectedVersion !== 0) fail(409, 'Reload the onboarding checklist');
        onboarding = await OnboardingCase.create({ employeeId, createdBy: req.user.id, version: 1, status: 'open' }, { transaction });
      } else {
        if (!onboarding) fail(404, 'Create the onboarding checklist first');
        if (onboarding.version !== input.expectedVersion) fail(409, 'Checklist changed. Reload before applying your edit.');
        if (input.action !== 'reopen_case' && onboarding.status !== 'open') fail(409, 'Reopen the completed checklist before editing');
        if (input.action === 'reopen_case' && onboarding.status !== 'completed') fail(409, 'Only completed checklists can be reopened');
        onboarding.version += 1;
      }
      let details = { reason: input.reason || null };
      if (['add_item','edit_item'].includes(input.action) && input.responsibleId && !await User.findByPk(input.responsibleId, { transaction })) fail(400, 'Responsible account does not exist');
      if (input.action === 'add_item') {
        if (await OnboardingItem.count({ where: { caseId: onboarding.id }, transaction }) >= 200) fail(409, 'A checklist supports up to 200 manual items');
        const item = await OnboardingItem.create({ caseId: onboarding.id, title: input.title, responsibleId: input.responsibleId, dueDate: input.dueDate }, { transaction });
        details = { ...details, itemId: item.id, after: item.toJSON() };
      } else if (input.action.endsWith('_item')) {
        const item = await OnboardingItem.findOne({ where: { id: input.itemId, caseId: onboarding.id }, transaction, lock: transaction.LOCK.UPDATE });
        if (!item) fail(404, 'Checklist item not found');
        details = { ...details, itemId: item.id, before: item.toJSON() };
        if (input.action === 'edit_item') {
          if (item.status !== 'pending') fail(409, 'Reopen the item before changing its details');
          Object.assign(item, { title: input.title, responsibleId: input.responsibleId, dueDate: input.dueDate });
        } else if (input.action === 'reopen_item') {
          if (item.status === 'pending') fail(409, 'Item is already pending');
          item.status = 'pending';
        } else {
          if (item.status !== 'pending') fail(409, 'Only pending items may be completed or waived');
          item.status = input.action === 'complete_item' ? 'completed' : 'waived';
        }
        await item.save({ transaction }); details.after = item.toJSON();
      } else if (input.action === 'complete_case') {
        const items = await OnboardingItem.findAll({ where: { caseId: onboarding.id }, transaction });
        if (!items.length || items.some(item => !['completed','waived'].includes(item.status))) fail(409, 'Complete or waive every item before completing the checklist');
        details.before = onboarding.status; onboarding.status = 'completed'; details.after = onboarding.status;
      } else if (input.action === 'reopen_case') {
        details.before = onboarding.status; onboarding.status = 'open'; details.after = onboarding.status;
      }
      await onboarding.save({ transaction });
      await OnboardingEvent.create({ caseId: onboarding.id, commandKey, payloadHash, actorId: req.user.id, action: input.action, version: onboarding.version, details }, { transaction });
      return { replayed: false, appliedVersion: onboarding.version };
    });
    // Respond only after commit. A network retry reuses its UUID and adds no second event.
    return res.json({ success: true, ...outcome, data: await readSnapshot(employeeId) });
  } catch (error) { return errorResponse(res, error); }
};
