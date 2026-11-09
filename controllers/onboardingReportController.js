const {Op}=require('sequelize');

module.exports=models=>async(req,res)=>{
 const {sequelize,User,OnboardingCase:Case,OnboardingItem:Item}=models;
 const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
 const civil=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='1000-01-01'&&value<'9999-12-31'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 try{
  const {source,from,to,before}=req.query;
  if(Object.keys(req.query).some(key=>!['source','from','to','before'].includes(key))||!['cases','items'].includes(source)||!civil(from)||!civil(to)||from>to||before!==undefined&&(typeof before!=='string'||!/^\d+$/.test(before)||!Number.isSafeInteger(Number(before))||Number(before)<1))fail(400,'Choose a source and valid inclusive dates/cursor');
  const start=new Date(from+'T00:00:00.000Z'),end=new Date(to+'T00:00:00.000Z');end.setUTCDate(end.getUTCDate()+1);
  const data=await sequelize.transaction({isolationLevel:'REPEATABLE READ'},async transaction=>{
   const actor=await User.findByPk(req.user.id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!actor||req.user.role!=='admin'||actor.role!=='admin'||actor.status!=='active'||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))fail(403,'Current administrator authorization required');
   const model=source==='cases'?Case:Item,where=source==='cases'?{createdAt:{[Op.gte]:start,[Op.lt]:end}}:{dueDate:{[Op.between]:[from,to]}};
   const total=await model.count({where,transaction}),raw=await model.findAll({where:{...where,...(before&&{id:{[Op.lt]:Number(before)}})},order:[['id','DESC']],limit:51,transaction});
   const rows=[];
   for(const record of raw.slice(0,50)){
    const checklist=source==='cases'?record:await Case.findByPk(record.caseId,{transaction});
    if(!checklist)fail(409,'Retained checklist source unavailable');
    const account=await User.findByPk(checklist.employeeId,{attributes:['id','fullName','role','status'],transaction});
    const row={id:record.id,caseId:checklist.id,employeeId:checklist.employeeId,employeeName:account?.fullName??null,currentAccountRole:account?.role??null,currentAccountStatus:account?.status??null,currentCaseStatus:checklist.status,currentCaseVersion:checklist.version};
    if(source==='cases'){
     const items=await Item.findAll({where:{caseId:checklist.id},attributes:['status','dueDate','responsibleId'],transaction});
     Object.assign(row,{caseCreatedAt:checklist.createdAt,currentItemCount:items.length,currentPendingItems:items.filter(item=>item.status==='pending').length,currentCompletedItems:items.filter(item=>item.status==='completed').length,currentWaivedItems:items.filter(item=>item.status==='waived').length,currentUndatedItems:items.filter(item=>item.dueDate===null).length,currentUnassignedItems:items.filter(item=>item.responsibleId===null).length});
    }else{
     const responsible=record.responsibleId?await User.findByPk(record.responsibleId,{attributes:['id','fullName'],transaction}):null;
     Object.assign(row,{title:record.title,dueDate:record.dueDate,currentItemStatus:record.status,responsibleId:record.responsibleId,currentResponsibleName:responsible?.fullName??null});
    }
    rows.push(row);
   }
   return{source,from,to,total,rows,hasMore:raw.length>50,pageRowCount:rows.length,pageMissing:{account:rows.filter(row=>row.employeeName===null).length,...(source==='items'&&{responsiblePerson:rows.filter(row=>row.responsibleId===null).length})},globalUndatedItems:source==='items'?await Item.count({where:{dueDate:null},transaction}):null,basis:source==='cases'?'Checklist records created within selected UTC dates. Item counts/statuses are CURRENT for each selected checklist and include all its items, regardless of item deadline.':'Current checklist items with recorded deadlines within selected inclusive civil dates, across all statuses. Undated items are excluded from the range and counted separately across all retained checklists.',context:'Account names/roles/statuses and checklist/item state are current at report generation, not historical as of the source date. Missing counts describe only the latest fetched page.',limitations:'Manual retained checklist records only. Checklist creation is not an employment joining date; completed/waived items do not establish employee eligibility, employment confirmation, access or pay. Counts are records, not workforce/new-joiner totals. Each request is a fresh snapshot; later pages may reflect changes.',generatedAt:new Date().toISOString()};
  });
  res.setHeader('Cache-Control','private, no-store');return res.json({success:true,data});
 }catch(error){return res.status(Number.isInteger(error.code)?error.code:500).json({success:false,message:Number.isInteger(error.code)?error.message:'Onboarding record report unavailable'});}
};
