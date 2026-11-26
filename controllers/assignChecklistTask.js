const { createHash } = require('crypto');

module.exports = (models, { actor, error }) => async function assignChecklistTask(req, res) {
  const { kind, itemId } = req.params;
  const sources = {
    onboarding: [models.OnboardingItem, models.OnboardingCase],
    offboarding: [models.OffboardingItem, models.OffboardingCase],
  };
  const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
  try {
    const { caseVersion, assigneeId, submissionDueDate, approvalDueDate } = req.body || {};
    if (!Object.hasOwn(sources, kind) || !/^[1-9]\d*$/.test(itemId) || !Number.isSafeInteger(Number(itemId))
      || !Number.isSafeInteger(caseVersion) || caseVersion < 1 || !Number.isSafeInteger(assigneeId) || assigneeId < 1
      || Object.keys(req.body).some(k=>!['caseVersion','assigneeId','submissionDueDate','approvalDueDate'].includes(k)) || [submissionDueDate,approvalDueDate].some(d=>d!=null && !require('./hrTaskDeadlines').validDate(d)) || Object.keys(req.query).length) {
      fail(400, 'Valid checklist item, version and responsible person required');
    }
    const [Item, Case] = sources[kind];
    const result = await models.sequelize.transaction({ isolationLevel: 'READ COMMITTED' }, async transaction => {
      const people = await actor(req, transaction, assigneeId);
      const source = await Item.findByPk(itemId, { transaction });
      if (!source) fail(404, 'Checklist item not found');
      const locked = { transaction, lock: transaction.LOCK.UPDATE };
      const checklist = await Case.findByPk(source.caseId, locked);
      const item = await Item.findByPk(itemId, locked);
      if (!checklist || !item || item.caseId !== checklist.id) fail(409, 'Checklist item changed');
      const hash = createHash('sha256').update('checklist:' + kind + ':' + item.id).digest('hex');
      // The unique event key is deliberately outside the ordinary UUID command namespace.
      const commandKey = 'item:' + hash.slice(0, 31);
      const prior = await models.HrTaskEvent.findOne({ where: { commandKey }, transaction });
      if (prior) {
        const original=prior.details.after;
        if ([['submissionDueDate',submissionDueDate],['approvalDueDate',approvalDueDate]].some(([key,value])=>value!=null && original[key]!==value)) {
          fail(409,'This item already has a linked task. Edit its stage deadlines from HR tasks.');
        }
        return { taskId: prior.taskId, created: false };
      }
      if (checklist.version !== caseVersion || checklist.status !== 'open' || item.status !== 'pending'
        || item.responsibleId !== assigneeId) fail(409, 'Reload the open checklist and confirm its responsible person');
      const recipient = people.get(assigneeId);
      if (!recipient || recipient.status !== 'active' || !['employee', 'manager', 'admin'].includes(recipient.role)) {
        fail(409, 'An active internal responsible person is required');
      }
      const task = await models.HrTask.create({
        title: item.title, description: 'Assigned from ' + kind + ' checklist item #' + item.id,
        assigneeId, departmentId: null, dueDate: item.dueDate, submissionDueDate: submissionDueDate ?? null, approvalDueDate: approvalDueDate ?? null, status: 'open', version: 1, createdBy: req.user.id,
      }, { transaction });
      const admin = people.get(req.user.id);
      await models.HrTaskEvent.create({
        taskId: task.id, actorId: admin.id, action: 'create', version: 1, commandKey, payloadHash: hash,
        details: {
          actor: { id: admin.id, fullName: admin.fullName }, reason: 'Assigned from ' + kind + ' checklist item #' + item.id,
          assignee: { id: recipient.id, fullName: recipient.fullName, role: recipient.role },
          source: { kind, caseId: checklist.id, employeeId: checklist.employeeId, itemId: item.id, caseVersion },
          before: null, after: task.toJSON(), recordedByAdmin: true,
        },
      }, { transaction });
      return { taskId: task.id, created: true };
    });
    return res.json({ success: true, data: result });
  } catch (e) { return error(res, e); }
};
