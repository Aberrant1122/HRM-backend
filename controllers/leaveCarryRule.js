const {createHash}=require('crypto');
const {QueryTypes}=require('sequelize');
const models=require('../models');
const charging=require('../utils/leaveCharging');
const assigned=require('../utils/assignedLeavePolicy'),balance=require('../utils/leaveBalance');
const table='leave_carry_rule_revisions',positive=n=>Number.isSafeInteger(n)&&n>0;
const sql=(query,replacements,transaction)=>models.sequelize.query(query,{replacements,transaction,type:QueryTypes.SELECT});
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
module.exports=async(req,res)=>{
 try{
  const employeeId=Number(req.params.employeeId),typeId=Number(req.params.typeId),target=req.query.target;
  const write=req.method==='POST',before=Number(req.query.before ?? Number.MAX_SAFE_INTEGER);
  if(!positive(employeeId)||!positive(typeId)||!positive(before)||!charging.civil(target)||Object.keys(req.query).some(k=>k!=='target'&&(write||k!=='before')))fail(400,'Select an employee, leave type and exact target period start');
  const b=req.body || {};
  if(write && (Object.keys(b).some(k=>!['policyId','expectedRevision','mode','cap','expiry','reason','commandKey'].includes(k)) ||
   !positive(b.policyId) || !Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0||!['none','capped','uncapped'].includes(b.mode) ||
   (b.mode==='capped' ? !(typeof b.cap==='number' && b.cap>0 && Number.isSafeInteger(b.cap*2) && b.cap<=2147483647) : b.cap!==null) ||
   (b.expiry!==null && (!charging.civil(b.expiry)||b.expiry<target||b.mode==='none')) || typeof b.reason!=='string'||!b.reason.trim()||b.reason.trim().length>500 ||
   typeof b.commandKey!=='string'||!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(b.commandKey)))fail(400,'Enter a valid carry rule, cap/expiry and reason');
  const result=await models.sequelize.transaction({isolationLevel:'REPEATABLE READ'},async t=>{
   const opts={transaction:t,lock:t.LOCK.UPDATE};
   const users=new Map();for(const id of [...new Set([req.user.id,employeeId])].sort((a,b)=>a-b))users.set(id,await models.User.findByPk(id,{...opts,attributes:['id','role','status','sessionVersion']}));
   const actor=users.get(req.user.id);
   if(!actor || actor.status!=='active'|| actor.role!=='admin' || Number(actor.sessionVersion)!==Number(req.user.sessionVersion || 0))fail(403,'Current administrator required');
   const policy=await assigned(models,employeeId,typeId,t);
   if(!charging.configured(policy.rules)||charging.period(target,policy.rules).periodStart!==target)fail(409,'Choose the explicit reset date of the assigned leave policy');
   await models.LeavePolicy.findByPk(policy.policyId,opts);
   const keys=[policy.policyId,typeId,target],where=' WHERE policyId = ? AND typeId = ? AND targetStart = ? ';
   const [latest]=await sql('SELECT revision,mode,cap,expiry FROM '+table+where+'ORDER BY revision DESC LIMIT 1 FOR UPDATE',keys,t);
   const version=latest?.revision || 0;
   if(!write){
    const sourceEnd=new Date(Date.parse(target+'T00:00:00Z')-86400000).toISOString().slice(0,10);
    let source=null,preview=null,previewIssue=null;
    try{
     source=await balance(models,employeeId,typeId,sourceEnd,t);
     if(latest&&source.remainingUnits>=0)preview=latest.mode==='none'?0:latest.mode==='capped'?Math.min(source.remainingUnits,Number(latest.cap)):source.remainingUnits;
     if(source.remainingUnits<0)previewIssue='Negative balances require an explicit handling policy';
    }catch(e){if(e.code!==409)throw e;previewIssue=e.message;}
    const rows=await sql('SELECT revision,mode,cap,expiry,reason,createdAt,actorId FROM '+table+where+'AND revision < ? ORDER BY revision DESC LIMIT 11',[...keys,before],t);
    return {policyId:policy.policyId,policyName:policy.policyName,targetStart:target,sourceEnd,sourceRemaining:source?.remainingUnits ?? null,preview,previewIssue,version,rows:rows.slice(0,10),hasMore:rows.length>10};
   }
   if(policy.policyId!==b.policyId)fail(409,'Assigned policy changed');
   const hash=createHash('sha256').update(JSON.stringify([policy.policyId,typeId,target,actor.id,b.expectedRevision,b.mode,b.cap,b.expiry,b.reason.trim()])).digest('hex');
   const [prior]=await sql('SELECT revision,payloadHash FROM '+table+' WHERE commandKey = ?',[b.commandKey],t);
   if(prior){if(prior.payloadHash!==hash)fail(409,'Retry key belongs to a different change');return {revision:prior.revision,replayed:true};}
   if(b.expectedRevision!==version)fail(409,'Carry rule changed; reload first');
   await models.sequelize.query('INSERT INTO '+table+' (policyId,typeId,targetStart,actorId,revision,mode,cap,expiry,reason,commandKey,payloadHash,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,NOW())',
    {transaction:t,replacements:[...keys,actor.id,version+1,b.mode,b.cap,b.expiry,b.reason.trim(),b.commandKey,hash]});
   return {revision:version+1,replayed:false};
  });
  return res.json(result);
 }catch(e){const code=Number.isInteger(e.code)?e.code:500;return res.status(code).json({message:code===500?'Carry-forward rule unavailable':e.message});}
};
