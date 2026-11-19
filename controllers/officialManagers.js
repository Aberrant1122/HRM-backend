const crypto=require('node:crypto'),{Op}=require('sequelize'),m=require('../models');
const target=require('../utils/organizationTarget'),validateGraph=require('../utils/officialManagerGraph');
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const attrs=['id','fullName','email','role','status'];
function id(req){const n=Number(req.params.employeeId);if(!/^\d+$/.test(req.params.employeeId)||!Number.isSafeInteger(n)||n<1)fail(400,'Valid employee account required');return n;}
function error(res,e){if(Number.isInteger(e.code))return res.status(e.code).json({message:e.message});if(['SequelizeUniqueConstraintError','SequelizeForeignKeyConstraintError'].includes(e.name))return res.status(409).json({message:'Record changed; reload before continuing'});console.error('Official reporting workflow unavailable',e.name);return res.status(500).json({message:'Official reporting workflow unavailable'});}
async function snapshot(employeeId,before,t){
 const employee=await m.User.findByPk(employeeId,{attributes:attrs,transaction:t});if(!employee)fail(404,'Account not found');
 const assignment=await m.OfficialManagerSet.findOne({where:{employeeId},transaction:t});
 const history=await m.OfficialManagerEvent.findAll({where:{employeeId,...(before&&{version:{[Op.lt]:before}})},order:[['version','DESC']],limit:26,transaction:t});
 const ids=[...new Set([...(assignment?.managerIds||[]),...history.map(e=>e.actorId)])];
 const people=ids.length?await m.User.findAll({where:{id:ids},attributes:attrs,transaction:t}):[];
 const primary=await m.OrganizationAssignment.findOne({where:{employeeId},attributes:['managerId','version'],transaction:t});
 const graphRows=assignment?await m.OfficialManagerSet.findAll({attributes:['employeeId','managerIds','version'],transaction:t}):[],graph=new Map(graphRows.map(row=>[row.employeeId,row]));
 const hierarchy=[],seen=new Set([employeeId]),queue=[...(assignment?.managerIds||[])];
 while(queue.length&&hierarchy.length<1000){const uid=queue.shift();if(seen.has(uid))continue;seen.add(uid);const set=graph.get(uid);hierarchy.push({accountId:uid,configured:!!set,managerIds:set?.managerIds||[],version:set?.version??null});for(const parent of set?.managerIds||[])if(!seen.has(parent))queue.push(parent);}
 const ancestors=hierarchy.length?await m.User.findAll({where:{id:hierarchy.map(n=>n.accountId)},attributes:attrs,transaction:t}):[],ancestorMap=new Map(ancestors.map(p=>[p.id,p]));for(const node of hierarchy)node.person=ancestorMap.get(node.accountId)||null;
 return{employee,assignment,people,hierarchy,hierarchyTruncated:queue.length>0,history:history.slice(0,25),hasEarlierHistory:history.length>25,primaryReference:primary,scope:'Explicit official relationships only; primary references are separate. Relationships grant no access.'};
}
exports.read=async(req,res)=>{try{const employeeId=id(req);if(Object.keys(req.query).some(k=>k!=='before'))fail(400,'Unsupported query');const before=req.query.before===undefined?undefined:Number(req.query.before);if(req.query.before!==undefined&&(!/^\d+$/.test(req.query.before)||!Number.isSafeInteger(before)||before<1))fail(400,'Valid history cursor required');const data=await m.sequelize.transaction({isolationLevel:'REPEATABLE READ',readOnly:true},t=>snapshot(employeeId,before,t));return res.json({success:true,data});}catch(e){return error(res,e);}};
exports.command=async(req,res)=>{try{
 const employeeId=id(req),b=req.body;
 if(!b||Array.isArray(b)||Object.keys(b).some(k=>!['commandKey','expectedVersion','managerIds','reason','employmentAsOf'].includes(k)))fail(400,'Valid official reporting command required');
 if(typeof b.commandKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.commandKey)||!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<0)fail(400,'UUID and expected version required');
 if(!Array.isArray(b.managerIds)||b.managerIds.length>100||b.managerIds.some(n=>!Number.isSafeInteger(n)||n<=0)||new Set(b.managerIds).size!==b.managerIds.length)fail(400,'Select up to 100 distinct manager accounts');
 if(b.managerIds.includes(employeeId))fail(400,'An account cannot report to itself');
 if(typeof b.reason!=='string'||!b.reason.trim()||b.reason.trim().length>1000)fail(400,'Reason must contain 1–1000 characters');
 if(b.employmentAsOf!==undefined&&!target.civil(b.employmentAsOf))fail(400,'Valid employment reference date required');
 const input={actorId:req.user.id,employeeId,expectedVersion:b.expectedVersion,managerIds:[...b.managerIds].sort((a,b)=>a-b),reason:b.reason.trim(),employmentAsOf:b.employmentAsOf??null};
 const key=b.commandKey.toLowerCase(),hash=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const outcome=await m.sequelize.transaction({isolationLevel:'READ COMMITTED'},async t=>{
  const graph=await m.OrganizationState.findByPk(1,{transaction:t,lock:t.LOCK.UPDATE});if(!graph)fail(503,'Organization state unavailable');
  const users=new Map();for(const uid of [...new Set([employeeId,req.user.id,...input.managerIds])].sort((a,b)=>a-b))users.set(uid,await m.User.findByPk(uid,{transaction:t,lock:t.LOCK.UPDATE}));
  const actor=users.get(req.user.id),employee=users.get(employeeId);if(!actor||actor.role!=='admin'||actor.status!=='active'||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))fail(403,'Current administrator required');if(!employee)fail(404,'Account not found');
  const prior=await m.OfficialManagerEvent.findOne({where:{commandKey:key},transaction:t});if(prior){if(prior.payloadHash!==hash)fail(409,'Command key is bound to different content');return{replayed:true,appliedVersion:prior.version};}
  const current=await m.OfficialManagerSet.findOne({where:{employeeId},transaction:t,lock:t.LOCK.UPDATE});if((current?.version??0)!==input.expectedVersion)fail(409,'Official reporting set changed; reload');
  const eligibility=await target.evidence(m,employee,input.employmentAsOf,t);if(!eligibility.allowed)fail(409,'Employee is outside the configured organization target scope');
  const oldIds=current?.managerIds||[],managerEvidence=[];
  for(const uid of input.managerIds){const user=users.get(uid);if(!user)fail(400,'Manager account not found');const evidence=await target.evidence(m,user,input.employmentAsOf,t);if(!oldIds.includes(uid)&&(!evidence.allowed||user.status!=='active'))fail(400,'New managers must be active accounts in the configured organization scope');managerEvidence.push({id:uid,fullName:user.fullName,role:user.role,status:user.status,eligibility:evidence});}
  const rows=await m.OfficialManagerSet.findAll({attributes:['employeeId','managerIds'],transaction:t});validateGraph(rows,employeeId,input.managerIds);
  const version=input.expectedVersion+1,before=current?.toJSON()??null;
  const saved=current?await current.update({managerIds:input.managerIds,version},{transaction:t}):await m.OfficialManagerSet.create({employeeId,managerIds:input.managerIds,version,createdBy:actor.id},{transaction:t});
  await m.OfficialManagerLink.destroy({where:{employeeId},transaction:t});
  if(input.managerIds.length)await m.OfficialManagerLink.bulkCreate(input.managerIds.map(managerId=>({employeeId,managerId})),{transaction:t});
  await m.OfficialManagerEvent.create({employeeId,actorId:actor.id,commandKey:key,payloadHash:hash,version,details:{before,after:saved.toJSON(),reason:input.reason,employeeEligibility:eligibility,managers:managerEvidence,actor:{id:actor.id,fullName:actor.fullName}}},{transaction:t});
  await graph.increment('version',{transaction:t});return{replayed:false,appliedVersion:version};
 });return res.json({success:true,...outcome,data:await m.sequelize.transaction({isolationLevel:'REPEATABLE READ',readOnly:true},t=>snapshot(employeeId,undefined,t))});
 }catch(e){return error(res,e);}};
