const { QueryTypes } = require('sequelize');
const { sequelize, EmployeePayroll, PayrollPeriod, User } = require('../models');
const table = 'payroll_component_records';
const fail = (status,message) => {throw Object.assign(Error(message),{status});};
const select = (sql,replacements,transaction) => sequelize.query(sql,{replacements,transaction,type:QueryTypes.SELECT});
const readId = value => {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) fail(400,'Valid payroll row required');
  return Number(value);
};
module.exports = async (req,res) => {
  try {
    const payrollId=readId(req.params.id);
    const writing=req.method==='POST';
    if(Object.keys(req.query).some(k=>writing || k!=='before'))fail(400,'Invalid query');
    const before=req.query.before === undefined ? Number.MAX_SAFE_INTEGER : readId(req.query.before);
    const result=await sequelize.transaction({isolationLevel:'READ COMMITTED'},async t=>{
      const opts={transaction:t,lock:t.LOCK.UPDATE};
      const actor=await User.findByPk(req.user.id,{...opts,attributes:['id','role','status','sessionVersion']});
      if(!actor || actor.role!=='admin' || actor.status!=='active' || Number(actor.sessionVersion)!==Number(req.user.sessionVersion || 0))fail(403,'Current payroll administrator required');
      const row=await EmployeePayroll.findByPk(payrollId,{transaction:t,attributes:['id','payroll_period_id','employee_id']});
      if(!row)fail(404,'Payroll row not found');
      const period=await PayrollPeriod.findByPk(row.payroll_period_id,{...opts,attributes:['id','status','name']});
      const locked=await EmployeePayroll.findByPk(payrollId,{...opts,attributes:['id','employee_id','payroll_period_id','status','locked']});
      if(!period || !locked || locked.payroll_period_id!==period.id)fail(409,'Payroll row changed');
      const writable=!locked.locked && ![period.status,locked.status].some(s=>['approved','paid'].includes(s));
      if(!writing) {
        const entries=await select('SELECT id,kind,amount,currency,reference,actorId,createdAt FROM '+table+' WHERE payrollId = ? AND id < ? ORDER BY id DESC LIMIT 26',[payrollId,before],t);
        return {employeeId:locked.employee_id,period:period.name,writable,rows:entries.slice(0,25),hasMore:entries.length>25};
      }
      const {kind,amount,currency,reference,commandKey}=req.body || {};
      if(Object.keys(req.body || {}).some(k=>!['kind','amount','currency','reference','commandKey'].includes(k)) ||
        !['commission','bonus','allowance','deduction'].includes(kind) || typeof amount!=='string' || !/^(0|[1-9]\d{0,11})(\.\d{1,4})?$/.test(amount) || !Number(amount) ||
        typeof currency!=='string' || !/^[A-Z]{3}$/.test(currency) || typeof reference!=='string' || !reference.trim() || reference.trim().length>240 ||
        typeof commandKey!=='string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(commandKey))fail(400,'Choose a component and enter positive amount, currency, reference and retry key');
      const [prior]=await select('SELECT id,(payrollId = ? AND actorId = ? AND kind = ? AND amount = CAST(? AS DECIMAL(16,4)) AND currency = ? AND BINARY reference = BINARY ?) AS matchesRecord FROM '+table+' WHERE commandKey = ?',[payrollId,actor.id,kind,amount,currency,reference.trim(),commandKey],t);
      if(prior){if(!Number(prior.matchesRecord))fail(409,'Retry key belongs to different content');return {id:prior.id,replayed:true};}
      if(currency!=='PKR')fail(400,'New payroll components use PKR');
      if(!writable)fail(409,'Finalized payroll is read-only');
      const [id]=await sequelize.query('INSERT INTO '+table+' (payrollId,actorId,kind,amount,currency,reference,commandKey,createdAt) VALUES(?,?,?,?,?,?,?,NOW())',{transaction:t,replacements:[payrollId,actor.id,kind,amount,currency,reference.trim(),commandKey]});
      return {id,replayed:false};
    });
    return res.json(result);
  }catch(e){return res.status(e.status || 500).json({message:e.status ? e.message : 'Payroll component records unavailable'});}
};
