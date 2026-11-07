const crypto = require('node:crypto');
module.exports=models=>{
const { sequelize, User, Department, OffboardingCase, OffboardingItem, OffboardingEvent } = models;
const { Op } = require('sequelize');
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const positive = value => Number.isSafeInteger(value) && value > 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1000-01-01' && value <= '9999-12-31' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const actions = ['create', 'edit_case', 'add_item', 'edit_item', 'complete_item', 'waive_item', 'reopen_item', 'complete_case', 'reopen_case'];

function normalize(body, actorId, employeeId) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Command body required');
  if (Object.keys(body).some(key => !['commandKey','action','expectedVersion','itemId','title','responsibleId','dueDate','reason','departmentId','kind','exitType','reportedDate','noticeStart','noticeEnd','lastWorkingDate'].includes(key))) fail(400, 'Unknown command field');
  if (!actions.includes(body.action) || typeof body.commandKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.commandKey)) fail(400, 'Valid action and UUID commandKey required');
  if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) fail(400, 'expectedVersion must be a nonnegative integer');
  const command = { actorId, employeeId, action: body.action, expectedVersion: body.expectedVersion };
  if(['create','edit_case'].includes(body.action)){
    if(!['resignation','termination','other'].includes(body.exitType))fail(400,'Explicit exit type required');command.exitType=body.exitType;
    for(const key of ['reportedDate','noticeStart','noticeEnd','lastWorkingDate']){if(body[key]!==null&&!date(body[key]))fail(400,'Explicit valid civil dates or null required');command[key]=body[key];}
    if(command.noticeStart&&command.noticeEnd&&command.noticeStart>command.noticeEnd)fail(400,'Notice end cannot precede notice start');
  }
  if (body.action.endsWith('_item') && body.action !== 'add_item') {
    if (!positive(body.itemId)) fail(400, 'Valid itemId required');
    command.itemId = body.itemId;
  }
  if (['add_item','edit_item'].includes(body.action)) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200) fail(400, 'Item title must be 1–200 characters');
    if (body.responsibleId != null && !positive(body.responsibleId)) fail(400, 'Responsible person must be an existing account ID');
    if (body.dueDate != null && !date(body.dueDate)) fail(400, 'Due date must be a valid YYYY-MM-DD');
    if(body.departmentId!==null&&!positive(body.departmentId))fail(400,'Select department or explicitly leave unassigned');if(!['clearance','asset_return'].includes(body.kind))fail(400,'Explicit task kind required');
    Object.assign(command, { departmentId:body.departmentId,kind:body.kind,title: body.title.trim(), responsibleId: body.responsibleId ?? null, dueDate: body.dueDate ?? null });
  }
  {
    if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 1000) fail(400, 'An attributed reason of 1–1000 characters is required');
    command.reason = body.reason.trim();
  }
  // Reject fields that the chosen action would otherwise silently ignore.
  for (const key of ['itemId','title','responsibleId','dueDate','reason','departmentId','kind','exitType','reportedDate','noticeStart','noticeEnd','lastWorkingDate']) if (key in body && !(key in command)) fail(400, `Field ${key} is not valid for this action`);
  return command;
}

async function snapshot(employeeId, transaction, before) {
  const employee = await User.findByPk(employeeId, { attributes: ['id','fullName','email','role','status'], transaction });
  if (!employee) fail(404, 'Employee account not found');
  const offboarding = await OffboardingCase.findOne({ where: { employeeId }, transaction });
  if (!offboarding) return { employee, offboarding: null, items: [], history: [], hasEarlierHistory: false, people: [] };
  const items = await OffboardingItem.findAll({ where: { caseId: offboarding.id }, order: [['id','ASC']], transaction });
  const history = await OffboardingEvent.findAll({ where: { caseId: offboarding.id, ...(before && { version: { [Op.lt]: before } }) }, attributes: ['id','caseId','actorId','action','version','details','createdAt'], order: [['version','DESC']], limit: 101, transaction });
  const hasEarlierHistory = history.length > 100;
  const page = history.slice(0, 100);
  const ids = [...new Set([...items.map(item => item.responsibleId), ...page.map(event => event.actorId)].filter(Boolean))];
  const people = ids.length ? await User.findAll({ where: { id: ids }, attributes: ['id','fullName','role','status'], transaction }) : [];
  const departmentIds=[...new Set(items.map(i=>i.departmentId).filter(Boolean))],departments=departmentIds.length?await Department.findAll({where:{id:departmentIds},attributes:['id','name','isActive'],transaction}):[];
  return { employee, offboarding, items, history: page, hasEarlierHistory, people,departments };
}

const readSnapshot = (employeeId, before) => sequelize.transaction(
  { isolationLevel: 'REPEATABLE READ', readOnly: true },
  transaction => snapshot(employeeId, transaction, before)
);

function errorResponse(res, error) {
  if (error.code && Number.isInteger(error.code)) return res.status(error.code).json({ success: false, message: error.message });
  if (['SequelizeUniqueConstraintError','SequelizeForeignKeyConstraintError'].includes(error.name)) return res.status(409).json({ success: false, message: 'Record changed or command key already used. Reload before continuing.' });
  console.error('Offboarding request failed:', error.message);
  return res.status(500).json({ success: false, message: 'Offboarding unavailable' });
}

const read = async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    if (!positive(employeeId) || !/^\d+$/.test(req.params.employeeId)) fail(400, 'Valid employee ID required');
    const before = req.query.before === undefined ? undefined : Number(req.query.before);
    if (req.query.before !== undefined && (typeof req.query.before !== 'string' || !/^\d+$/.test(req.query.before) || !positive(before))) fail(400, 'Valid history cursor required');
    return res.json({ success: true, data: await readSnapshot(employeeId, before) });
  } catch (error) { return errorResponse(res, error); }
};

const command = async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    if (!positive(employeeId) || !/^\d+$/.test(req.params.employeeId)) fail(400, 'Valid employee ID required');
    const input = normalize(req.body, req.user.id, employeeId);
    const commandKey = req.body.commandKey.toLowerCase();
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const outcome = await sequelize.transaction({isolationLevel:'READ COMMITTED'},async transaction => {
      const users=new Map();for(const id of [...new Set([req.user.id,employeeId,input.responsibleId].filter(Boolean))].sort((a,b)=>a-b))users.set(id,await User.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE}));const actor=users.get(req.user.id),employee=users.get(employeeId);if(!actor||actor.role!=='admin'||actor.status!=='active'||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))fail(403,'Current administrator authorization required');if(!employee)fail(404,'Employee account not found');
      const previous = await OffboardingEvent.findOne({ where: { commandKey }, transaction });
      if (previous) {
        if (previous.payloadHash !== payloadHash) fail(409, 'Command key was used for different content or actor');
        return { replayed: true, appliedVersion: previous.version };
      }
      let offboarding = await OffboardingCase.findOne({ where: { employeeId }, transaction, lock: transaction.LOCK.UPDATE });
      const caseBefore=offboarding?JSON.parse(JSON.stringify(offboarding.toJSON())):null;
      if (input.action === 'create') {
        if (offboarding) fail(409, 'An offboarding checklist already exists for this account');
        if (!['employee','manager','admin'].includes(employee.role)) fail(409, 'New checklists require an existing internal account');
        if (input.expectedVersion !== 0) fail(409, 'Reload the offboarding checklist');
        offboarding = await OffboardingCase.create({ employeeId, createdBy: req.user.id, version: 1, status: 'open',exitType:input.exitType,reportedDate:input.reportedDate,noticeStart:input.noticeStart,noticeEnd:input.noticeEnd,lastWorkingDate:input.lastWorkingDate }, { transaction });
      } else {
        if (!offboarding) fail(404, 'Create the offboarding checklist first');
        if (offboarding.version !== input.expectedVersion) fail(409, 'Checklist changed. Reload before applying your edit.');
        if (input.action !== 'reopen_case' && offboarding.status !== 'open') fail(409, 'Reopen the completed checklist before editing');
        if (input.action === 'reopen_case' && offboarding.status !== 'completed') fail(409, 'Only completed checklists can be reopened');
        offboarding.version += 1;
      }
      let details = { reason: input.reason || null };
      if(input.action==='edit_case')for(const key of ['exitType','reportedDate','noticeStart','noticeEnd','lastWorkingDate'])offboarding[key]=input[key];
      if(['add_item','edit_item'].includes(input.action)){
        const old=input.action==='edit_item'?await OffboardingItem.findOne({where:{id:input.itemId,caseId:offboarding.id},transaction}):null;
        if(input.responsibleId){const owner=users.get(input.responsibleId);if(!owner)fail(400,'Responsible account not found');if(input.responsibleId!==old?.responsibleId&&(owner.status!=='active'||!['employee','manager','admin'].includes(owner.role)))fail(409,'New responsible account must be active and internal');details.responsible={id:owner.id,fullName:owner.fullName};}
        if(input.departmentId){const department=await Department.findByPk(input.departmentId,{transaction,lock:transaction.LOCK.UPDATE});if(!department)fail(400,'Department not found');if(input.departmentId!==old?.departmentId&&!department.isActive)fail(409,'New department must be active');details.department={id:department.id,name:department.name};}
      }
      if (input.action === 'add_item') {
        if (await OffboardingItem.count({ where: { caseId: offboarding.id }, transaction }) >= 200) fail(409, 'A checklist supports up to 200 manual items');
        const item = await OffboardingItem.create({ caseId: offboarding.id, title: input.title, responsibleId: input.responsibleId, dueDate: input.dueDate,departmentId:input.departmentId,kind:input.kind }, { transaction });
        details = { ...details, itemId: item.id, after: item.toJSON() };
      } else if (input.action.endsWith('_item')) {
        const item = await OffboardingItem.findOne({ where: { id: input.itemId, caseId: offboarding.id }, transaction, lock: transaction.LOCK.UPDATE });
        if (!item) fail(404, 'Checklist item not found');
        if(input.action!=='edit_item'){
          const department=item.departmentId?await Department.findByPk(item.departmentId,{attributes:['id','name'],transaction}):null;
          const responsible=item.responsibleId?await User.findByPk(item.responsibleId,{attributes:['id','fullName'],transaction}):null;
          if(department)details.department=department.toJSON();if(responsible)details.responsible=responsible.toJSON();
        }
        details = { ...details, itemId: item.id, before: item.toJSON() };
        if (input.action === 'edit_item') {
          if (item.status !== 'pending') fail(409, 'Reopen the item before changing its details');
          Object.assign(item, { title: input.title, responsibleId: input.responsibleId, dueDate: input.dueDate, departmentId:input.departmentId, kind:input.kind });
        } else if (input.action === 'reopen_item') {
          if (item.status === 'pending') fail(409, 'Item is already pending');
          item.status = 'pending';
        } else {
          if (item.status !== 'pending') fail(409, 'Only pending items may be completed or waived');
          item.status = input.action === 'complete_item' ? 'completed' : 'waived';
        }
        await item.save({ transaction }); details.after = item.toJSON();
      } else if (input.action === 'complete_case') {
        const items = await OffboardingItem.findAll({ where: { caseId: offboarding.id }, transaction });
        if (!items.length || items.some(item => !['completed','waived'].includes(item.status))) fail(409, 'Complete or waive every item before completing the checklist');
        details.before = offboarding.status; offboarding.status = 'completed'; details.after = offboarding.status;
      } else if (input.action === 'reopen_case') {
        details.before = offboarding.status; offboarding.status = 'open'; details.after = offboarding.status;
      }
      await offboarding.save({ transaction });
      details={...details,actor:{id:actor.id,fullName:actor.fullName},caseBefore,caseAfter:JSON.parse(JSON.stringify(offboarding.toJSON()))};
      await OffboardingEvent.create({ caseId: offboarding.id, commandKey, payloadHash, actorId: req.user.id, action: input.action, version: offboarding.version, details }, { transaction });
      return { replayed: false, appliedVersion: offboarding.version };
    });
    // Respond only after commit. A network retry reuses its UUID and adds no second event.
    return res.json({ success: true, ...outcome, data: await readSnapshot(employeeId) });
  } catch (error) { return errorResponse(res, error); }
};

return{read,command};
};
