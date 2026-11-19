const {Validator}=require("sequelize");
module.exports=({sequelize,HrTask:Task,HrTaskNotice:Notice,HrTaskApprovalGrant:Grant},tasks)=>{
 const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
 const uuid=x=>typeof x==="string"&&Validator.isUUID(x,4);
 const civil=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&x>="1000-01-01"&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
 async function send(req,res){
  try{
   const {id,taskId,expectedVersion,asOf,expectedDeadlineVersion,approvalRecipientId}=req.body;
   if(!uuid(id)||!Number.isSafeInteger(taskId)||taskId<1||!Number.isSafeInteger(expectedVersion)||expectedVersion<1||!civil(asOf)||(expectedDeadlineVersion!==undefined&&(!Number.isSafeInteger(expectedDeadlineVersion)||expectedDeadlineVersion<0))||(approvalRecipientId!==undefined&&(!Number.isSafeInteger(approvalRecipientId)||approvalRecipientId<1)))fail(400,"Choose an existing task, version and valid review date");
   const row=await sequelize.transaction({isolationLevel:"READ COMMITTED"},async transaction=>{
    const snapshot=await Task.findByPk(taskId,{attributes:["assigneeId"],transaction});if(!snapshot)fail(404,"Task unavailable");
    const users=await tasks.actor(req,transaction,approvalRecipientId??snapshot.assigneeId);
    const task=await Task.findByPk(taskId,{transaction,lock:transaction.LOCK.UPDATE});
    const prior=await Notice.findByPk(id,{transaction});
    if(prior){
      if(prior.senderId!==req.user.id||prior.taskId!==taskId||prior.taskVersion!==expectedVersion||prior.asOf!==asOf||(prior.deadlineVersion!==null&&prior.deadlineVersion!==expectedDeadlineVersion)||(prior.stage==="approval"&&prior.recipientId!==approvalRecipientId)||(prior.stage!=="approval"&&approvalRecipientId!==undefined))fail(409,"Notice ID bound to other content");
      return prior;
    }
    if(task.version!==expectedVersion||task.assigneeId!==snapshot.assigneeId)fail(409,"Task changed; reload before sending");
    const stage=require('./hrTaskDeadlines').stage(task);
    if(!stage)fail(409,"Closed tasks cannot receive overdue notices");
    const dueDate=stage==='submission'?task.submissionDueDate:task.approvalDueDate;
    if(!dueDate || dueDate>=asOf || expectedDeadlineVersion!==task.deadlineVersion)fail(409,"Check the active stage deadline and reload its current version");
    if(stage==='submission'&&approvalRecipientId!==undefined)fail(400,"Submission notices go to the task assignee");
    if(stage==='approval'&&!approvalRecipientId)fail(400,"Choose an eligible approval recipient");
    const recipientId=stage==='approval'?approvalRecipientId:task.assigneeId;
    const recipient=users.get(recipientId);
    if(!recipient||recipient.status!=="active"||!["employee","manager","admin","hr"].includes(recipient.role))fail(409,"Notice recipient must be an active internal account");
    if(stage==='approval'){
      const grant=await Grant.findByPk(recipientId,{transaction,lock:transaction.LOCK.UPDATE});
      if(!grant?.active||recipientId===task.assigneeId||recipientId===task.submittedBy||task.submittedBy!==task.assigneeId||!task.submittedAt)fail(409,"Recipient must have current independent task approval permission");
    }
    if(await Notice.findOne({where:{taskId,recipientId,asOf,stage},transaction}))fail(409,"A notice for this task, recipient and review date already exists");
    return Notice.create({id,taskId,taskVersion:task.version,stage,deadlineVersion:task.deadlineVersion,senderId:req.user.id,recipientId,taskTitle:task.title,dueDate,asOf},{transaction});
   });
   res.json({data:row});
  }catch(e){tasks.error(res,e);}
 }
 async function list(req,res){
  try{
   const page=Number(req.query.page||1);if(!Number.isSafeInteger(page)||page<1||page>1000000)fail(400,"Invalid page");
   const rows=await Notice.findAll({where:{recipientId:req.user.id},order:[["createdAt","DESC"],["id","DESC"]],limit:26,offset:(page-1)*25});
   res.json({data:{rows:rows.slice(0,25),hasMore:rows.length>25}});
  }catch(e){tasks.error(res,e);}
 }
 async function read(req,res){
  try{
   if(!uuid(req.params.id))fail(400,"Invalid notice ID");
   const row=await sequelize.transaction(async transaction=>{
    const record=await Notice.findOne({where:{id:req.params.id,recipientId:req.user.id},transaction,lock:transaction.LOCK.UPDATE});
    if(!record)fail(404,"Notice unavailable");
    return record.readAt?record:record.update({readAt:new Date()},{transaction});
   });
   res.json({data:row});
  }catch(e){tasks.error(res,e);}
 }
 return {send,list,read};
};
