const {Validator, QueryTypes}=require("sequelize");
const date=x=>typeof x==="string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && x>="1000-01-01" && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0,10)===x;
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
module.exports=({sequelize,DocumentExpiryEvent:Event,EmployeeDocumentRevision:Revision,EmployeeDocumentDraft:Document},access)=>{
  async function details(req,res){
    try{
      const id=access.id(req.params.revisionId);
      const result=await sequelize.transaction(async transaction=>{
        await access.actor(req,transaction);
        if(!await Revision.findByPk(id,{attributes:["id"],transaction}))fail(404,"Revision unavailable");
        return Event.findOne({where:{revisionId:id},order:[["version","DESC"]],transaction});
      });
      res.json({data:result});
    }catch(e){access.error(res,e);}
  }
  async function queue(req,res){
    try{
      const {asOf}=req.query,before=req.query.before===undefined?2147483648:Number(req.query.before);
      if(!date(asOf)||!Number.isSafeInteger(before)||before<=0)fail(400,"Choose a valid report date and cursor");
      const rows=await sequelize.transaction(async transaction=>{
        await access.actor(req,transaction);
        const sql=`SELECT e.revisionId,e.expiryDate,e.reminderDate,r.title,r.number,d.employeeId,u.fullName
        FROM document_expiry_events e
        JOIN employee_document_revisions r ON r.id=e.revisionId
        JOIN employee_document_drafts d ON d.id=r.documentId AND d.version=r.number
        JOIN users u ON u.id=d.employeeId
        WHERE e.reminderDate <= :asOf AND e.revisionId < :before
        AND NOT EXISTS (SELECT 1 FROM document_expiry_events newer WHERE newer.revisionId=e.revisionId AND newer.version>e.version)
        ORDER BY e.revisionId DESC LIMIT 26`;
        return sequelize.query(sql,{replacements:{asOf,before},type:QueryTypes.SELECT,transaction});
      });
      res.json({data:{rows:rows.slice(0,25),hasMore:rows.length>25}});
    }catch(e){access.error(res,e);}
  }
  async function write(req,res){
    try{
      const {revisionId,commandKey,expectedVersion,expiryDate,reminderDate,reason}=req.body;
      if(!Number.isSafeInteger(revisionId)||revisionId<1||typeof commandKey!=="string"||!Validator.isUUID(commandKey,4)||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||
        typeof reason!=="string"||!reason.trim()||reason.trim().length>600)fail(400,"Choose a valid revision and enter a reason");
      if(!(expiryDate===null&&reminderDate===null)&&!(date(expiryDate)&&date(reminderDate)&&reminderDate<=expiryDate))fail(400,"Set both dates with reminder on or before expiry, or clear both");
      const result=await sequelize.transaction(async transaction=>{
        await access.actor(req,transaction);
        const revision=await Revision.findByPk(revisionId,{transaction,lock:transaction.LOCK.UPDATE});
        if(!revision)fail(404,"Revision unavailable");
        const prior=await Event.findByPk(commandKey,{transaction});
        if(prior){
          if(prior.revisionId!==revisionId||prior.actorId!==req.user.id||prior.version!==expectedVersion+1||prior.expiryDate!==expiryDate||prior.reminderDate!==reminderDate||prior.reason!==reason.trim())fail(409,"Command bound to different content");
          return prior;
        }
        const doc=await Document.findByPk(revision.documentId,{transaction,lock:transaction.LOCK.UPDATE});
        if(doc.version!==revision.number)fail(409,"This document revision has been superseded");
        const current=await Event.findOne({where:{revisionId},order:[["version","DESC"]],transaction});
        if((current?.version??0)!==expectedVersion)fail(409,"Reminder changed. Refresh before editing.");
        if((current?.expiryDate??null)===expiryDate&&(current?.reminderDate??null)===reminderDate)fail(409,"These dates are already recorded");
        return Event.create({revisionId,commandKey,version:expectedVersion+1,actorId:req.user.id,expiryDate,reminderDate,reason:reason.trim()},{transaction});
      });
      res.json({data:result});
    }catch(e){access.error(res,e);}
  }
  return {details,queue,write};
};
