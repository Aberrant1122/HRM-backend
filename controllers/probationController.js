const crypto=require('node:crypto');
const {Op}=require('sequelize');
const {sequelize,User,UserInfo,ProbationCase,ProbationEvent}=require('../models');
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const positive=n=>Number.isSafeInteger(n)&&n>0;
const civil=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='1000-01-01'&&s<='9999-12-31'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
function employeeId(req){const id=Number(req.params.employeeId);if(!positive(id)||!/^\d+$/.test(req.params.employeeId))fail(400,'Valid employee ID required');return id;}
function normalize(body,actorId,id){
  if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Command required');
  const fields={create:['startDate','endDate','evaluationDate'],reschedule:['evaluationDate'],extend:['endDate','evaluationDate'],feedback:['category','sourceId','feedback'],confirm:['decisionDate'],terminate:['decisionDate'],reopen:[]};
  if(!Object.hasOwn(fields,body.action)||typeof body.commandKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.commandKey))fail(400,'Valid action and UUID required');
  if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0)fail(400,'Valid expected version required');
  if(Object.keys(body).some(k=>!['commandKey','action','expectedVersion','reason',...fields[body.action]].includes(k)))fail(400,'Unexpected command field');
  if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.trim().length>1000)fail(400,'Reason must contain 1–1000 characters');
  const c={actorId,employeeId:id,action:body.action,expectedVersion:body.expectedVersion,reason:body.reason.trim()};
  for(const k of fields[body.action]){
    const v=body[k];
    if(k.endsWith('Date')){if(k==='evaluationDate'&&v===null)c[k]=null;else{if(!civil(v))fail(400,'Dates must be valid YYYY-MM-DD; evaluation date may be explicitly empty');c[k]=v;}}
    else if(k==='sourceId'){if(!positive(v))fail(400,'Feedback source account required');c[k]=v;}
    else if(k==='category'){if(!['manager','hr'].includes(v))fail(400,'Feedback category must be manager or hr');c[k]=v;}
    else{if(typeof v!=='string'||!v.trim()||v.trim().length>4000)fail(400,'Feedback must contain 1–4000 characters');c[k]=v.trim();}
  }
  return c;
}
const attrs=['id','fullName','email','role','status'];
async function snapshot(id,t,before){
  const employee=await User.findByPk(id,{attributes:attrs,transaction:t});if(!employee)fail(404,'Employee account not found');
  const legacy=await UserInfo.findOne({where:{userId:id},attributes:['startDate','probationEndDate','employmentStatus'],transaction:t});
  const probation=await ProbationCase.findOne({where:{employeeId:id},transaction:t});
  const rows=probation?await ProbationEvent.findAll({where:{caseId:probation.id,...(before&&{version:{[Op.lt]:before}})},attributes:['id','actorId','sourceId','action','version','details','createdAt'],order:[['version','DESC']],limit:101,transaction:t}):[];
  const history=rows.slice(0,100),ids=[...new Set(history.flatMap(e=>[e.actorId,e.sourceId]).filter(Boolean))];
  const people=ids.length?await User.findAll({where:{id:ids},attributes:attrs,transaction:t}):[];
  return{employee,legacy,probation,history,hasEarlierHistory:rows.length>100,people};
}
const readSnapshot=(id,before)=>sequelize.transaction({isolationLevel:'REPEATABLE READ',readOnly:true},t=>snapshot(id,t,before));
exports.sources=async(req,res)=>{try{if(Object.keys(req.query).some(k=>k!=='search')||typeof req.query.search!=='string'||req.query.search.trim().length<2||req.query.search.trim().length>100)fail(400,'Enter 2–100 characters of a source name or email');const [people]=await sequelize.query("SELECT id,fullName,email,role,status FROM users WHERE role IN ('admin','manager','employee') AND (LOCATE(:search,fullName)>0 OR LOCATE(:search,email)>0) ORDER BY fullName,id LIMIT 20",{replacements:{search:req.query.search.trim()}});return res.json({success:true,data:people});}catch(e){return error(res,e);}};
function error(res,e){if(Number.isInteger(e.code))return res.status(e.code).json({success:false,message:e.message});if(['SequelizeUniqueConstraintError','SequelizeForeignKeyConstraintError'].includes(e.name))return res.status(409).json({success:false,message:'Record changed or command key is bound to another request. Reload before continuing.'});console.error('Probation request failed');return res.status(500).json({success:false,message:'Probation workflow unavailable'});}
exports.read=async(req,res)=>{try{const id=employeeId(req),before=req.query.before===undefined?undefined:Number(req.query.before);if(req.query.before!==undefined&&(typeof req.query.before!=='string'||!/^\d+$/.test(req.query.before)||!positive(before)))fail(400,'Valid history cursor required');return res.json({success:true,data:await readSnapshot(id,before)});}catch(e){return error(res,e);}};
exports.command=async(req,res)=>{try{
  const id=employeeId(req),input=normalize(req.body,req.user.id,id),key=req.body.commandKey.toLowerCase(),hash=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const outcome=await sequelize.transaction({isolationLevel:'READ COMMITTED'},async t=>{
    const locked=new Map();for(const userId of [...new Set([id,req.user.id,...(input.sourceId?[input.sourceId]:[])])].sort((a,b)=>a-b))locked.set(userId,await User.findByPk(userId,{transaction:t,lock:t.LOCK.UPDATE}));
    const actor=locked.get(req.user.id),employee=locked.get(id);
    if(!actor||actor.role!=='admin'||actor.status!=='active'||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))fail(403,'Current administrator access required');
    if(!employee)fail(404,'Employee account not found');
    const previous=await ProbationEvent.findOne({where:{commandKey:key},transaction:t});if(previous){if(previous.payloadHash!==hash)fail(409,'Command key is bound to different content or actor');return{replayed:true,appliedVersion:previous.version};}
    let record=await ProbationCase.findOne({where:{employeeId:id},transaction:t,lock:t.LOCK.UPDATE});
    const before=record?record.toJSON():null;
    if(input.action==='create'){
      if(record||input.expectedVersion!==0)fail(409,'Probation record exists or version changed');
      if(employee.role!=='employee')fail(409,'New probation records require an employee-role account');
      record=await ProbationCase.create({employeeId:id,createdBy:actor.id,startDate:input.startDate,endDate:input.endDate,evaluationDate:input.evaluationDate},{transaction:t});
    }else{
      if(!record)fail(404,'Create a probation record first');if(record.version!==input.expectedVersion)fail(409,'Probation record changed. Reload before applying.');
      if(input.action==='reopen'){if(record.status==='active')fail(409,'Record is already active');record.status='active';record.decisionDate=null;}
      else if(record.status!=='active')fail(409,'Reopen the probation record before editing');
      record.version++;
    }
    const details={reason:input.reason,before};
    if(input.action==='extend'){if(input.endDate<=record.endDate)fail(400,'Extension must end after the current end date');record.endDate=input.endDate;record.evaluationDate=input.evaluationDate;}
    if(input.action==='reschedule')record.evaluationDate=input.evaluationDate;
    if(['confirm','terminate'].includes(input.action)){if(input.decisionDate<record.startDate)fail(400,'Decision date precedes probation start');record.status=input.action==='confirm'?'confirmed':'terminated';record.decisionDate=input.decisionDate;}
    if(record.endDate<record.startDate||record.evaluationDate&&(record.evaluationDate<record.startDate||record.evaluationDate>record.endDate))fail(400,'End and evaluation dates must fall within the explicit probation period');
    if(input.action==='feedback'){const source=locked.get(input.sourceId);if(!source||!['admin','manager','employee'].includes(source.role))fail(400,'Feedback source must be a retained internal account');Object.assign(details,{category:input.category,feedback:input.feedback,source:{id:source.id,fullName:source.fullName,role:source.role},recordedByAdmin:true});}
    await record.save({transaction:t});details.after=record.toJSON();
    await ProbationEvent.create({caseId:record.id,actorId:actor.id,sourceId:input.sourceId??null,commandKey:key,payloadHash:hash,version:record.version,action:input.action,details},{transaction:t});
    return{replayed:false,appliedVersion:record.version};
  });
  return res.json({success:true,...outcome,data:await readSnapshot(id)});
}catch(e){return error(res,e);}};
exports.list=async(req,res)=>{try{
  if(Object.keys(req.query).some(k=>!['through','page'].includes(k))||!civil(req.query.through))fail(400,'Explicit through date (YYYY-MM-DD) required');
  const page=req.query.page===undefined?1:Number(req.query.page);if(!positive(page)||page>100000||req.query.page!==undefined&&(typeof req.query.page!=='string'||!/^\d+$/.test(req.query.page)))fail(400,'Valid page required');
  const data=await sequelize.transaction({isolationLevel:'REPEATABLE READ',readOnly:true},async t=>{const where={status:'active',endDate:{[Op.lte]:req.query.through}},count=await ProbationCase.count({where,transaction:t}),rows=await ProbationCase.findAll({where,order:[['endDate','ASC'],['id','ASC']],limit:50,offset:(page-1)*50,transaction:t});const ids=rows.map(r=>r.employeeId);const people=ids.length?await User.findAll({where:{id:ids},attributes:attrs,transaction:t}):[];return{rows,people,total:count,page,totalPages:Math.ceil(count/50),through:req.query.through};});
  return res.json({success:true,data});
}catch(e){return error(res,e);}};
