const {createHash}=require('crypto');
const {QueryTypes}=require('sequelize');
const {sequelize,OffboardingCase,OffboardingItem,User}=require('../models');
const table='settlement_handoff_events';
const sql=(query,replacements,transaction)=>sequelize.query(query,{replacements,transaction,type:QueryTypes.SELECT});
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const positive=n=>Number.isSafeInteger(n)&&n>0;
module.exports=async(req,res)=>{
 try{
  const employeeId=Number(req.params.employeeId), writing=req.method==='POST';
  if(!positive(employeeId) || !/^\d+$/.test(req.params.employeeId) || Object.keys(req.query).some(k=>writing || k!=='before'))fail(400,'Invalid employee or request');
  const before=req.query.before===undefined?Number.MAX_SAFE_INTEGER:Number(req.query.before);if(!positive(before))fail(400,'Invalid history page');
  const b=req.body || {};
  if(writing && (!['assign','receive'].includes(b.action) || !positive(b.caseVersion) || !positive(b.recipientId) ||
    !Number.isSafeInteger(b.expectedSequence) || b.expectedSequence<0 || typeof b.note!=='string' || !b.note.trim() || b.note.trim().length>500 ||
    typeof b.commandKey!=='string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(b.commandKey) ||
    Object.keys(b).some(k=>!['action','caseVersion','expectedSequence','recipientId','note','commandKey'].includes(k))))fail(400,'Valid handoff, recipient, version and note required');
  const data=await sequelize.transaction({isolationLevel:'READ COMMITTED'},async t=>{
   const opts={transaction:t,lock:t.LOCK.UPDATE}, users=new Map();
   for(const id of [...new Set(writing?[req.user.id,b.recipientId]:[req.user.id])].sort((a,c)=>a-c)){
    users.set(id,await User.findByPk(id,{...opts,attributes:['id','role','status','sessionVersion','fullName']}));
   }
   const admin=users.get(req.user.id);
   if(!admin || admin.role!=='admin' || admin.status!=='active' || Number(admin.sessionVersion)!==Number(req.user.sessionVersion || 0))fail(403,'Current administrator required');
   const record=await OffboardingCase.findOne({where:{employeeId},...opts});if(!record)fail(404,'Offboarding case not found');
   const [last]=await sql('SELECT sequence,recipientId,action FROM '+table+' WHERE caseId = ? ORDER BY sequence DESC LIMIT 1',[record.id],t);
   const sequence=last?.sequence || 0;
   if(!writing){
    const rows=await sql('SELECT e.id,e.sequence,e.action,e.actorId,e.recipientId,e.caseVersion,e.clearanceStatus,e.pendingItems,e.note,e.createdAt,a.fullName AS actorName,r.fullName AS recipientName FROM '+table+' e JOIN users a ON a.id=e.actorId JOIN users r ON r.id=e.recipientId WHERE caseId = ? AND sequence < ? ORDER BY sequence DESC LIMIT 26',[record.id,before],t);
    return {caseVersion:record.version,sequence,canReceive:last?.action==='assign' && last.recipientId===admin.id,rows:rows.slice(0,25),hasMore:rows.length>25};
   }
   const hash=createHash('sha256').update(JSON.stringify([employeeId,admin.id,b.action,b.recipientId,b.caseVersion,b.expectedSequence,b.note.trim()])).digest('hex');
   const [prior]=await sql('SELECT id,payloadHash FROM '+table+' WHERE commandKey = ?',[b.commandKey],t);
   if(prior){if(prior.payloadHash!==hash)fail(409,'Retry key belongs to another handoff');return {id:prior.id,replayed:true};}
   if(record.version!==b.caseVersion || sequence!==b.expectedSequence)fail(409,'Clearance or handoff changed; reload first');
   const recipient=users.get(b.recipientId);
   if(!recipient || recipient.status!=='active' || recipient.role!=='admin')fail(409,'Choose an active payroll administrator');
   if(b.action==='receive' && (last?.action!=='assign' || admin.id!==last.recipientId || b.recipientId!==admin.id))fail(403,'Only the assigned recipient can acknowledge this handoff');
   if(b.action==='assign' && last?.action==='assign' && last.recipientId===recipient.id)fail(409,'This handoff is already assigned to the selected recipient');
   const pending=await OffboardingItem.count({where:{caseId:record.id,status:'pending'},transaction:t});
   const [id]=await sequelize.query('INSERT INTO '+table+' (caseId,actorId,recipientId,action,caseVersion,note,sequence,clearanceStatus,pendingItems,commandKey,payloadHash,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,NOW())',
    {transaction:t,replacements:[record.id,admin.id,recipient.id,b.action,record.version,b.note.trim(),sequence+1,record.status,pending,b.commandKey,hash]});
   return {id,replayed:false};
  });return res.json(data);
 }catch(e){return res.status(e.status || 500).json({message:e.status ? e.message : 'Settlement handoff unavailable'});}
};

module.exports.inbox=async(req,res)=>{
 try{
  const before=req.query.before===undefined?Number.MAX_SAFE_INTEGER:Number(req.query.before);
  if(!positive(before) || Object.keys(req.query).some(k=>k!=='before'))fail(400,'Invalid inbox page');
  const items=await sql('SELECT e.id,e.sequence,e.note,e.createdAt,c.employeeId,u.fullName FROM '+table+' e JOIN offboarding_cases c ON c.id=e.caseId JOIN users u ON u.id=c.employeeId WHERE e.recipientId = ? AND e.action = ? AND e.id < ? AND NOT EXISTS(SELECT 1 FROM '+table+' n WHERE n.caseId=e.caseId AND n.sequence>e.sequence) ORDER BY e.id DESC LIMIT 26',[req.user.id,'assign',before]);
  return res.json({rows:items.slice(0,25),hasMore:items.length>25});
 }catch(e){return res.status(e.status || 500).json({message:e.status ? e.message : 'Settlement inbox unavailable'});}
};
