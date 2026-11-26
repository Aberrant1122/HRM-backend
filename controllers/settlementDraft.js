const {createHash}=require('crypto');
const {Decimal}=require('decimal.js');
const {QueryTypes}=require('sequelize');
const {sequelize,User,OffboardingCase}=require('../models');
const table='settlement_draft_revisions';
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const sql=(query,replacements,transaction)=>sequelize.query(query,{replacements,transaction,type:QueryTypes.SELECT});
function normalize(b){
 if(!b || Object.keys(b).some(k=>!['currency','items','reason','expectedRevision','commandKey'].includes(k)) ||
  typeof b.currency!=='string' || !/^[A-Z]{3}$/.test(b.currency) || typeof b.reason!=='string' || !b.reason.trim() || b.reason.trim().length>500 ||
  !Number.isSafeInteger(b.expectedRevision) || b.expectedRevision<0 || typeof b.commandKey!=='string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(b.commandKey) ||
  !Array.isArray(b.items) || b.items.length<1 || b.items.length>50)fail(400,'Currency, 1–50 items, revision and reason required');
 const items=b.items.map(item=>{
  if(!item || Object.keys(item).some(k=>!['kind','label','amount'].includes(k)) || !['credit','deduction'].includes(item.kind) ||
   typeof item.label!=='string' || !item.label.trim() || item.label.trim().length>160 ||
   typeof item.amount!=='string' || !/^(0|[1-9]\d{0,11})(\.\d{1,4})?$/.test(item.amount) || !Number(item.amount))fail(400,'Each item needs a direction, description and positive amount');
  return {kind:item.kind,label:item.label.trim(),amount:new Decimal(item.amount).toFixed(4)};
 });
 const total=kind=>items.filter(i=>i.kind===kind).reduce((a,i)=>a.plus(i.amount),new Decimal(0));
 const credit=total('credit'),deduction=total('deduction');
 return {currency:b.currency,reason:b.reason.trim(),expectedRevision:b.expectedRevision,items,credit:credit.toFixed(4),deduction:deduction.toFixed(4),net:credit.minus(deduction).toFixed(4)};
}
module.exports=async(req,res)=>{
 try{
  const id=Number(req.params.employeeId),write=req.method==='POST',before=Number(req.query.before ?? Number.MAX_SAFE_INTEGER);
  if(!/^\d+$/.test(req.params.employeeId) || !Number.isSafeInteger(id) || id<1 || Object.keys(req.query).some(k=>write || k!=='before') || !Number.isSafeInteger(before) || before<1)fail(400,'Invalid employee or history cursor');
  const body=write?normalize(req.body):null;
  const result=await sequelize.transaction({isolationLevel:'READ COMMITTED'},async t=>{
   const opts={transaction:t,lock:t.LOCK.UPDATE};
   const actor=await User.findByPk(req.user.id,{...opts,attributes:['id','role','status','sessionVersion']});
   if(!actor || actor.role!=='admin' || actor.status!=='active' || Number(actor.sessionVersion)!==Number(req.user.sessionVersion || 0))fail(403,'Current payroll administrator required');
   const c=await OffboardingCase.findOne({where:{employeeId:id},...opts});if(!c)fail(404,'Employee offboarding case not found');
   if(!write){
    const rows=await sql('SELECT r.revision,r.currency,r.credit,r.deduction,r.net,r.items,r.reason,r.createdAt,r.actorId,u.fullName AS actorName FROM '+table+' r JOIN users u ON u.id=r.actorId WHERE r.caseId = ? AND r.revision < ? ORDER BY r.revision DESC LIMIT 11',[c.id,before],t);
    return {rows:rows.slice(0,10),hasMore:rows.length>10};
   }
   const hash=createHash('sha256').update(JSON.stringify([id,actor.id,body])).digest('hex');
   const [prior]=await sql('SELECT revision,payloadHash FROM '+table+' WHERE commandKey = ?',[req.body.commandKey],t);
   if(prior){if(prior.payloadHash!==hash)fail(409,'Retry key belongs to other content');return {revision:prior.revision,replayed:true};}
   const [latest]=await sql('SELECT revision,currency FROM '+table+' WHERE caseId = ? ORDER BY revision DESC LIMIT 1',[c.id],t);
   if((latest?.revision || 0)!==body.expectedRevision)fail(409,'Settlement draft changed; reload before revising');
   if(body.currency!==(latest?.currency || 'PKR'))fail(400,'Use PKR for new drafts and retain the currency on a recorded draft');
   const version=body.expectedRevision+1;
   await sequelize.query('INSERT INTO '+table+' (caseId,actorId,revision,reason,currency,items,credit,deduction,net,commandKey,payloadHash,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,NOW())',
    {transaction:t,replacements:[c.id,actor.id,version,body.reason,body.currency,JSON.stringify(body.items),body.credit,body.deduction,body.net,req.body.commandKey,hash]});
   return {revision:version,replayed:false};
  });
  return res.json(result);
 }catch(e){const code=Number.isInteger(e.code)?e.code:500;return res.status(code).json({message:code===500?'Settlement draft unavailable':e.message});}
};
