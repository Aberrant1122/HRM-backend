const {createHash}=require('crypto');
const {Op,QueryTypes}=require('sequelize');
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='1000-01-01'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
exports.validDate=validDate;
exports.stage=task=>['open','in_progress'].includes(task.status)?'submission':task.status==='pending_approval'?'approval':null;
exports.overdue=asOf=>({[Op.or]:[
 {status:{[Op.in]:['open','in_progress']},submissionDueDate:{[Op.lt]:asOf}},
 {status:'pending_approval',approvalDueDate:{[Op.lt]:asOf}}
]});
exports.controller=({sequelize,HrTask:Task},tasks)=>async(req,res)=>{
 const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
 try{
  const taskId=Number(req.params.taskId),write=req.method==='POST',before=Number(req.query.before ?? Number.MAX_SAFE_INTEGER),b=req.body || {};
  if(!Number.isSafeInteger(taskId)||taskId<1||!Number.isSafeInteger(before)||before<1||Object.keys(req.query).some(k=>write||k!=='before'))fail(400,'Invalid task or history page');
  if(write&&(Object.keys(b).some(k=>!['expectedVersion','taskVersion','submissionDueDate','approvalDueDate','reason','commandKey'].includes(k))||
   !Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<0||!Number.isSafeInteger(b.taskVersion)||b.taskVersion<1||
   ![b.submissionDueDate,b.approvalDueDate].every(d=>d===null||validDate(d))||
   typeof b.reason!=='string'||!b.reason.trim()||b.reason.trim().length>500||typeof b.commandKey!=='string'||!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(b.commandKey)))fail(400,'Enter stage dates or explicitly clear them, a reason and versions');
  const data=await sequelize.transaction({isolationLevel:'READ COMMITTED'},async t=>{
   await tasks.actor(req,t);const task=await Task.findByPk(taskId,{transaction:t,lock:t.LOCK.UPDATE});if(!task)fail(404,'Task not found');
   const select=(query,replacements)=>sequelize.query(query,{replacements,transaction:t,type:QueryTypes.SELECT});
   if(!write){
    const rows=await select('SELECT version,submissionDueDate,approvalDueDate,reason,actorId,createdAt FROM hr_task_deadline_events WHERE taskId = ? AND version < ? ORDER BY version DESC LIMIT 11',[taskId,before]);
    return {taskVersion:task.version,version:task.deadlineVersion,submissionDueDate:task.submissionDueDate,approvalDueDate:task.approvalDueDate,legacyDueDate:task.dueDate,rows:rows.slice(0,10),hasMore:rows.length>10};
   }
   const hash=createHash('sha256').update(JSON.stringify([taskId,req.user.id,b.expectedVersion,b.taskVersion,b.submissionDueDate,b.approvalDueDate,b.reason.trim()])).digest('hex');
   const [prior]=await select('SELECT version,payloadHash FROM hr_task_deadline_events WHERE commandKey = ?',[b.commandKey]);
   if(prior){if(prior.payloadHash!==hash)fail(409,'Retry key belongs to another change');return {version:prior.version,replayed:true};}
   if(!['open','in_progress','pending_approval'].includes(task.status)||task.version!==b.taskVersion||task.deadlineVersion!==b.expectedVersion)fail(409,'Task or stage deadlines changed; reload before editing');
   if(task.submissionDueDate===b.submissionDueDate&&task.approvalDueDate===b.approvalDueDate)fail(409,'Stage deadlines match the current dates');
   const version=task.deadlineVersion+1;
   await task.update({submissionDueDate:b.submissionDueDate,approvalDueDate:b.approvalDueDate,deadlineVersion:version},{transaction:t});
   await sequelize.query('INSERT INTO hr_task_deadline_events (taskId,actorId,version,submissionDueDate,approvalDueDate,reason,commandKey,payloadHash,createdAt) VALUES(?,?,?,?,?,?,?,?,NOW())',{transaction:t,replacements:[taskId,req.user.id,version,b.submissionDueDate,b.approvalDueDate,b.reason.trim(),b.commandKey,hash]});
   return {version,replayed:false};
  });return res.json({data});
 }catch(e){return tasks.error(res,e);}
};
