const { createHash } = require('crypto');
const { QueryTypes } = require('sequelize');
const cohort = require('../utils/employeeCohort');
const models = require('../models');
const select = (sql, replacements, transaction) => models.sequelize.query(sql, { replacements, transaction, type: QueryTypes.SELECT });
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const id = s => /^[1-9]\d*$/.test(String(s)) && Number.isSafeInteger(Number(s));
const civil = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
const respond = (res, e) => res.status(e.status || 500).json({ message: e.status ? e.message : 'Advance ledger unavailable' });
const table = 'payroll_advance_entries';
async function employeeAndActor(req, employeeId, transaction) {
  const users = new Map();
  for (const uid of [...new Set([employeeId, req.user.id])].sort((a,b) => a-b)) {
    users.set(uid, await models.User.findByPk(uid, { transaction, lock: transaction.LOCK.UPDATE }));
  }
  const admin = users.get(req.user.id);
  if (!admin || admin.role !== 'admin' || admin.status !== 'active' || Number(admin.sessionVersion) !== Number(req.user.sessionVersion || 0)) fail(403, 'Current payroll administrator required');
  const target=users.get(employeeId);
  if (!target) fail(404,'Employee not found');
  if (cohort.includes(target)) return true;
  const [history]=await select('SELECT id FROM '+table+' WHERE employeeId = ? AND accountId IS NULL LIMIT 1',[employeeId],transaction);
  if (!history) fail(404,'Employee or existing payroll ledger not found');
  return false;
}
exports.read = async (req, res) => {
  try {
    if (!id(req.params.employeeId) || Object.keys(req.query).some(k => k !== 'before') || (req.query.before && !id(req.query.before))) fail(400, 'Invalid employee or page');
    const employeeId = Number(req.params.employeeId);
    const rows = await models.sequelize.transaction(async t => {
      const mayIssue=await employeeAndActor(req, employeeId, t);
      const entries = await select('SELECT a.id,a.kind,a.amount,a.currency,a.effectiveDate,a.reference,a.actorId,a.createdAt, a.amount - COALESCE((SELECT SUM(r.amount) FROM '+table+' r WHERE r.accountId=a.id),0) AS balance FROM '+table+' a WHERE a.employeeId= ? AND a.accountId IS NULL AND a.id< ? ORDER BY a.id DESC LIMIT 26', [employeeId, Number(req.query.before || Number.MAX_SAFE_INTEGER)], t);
      const page = entries.slice(0,25);
      if (page.length) {
        const repayments = await select('SELECT id,accountId,amount,effectiveDate,reference,actorId,createdAt FROM '+table+' WHERE accountId IN (?) ORDER BY id', [page.map(e=>e.id)], t);
        for (const entry of page) entry.repayments = repayments.filter(r=>r.accountId === entry.id);
      }
      return { rows: page, hasMore: entries.length > 25, mayIssue };
    });
    return res.json(rows);
  } catch (e) { return respond(res,e); }
};
exports.write = async (req,res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const { kind, amount, currency, effectiveDate, reference, commandKey, accountId } = req.body || {};
    const repay = kind === 'repayment';
    if (!id(req.params.employeeId) || Object.keys(req.query).length || Object.keys(req.body || {}).some(k=>!['kind','amount','currency','effectiveDate','reference','commandKey','accountId'].includes(k)) ||
        !['advance','loan','repayment'].includes(kind) || !(repay ? id(accountId) : accountId == null) ||
        typeof amount !== 'string' || !/^(0|[1-9]\d{0,11})(\.\d{1,4})?$/.test(amount) || !Number(amount) ||
        typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency) || !civil(effectiveDate) || typeof reference !== 'string' || !reference.trim() || reference.trim().length > 240 ||
        typeof commandKey !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(commandKey)) fail(400, 'Valid entry, positive amount, currency, date and reference required');
    const hash = createHash('sha256').update(JSON.stringify([req.user.id,employeeId,kind,amount,currency,effectiveDate,reference.trim(),accountId ?? null])).digest('hex');
    const result = await models.sequelize.transaction({ isolationLevel:'READ COMMITTED' }, async t => {
      const mayIssue=await employeeAndActor(req,employeeId,t);
      const [prior] = await select('SELECT id,payloadHash FROM '+table+' WHERE commandKey= ?',[commandKey],t);
      if (prior) {
        if (prior.payloadHash !== hash) fail(409,'This retry belongs to a different entry');
        return { id: prior.id, replayed: true };
      }
      if (!repay && !mayIssue) fail(409,'Retained ledger permits repayments only');
      if (!repay && currency !== 'PKR') fail(400,'New advances and loans use PKR');
      if (repay) {
        const [original] = await select('SELECT a.currency,a.effectiveDate, (a.amount - COALESCE((SELECT SUM(r.amount) FROM '+table+' r WHERE r.accountId=a.id),0)) >= CAST(? AS DECIMAL(16,4)) AS enough FROM '+table+' a WHERE a.id= ? AND a.employeeId= ? AND a.accountId IS NULL',[amount,accountId,employeeId],t);
        if (!original) fail(404,'Advance or loan not found for this employee');
        if (original.currency !== currency || effectiveDate < original.effectiveDate || !Number(original.enough)) fail(409,'Check repayment currency, issue date and outstanding balance');
      }
      const [newId] = await models.sequelize.query('INSERT INTO '+table+' (accountId,employeeId,actorId,kind,currency,amount,effectiveDate,reference,commandKey,payloadHash,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,NOW())',
        { replacements:[accountId ?? null,employeeId,req.user.id,kind,currency,amount,effectiveDate,reference.trim(),commandKey,hash],transaction:t });
      return { id:newId, replayed:false };
    });
    return res.json(result);
  } catch(e) { return respond(res,e); }
};

exports.options = async(req,res) => {
  try {
    const search=req.query.search;
    if(Object.keys(req.query).length!==1 || typeof search!=='string' || search.trim().length<2 || search.trim().length>100) fail(400,'Enter 2–100 search characters');
    const users=await select('SELECT u.id,u.fullName,u.email,u.status,u.role FROM users u WHERE (u.role = ? OR (u.role = ? AND u.retainedEmployeeMembership = 1) OR EXISTS(SELECT 1 FROM '+table+' a WHERE a.employeeId=u.id AND a.accountId IS NULL)) AND (LOCATE(?,u.fullName)>0 OR LOCATE(?,u.email)>0) ORDER BY u.fullName,u.id LIMIT 20',['employee','hr',search.trim(),search.trim()]);
    return res.json({data:users});
  } catch(e){return respond(res,e);}
};