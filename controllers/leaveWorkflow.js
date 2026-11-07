const crypto=require('node:crypto'),{Op}=require('sequelize');
const positive=n=>Number.isSafeInteger(n)&&n>0,fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const civil=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='1000-01-01'&&s<='9999-12-31'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
function idFrom(req){const id=Number(req.params.id);if(!positive(id)||!/^\d+$/.test(req.params.id))fail(400,'Valid request ID required');return id;}
const units=(start,end,mode)=>mode==='half-day'?0.5:(Date.parse(end)-Date.parse(start))/86400000+1;
function normalize(body,actorId,action,id){
  const allowed=action==='apply'?['commandKey','expectedVersion','leaveTypeId','startDate','endDate','leaveMode','reason']:['commandKey','expectedVersion','reason'];
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k)))fail(400,'Valid leave command required');
  if(typeof body.commandKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.commandKey)||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0)fail(400,'Valid command UUID and expected version required');
  if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.trim().length>4000)fail(400,'Reason must contain 1–4000 characters');
  const c={actorId,action,requestId:id??null,expectedVersion:body.expectedVersion,reason:body.reason.trim()};
  if(action==='apply'){
    if(body.expectedVersion!==0||!positive(body.leaveTypeId)||!civil(body.startDate)||!civil(body.endDate)||body.startDate>body.endDate||!['full-day','half-day'].includes(body.leaveMode))fail(400,'Choose a leave type, valid ordered civil dates and a supported leave mode');
    if(body.leaveMode==='half-day'&&body.startDate!==body.endDate)fail(400,'Half-day request must cover one civil date');
    Object.assign(c,{leaveTypeId:body.leaveTypeId,startDate:body.startDate,endDate:body.endDate,leaveMode:body.leaveMode});
  }return c;
}
module.exports=models=>{
  const {sequelize,User,LeaveRequest,LeaveType,LeaveEvent}=models;
  function error(res,e){if(Number.isInteger(e.code))return res.status(e.code).json({success:false,message:e.message});if(['SequelizeUniqueConstraintError','SequelizeForeignKeyConstraintError'].includes(e.name))return res.status(409).json({success:false,message:'Record changed or command key is bound to another request. Reload before continuing.'});console.error('Leave workflow failed');return res.status(500).json({success:false,message:'Leave workflow unavailable'});}
  async function quota(type,userId,total,startDate,t){
    // Cohort is the validated request start-date year, regardless of the server clock.
    const year=Number(startDate.slice(0,4));
    if(!require('../utils/leaveQuota')(type.annual_quota))fail(409,'Configured annual quota requires data review; leave decisions are blocked');
    const applied=await require('../utils/assignedLeavePolicy')(models,userId,type.id,t);
    {
      const approved=await LeaveRequest.findAll({where:{userId,leaveTypeId:type.id,status:'approved',startDate:{[Op.gte]:year+'-01-01',[Op.lte]:year+'-12-31'}},attributes:['startDate','endDate','leaveMode','totalDays'],transaction:t});
      let used=0;
      for(const row of approved){
        const {startDate:start,endDate:end,leaveMode:mode,totalDays:stored}=row;
        if(!civil(start)||!civil(end)||start>end||!['full-day','half-day'].includes(mode)||mode==='half-day'&&start!==end||stored===null||!Number.isFinite(Number(stored))||Number(stored)<=0||Number(stored)!==units(start,end,mode))fail(409,'Historical approved request units require data review; quota cannot be determined safely');
        used+=Number(stored);
      }
      if(used+total>applied.allowance)fail(409,'Existing quota check prevents this request; leave-year and charging rules require policy review');
    }
    return {year,usageBasis:'request-start-date-year',...applied};
  }
  const command=action=>async(req,res)=>{try{
    const id=action==='apply'?undefined:idFrom(req),input=normalize(req.body,req.user.id,action,id),commandKey=req.body.commandKey.toLowerCase(),payloadHash=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const initial=id?await LeaveRequest.findByPk(id,{attributes:['userId']}):null;if(id&&!initial)fail(404,'Leave request not found');const userId=initial?.userId??req.user.id;
    const result=await sequelize.transaction({isolationLevel:'READ COMMITTED'},async t=>{
      const users=new Map();for(const uid of [...new Set([req.user.id,userId])].sort((a,b)=>a-b))users.set(uid,await User.findByPk(uid,{transaction:t,lock:t.LOCK.UPDATE}));
      const actor=users.get(req.user.id);if(!actor||actor.status!=='active'||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0)||action!=='apply'&&actor.role!=='admin')fail(403,'Current authorized account required');
      // Existing authenticated self-application scope is preserved; workforce eligibility remains undecided.
      const prior=await LeaveEvent.findOne({where:{commandKey},transaction:t});if(prior){if(prior.payloadHash!==payloadHash)fail(409,'Command key is bound to different content or actor');return{replayed:true,data:prior.details.after,appliedVersion:prior.version};}
      let record=id?await LeaveRequest.findByPk(id,{transaction:t,lock:t.LOCK.UPDATE}):null;
      if(id&&(!record||record.userId!==userId))fail(409,'Request owner changed. Reload before continuing.');
      if(record&&(record.version!==input.expectedVersion||record.status!=='pending'))fail(409,'Leave request changed or is already reviewed. Reload before continuing.');
      const before=record?.toJSON()??null;let type=null,year=null;if(action==='reject')type=await LeaveType.findByPk(record.leaveTypeId,{transaction:t,lock:t.LOCK.UPDATE});
      if(action!=='reject'){
        type=await LeaveType.findByPk(record?.leaveTypeId??input.leaveTypeId,{transaction:t,lock:t.LOCK.UPDATE});if(!type||type.status!=='active')fail(409,'Leave type is unavailable or inactive');
        const start=record?.startDate??input.startDate,end=record?.endDate??input.endDate,mode=record?.leaveMode??input.leaveMode;
        if(!civil(start)||!civil(end)||start>end||!['full-day','half-day'].includes(mode)||mode==='half-day'&&(start!==end||!type.half_day_allowed))fail(409,'Stored dates/mode or configured half-day rule require review');
        const total=units(start,end,mode);if(record&&(!Number.isFinite(Number(record.totalDays))||Number(record.totalDays)!==total))fail(409,'Stored request units require data review; they will not be recalculated silently');
        if(type.max_consecutive_days&&total>Number(type.max_consecutive_days))fail(409,'Request exceeds the configured consecutive-day limit');
        const overlapping=await LeaveRequest.findOne({where:{userId,status:{[Op.ne]:'rejected'},...(id&&{id:{[Op.ne]:id}}),startDate:{[Op.lte]:end},endDate:{[Op.gte]:start}},transaction:t});if(overlapping)fail(409,'Another non-rejected request overlaps these dates');
        year=await quota(type,userId,total,start,t);
        if(action==='apply')record=await LeaveRequest.create({userId,leaveTypeId:input.leaveTypeId,startDate:start,endDate:end,leaveMode:mode,totalDays:total,reason:input.reason,status:'pending',version:1},{transaction:t});
      }
      if(action!=='apply')await record.update({status:action==='approve'?'approved':'rejected',approvedBy:actor.id,rejectionReason:action==='reject'?input.reason:null,version:record.version+1},{transaction:t});
      const after=JSON.parse(JSON.stringify(record.toJSON())),details={reason:input.reason,before,after,actor:{id:actor.id,fullName:actor.fullName},leaveType:type?{id:type.id,name:type.name,is_paid:type.is_paid,annual_quota:type.annual_quota,max_consecutive_days:type.max_consecutive_days,half_day_allowed:type.half_day_allowed}:null,legacyQuotaYear:year?.year??null,appliedPolicy:year,unitBasis:'existing-calendar-day-rule'};
      await LeaveEvent.create({requestId:record.id,actorId:actor.id,userId,commandKey,payloadHash,version:record.version,action,details},{transaction:t});return{replayed:false,data:after,appliedVersion:record.version};
    });return res.status(action==='apply'&&!result.replayed?201:200).json({success:true,...result});
  }catch(e){return error(res,e);}};
  async function detail(req,res){try{const id=idFrom(req),before=req.query.before===undefined?undefined:Number(req.query.before);if(req.query.before!==undefined&&(typeof req.query.before!=='string'||!/^\d+$/.test(req.query.before)||!positive(before)))fail(400,'Valid history cursor required');const data=await sequelize.transaction({isolationLevel:'REPEATABLE READ',readOnly:true},async t=>{const request=await LeaveRequest.findByPk(id,{transaction:t});if(!request)fail(404,'Leave request not found');if(req.user.role!=='admin'&&request.userId!==req.user.id)fail(403,'Own request or administrator access required');const rows=await LeaveEvent.findAll({where:{requestId:id,...(before&&{version:{[Op.lt]:before}})},attributes:['id','actorId','action','version','details','createdAt'],order:[['version','DESC']],limit:101,transaction:t});const employee=await User.findByPk(request.userId,{attributes:['id','fullName','email','role','status'],transaction:t}),type=await LeaveType.findByPk(request.leaveTypeId,{attributes:['id','name','status'],transaction:t});return{request,employee,type,history:rows.slice(0,100),hasEarlierHistory:rows.length>100,legacyHistoryNotBackfilled:!(await LeaveEvent.count({where:{requestId:id},transaction:t}))};});return res.json({success:true,data});}catch(e){return error(res,e);}}
  const list=admin=>async(req,res)=>{try{if(admin&&req.user.role!=='admin')fail(403,'Administrator access required');if(Object.keys(req.query).some(k=>!['page','status'].includes(k))||req.query.status!==undefined&&!['pending','approved','rejected'].includes(req.query.status))fail(400,'Valid status required');const page=req.query.page===undefined?1:Number(req.query.page);if(!positive(page)||page>100000||req.query.page!==undefined&&(typeof req.query.page!=='string'||!/^\d+$/.test(req.query.page)))fail(400,'Valid page required');const data=await sequelize.transaction({isolationLevel:'REPEATABLE READ',readOnly:true},async t=>{const where={...(!admin&&{userId:req.user.id}),...(req.query.status&&{status:req.query.status})},total=await LeaveRequest.count({where,transaction:t}),rows=await LeaveRequest.findAll({where,order:[['createdAt','DESC'],['id','DESC']],limit:50,offset:(page-1)*50,transaction:t});const ids=[...new Set(rows.map(r=>r.userId))],people=ids.length?await User.findAll({where:{id:ids},attributes:['id','fullName','email'],transaction:t}):[];return{rows,people,total,page,totalPages:Math.ceil(total/50)};});return res.json({success:true,data});}catch(e){return error(res,e);}};
  return{apply:command('apply'),approve:command('approve'),reject:command('reject'),detail,myList:list(false),adminList:list(true)};
};
