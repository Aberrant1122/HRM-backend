const {QueryTypes}=require('sequelize');
module.exports=(m,c)=>{
  const router=require('express').Router(),{sequelize,User,EmployeeDocumentRevision:Revision,EmployeeDocumentDraft:Document}=m;
  function reject(code,message){throw Object.assign(Error(message),{code});}
  async function recipient(req,t){
    const user=await User.findByPk(req.user.id,{transaction:t,lock:t.LOCK.UPDATE});
    if(!user||user.status!=='active'||user.role!==req.user.role||!['admin','hr','employee','manager'].includes(user.role)||Number(user.sessionVersion)!==Number(req.user.sessionVersion??0))reject(403,'Current internal account required');
    return user.id;
  }
  const select=(sql,transaction,replacements)=>sequelize.query(sql,{type:QueryTypes.SELECT,transaction,replacements});
  async function owned(req,t,id){
    const uid=await recipient(req,t);
    const [row]=await select('SELECT * FROM employee_document_deliveries WHERE revisionId = ? AND recipientId = ? FOR UPDATE',t,[id,uid]);
    if(!row)reject(404,'Delivery unavailable');
    return row;
  }
  function action(fn){return async(req,res)=>{try{const data=await sequelize.transaction(t=>fn(req,t));res.json({success:true,data});}catch(e){c.error(res,e);}};}
  router.get('/mine',action(async(req,t)=>{
    const uid=await recipient(req,t);
    const before=req.query.before===undefined?null:c.id(req.query.before);
    const rows=await select("SELECT d.revisionId,d.sharedAt,d.acknowledgedAt,r.title,r.number,COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.attachment,'$.format')),'pdf') format,JSON_UNQUOTE(JSON_EXTRACT(r.attachment,'$.filename')) filename FROM employee_document_deliveries d JOIN employee_document_revisions r ON r.id=d.revisionId WHERE d.recipientId = ? AND (? IS NULL OR d.revisionId < ?) ORDER BY d.revisionId DESC LIMIT 51",t,[uid,before,before]);
    return {rows:rows.slice(0,50),hasMore:rows.length>50};
  }));
  router.get('/mine/:revisionId/download',(req,res)=>c.download(req,res,(t,id)=>owned(req,t,id)));
  router.post('/mine/:revisionId/acknowledge',action(async(req,t)=>{
    const id=c.id(req.params.revisionId),row=await owned(req,t,id);
    if(!row.acknowledgedAt)await sequelize.query('UPDATE employee_document_deliveries SET acknowledgedAt=CURRENT_TIMESTAMP(3) WHERE revisionId = ? AND acknowledgedAt IS NULL',{transaction:t,replacements:[id]});
    return (await select('SELECT revisionId,recipientId,sharedAt,acknowledgedAt FROM employee_document_deliveries WHERE revisionId = ?',t,[id]))[0];
  }));
  router.get('/staff/:revisionId',action(async(req,t)=>{
    await c.actor(req,t);return (await select('SELECT * FROM employee_document_deliveries WHERE revisionId = ?',t,[c.id(req.params.revisionId)]))[0]||null;
  }));
  router.post('/staff/:revisionId/share',action(async(req,t)=>{
    const id=c.id(req.params.revisionId),uid=req.body?.recipientId;
    if(!Number.isSafeInteger(uid)||uid<=0)reject(400,'Select an explicit recipient');
    const users=await c.actor(req,t,uid),user=users.get(uid);
    if(!user||user.status!=='active'||!['admin','hr','employee','manager'].includes(user.role))reject(409,'Active internal recipient required');
    const revision=await Revision.findByPk(id,{transaction:t});
    const doc=revision&&await Document.findByPk(revision.documentId,{transaction:t,lock:t.LOCK.UPDATE});
    if(!doc||doc.employeeId!==uid)reject(409,'Recipient must own the document');
    const [existing]=await select('SELECT * FROM employee_document_deliveries WHERE revisionId = ? FOR UPDATE',t,[id]);
    if(existing)return existing;
    if(doc.version!==revision.number)reject(409,'Refresh to share the current revision');
    await sequelize.query('INSERT INTO employee_document_deliveries (revisionId,recipientId,sharedBy) VALUES (?,?,?)',{transaction:t,replacements:[id,uid,req.user.id]});
    return (await select('SELECT * FROM employee_document_deliveries WHERE revisionId = ?',t,[id]))[0];
  }));return router;
};
