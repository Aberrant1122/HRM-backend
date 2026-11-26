const {createHash}=require('crypto'),{QueryTypes}=require('sequelize');
module.exports=m=>{
 const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
 const query=(sql,replacements,transaction)=>m.sequelize.query(sql,{replacements,transaction,type:QueryTypes.SELECT});
 async function state(caseId,t,before){
  const rows=await query('SELECT * FROM settlement_final_events WHERE caseId = ? ORDER BY version DESC',[caseId],t);
  const authority=rows.find(r=>r.action==='configure')?.details||null;
  const final=rows.find(r=>r.action==='finalize')?.details||null;
  const history=rows.filter(r=>r.version<(before||2147483648)).slice(0,11);
  return {version:rows[0]?.version||0,authority,final,history:history.slice(0,10),hasMore:history.length>10};
 }
 return async(req,res)=>{
  try{
   const employeeId=Number(req.params.employeeId),write=req.method==='POST',before=req.query.before;
   if(!Number.isSafeInteger(employeeId)||employeeId<1||before!==undefined&&(!/^\d+$/.test(before)||Number(before)<1))fail(400,'Invalid employee or history cursor');
   const data=await m.sequelize.transaction({isolationLevel:'READ COMMITTED'},async t=>{
    const actor=await m.User.findByPk(req.user.id,{transaction:t,lock:t.LOCK.UPDATE});
    if(!actor||actor.role!=='admin'||req.user.role!==actor.role||actor.status!=='active'||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))fail(403,'Current payroll administrator required');
    const record=await m.OffboardingCase.findOne({where:{employeeId},transaction:t,lock:t.LOCK.UPDATE});if(!record)fail(404,'Offboarding case unavailable');
    const current=await state(record.id,t,Number(before));
    if(!write)return current;
    const b=req.body;
    if(!['configure','finalize'].includes(b?.action)||!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<0||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>500||typeof b.commandKey!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(b.commandKey))fail(400,'Action, version, reason and request ID required');
    const hash=createHash('sha256').update(JSON.stringify([employeeId,actor.id,b])).digest('hex');
    const [prior]=await query('SELECT payloadHash FROM settlement_final_events WHERE commandKey = ?',[b.commandKey],t);
    if(prior){if(prior.payloadHash!==hash)fail(409,'Request ID already used');return {...current,replayed:true};}
    if(current.version!==b.expectedVersion)fail(409,'Settlement state changed; reload');
    let details;
    if(b.action==='configure'){
     if(!Number.isSafeInteger(b.finalizerId)||typeof b.requireDifferentAuthor!=='boolean')fail(400,'Explicit finalizer and separation choice required');
     const target=await m.User.findByPk(b.finalizerId,{transaction:t});
     if(!target||target.role!=='admin'||target.status!=='active')fail(409,'Select an active payroll administrator');
     details={finalizerId:target.id,finalizerName:target.fullName,requireDifferentAuthor:b.requireDifferentAuthor,reason:b.reason.trim()};
    }else{
     if(!current.authority||current.authority.finalizerId!==actor.id)fail(403,'Configured finalizer required');
     if(!Number.isSafeInteger(b.draftRevision)||b.draftRevision<1)fail(400,'Select an exact draft revision');
     const [draft]=await query('SELECT revision,currency,items,credit,deduction,net,reason,actorId FROM settlement_draft_revisions WHERE caseId = ? ORDER BY revision DESC LIMIT 1',[record.id],t);
     if(!draft||draft.revision!==b.draftRevision||draft.revision===(current.final?.draft.revision))fail(409,'Select the latest unfinalized draft revision');
     if(current.authority.requireDifferentAuthor&&draft.actorId===actor.id)fail(403,'Configured separation requires a different finalizer from the draft author');
     if((current.final?.draft.revision||0)!==b.replacesRevision)fail(409,'Explicit previous finalized revision required');
     details={draft,authority:current.authority,finalizerId:actor.id,finalizerName:actor.fullName,reason:b.reason.trim(),replacesRevision:b.replacesRevision};
    }
    await m.sequelize.query('INSERT INTO settlement_final_events (caseId,version,actorId,action,details,commandKey,payloadHash) VALUES (?,?,?,?,?,?,?)',{transaction:t,replacements:[record.id,current.version+1,actor.id,b.action,JSON.stringify(details),b.commandKey,hash]});
    return state(record.id,t);
   });res.json(data);
  }catch(e){res.status(Number.isInteger(e.code)?e.code:500).json({message:Number.isInteger(e.code)?e.message:'Final settlement unavailable'});}
 };
};
