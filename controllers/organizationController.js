const crypto=require('node:crypto'),{Op}=require('sequelize');
const {sequelize,User,UserInfo,Department,DesignationCategory,OrganizationState,OrganizationAssignment,OrganizationEvent}=require('../models');
const positive=n=>Number.isSafeInteger(n)&&n>0,internal=u=>u&&['admin','manager','employee'].includes(u.role),attrs=['id','fullName','email','role','status'];
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
function idFrom(req){const id=Number(req.params.employeeId);if(!positive(id)||!/^\d+$/.test(req.params.employeeId))fail(400,'Valid account required');return id;}
function normalized(body,actorId,employeeId){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['commandKey','expectedVersion','departmentId','managerId','designation','designationId','reason'].includes(k)))fail(400,'Valid assignment command required');
  if(typeof body.commandKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.commandKey)||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0)fail(400,'Valid UUID and expected version required');
  for(const k of ['departmentId','managerId'])if(body[k]!==null&&!positive(body[k]))fail(400,'Select an existing department/manager or explicitly clear the assignment');
  if(body.designation!==null&&(typeof body.designation!=='string'||!body.designation.trim()||body.designation.trim().length>200))fail(400,'Designation must contain 1–200 characters or be explicitly empty');
  if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.trim().length>1000)fail(400,'Reason must contain 1–1000 characters');
  if(body.designationId!==undefined&&body.designationId!==null&&!positive(body.designationId))fail(400,'Select an existing designation or explicitly clear it');
  if(body.designationId!==undefined&&body.designationId!==null&&body.designation!==null)fail(400,'A category selection supplies its own designation label');
  return{actorId,employeeId,expectedVersion:body.expectedVersion,departmentId:body.departmentId,managerId:body.managerId,designation:body.designation?.trim()??null,...(body.designationId!==undefined&&{designationId:body.designationId}),reason:body.reason.trim()};
}
async function snapshot(id,t,before){
  const employee=await User.findByPk(id,{attributes:attrs,transaction:t});if(!employee)fail(404,'Account not found');
  const legacy=await UserInfo.findOne({where:{userId:id},attributes:['department','position','reportingManager'],transaction:t}),assignment=await OrganizationAssignment.findOne({where:{employeeId:id},transaction:t});
  const rows=assignment?await OrganizationEvent.findAll({where:{assignmentId:assignment.id,...(before&&{version:{[Op.lt]:before}})},attributes:['id','actorId','version','details','createdAt'],order:[['version','DESC']],limit:101,transaction:t}):[],history=rows.slice(0,100),ids=[...new Set([assignment?.managerId,...history.map(e=>e.actorId)].filter(Boolean))];
  const people=ids.length?await User.findAll({where:{id:ids},attributes:attrs,transaction:t}):[],department=assignment?.departmentId?await Department.findByPk(assignment.departmentId,{attributes:['id','name','isActive'],transaction:t}):null;
  const designationCategory=assignment?.designationId?await DesignationCategory.findByPk(assignment.designationId,{attributes:['id','name','isActive','version'],transaction:t}):null;
  return{employee,legacy,assignment,department,designationCategory,people,history,hasEarlierHistory:rows.length>100};
}
const readSnapshot=(id,before)=>sequelize.transaction({isolationLevel:'REPEATABLE READ',readOnly:true},t=>snapshot(id,t,before));
function error(res,e){if(Number.isInteger(e.code))return res.status(e.code).json({success:false,message:e.message});if(['SequelizeUniqueConstraintError','SequelizeForeignKeyConstraintError'].includes(e.name))return res.status(409).json({success:false,message:'Record changed or command key is bound to another request. Reload before continuing.'});console.error('Organization request failed');return res.status(500).json({success:false,message:'Organization workflow unavailable'});}
exports.read=async(req,res)=>{try{const id=idFrom(req),before=req.query.before===undefined?undefined:Number(req.query.before);if(req.query.before!==undefined&&(typeof req.query.before!=='string'||!/^\d+$/.test(req.query.before)||!positive(before)))fail(400,'Valid history cursor required');return res.json({success:true,data:await readSnapshot(id,before)});}catch(e){return error(res,e);}};
exports.command=async(req,res)=>{try{
  const id=idFrom(req),input=normalized(req.body,req.user.id,id),commandKey=req.body.commandKey.toLowerCase(),payloadHash=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const outcome=await sequelize.transaction({isolationLevel:'READ COMMITTED'},async t=>{
    // Serialize graph edits before checking the whole proposed manager chain. Two reciprocal edits cannot both commit.
    const graph=await OrganizationState.findByPk(1,{transaction:t,lock:t.LOCK.UPDATE});if(!graph)fail(503,'Organization state is unavailable; apply the reviewed migration');
    const users=new Map();for(const userId of [...new Set([id,req.user.id,...(input.managerId?[input.managerId]:[])])].sort((a,b)=>a-b))users.set(userId,await User.findByPk(userId,{transaction:t,lock:t.LOCK.UPDATE}));
    const actor=users.get(req.user.id),employee=users.get(id);
    if(!actor||actor.role!=='admin'||actor.status!=='active'||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))fail(403,'Current administrator access required');
    if(!employee)fail(404,'Account not found');
    const previous=await OrganizationEvent.findOne({where:{commandKey},transaction:t});if(previous){if(previous.payloadHash!==payloadHash)fail(409,'Command key is bound to different content or actor');return{replayed:true,appliedVersion:previous.version};}
    const assignment=await OrganizationAssignment.findOne({where:{employeeId:id},transaction:t,lock:t.LOCK.UPDATE}),before=assignment?.toJSON()??null;
    if((assignment?.version??0)!==input.expectedVersion)fail(409,'Organization assignment changed. Reload before applying.');
    if(!internal(employee))fail(409,'New organization edits require an internal account; retained history remains available');
    if(input.managerId===id)fail(400,'An account cannot report to itself');
    const manager=input.managerId?users.get(input.managerId):null;
    if(input.managerId!==null&&(!internal(manager)||manager.status!=='active')&&input.managerId!==assignment?.managerId)fail(400,'Choose an active internal reporting manager');
    let department=null;if(input.departmentId!==null){department=await Department.findByPk(input.departmentId,{transaction:t,lock:t.LOCK.UPDATE});if(!department||!department.isActive&&input.departmentId!==assignment?.departmentId)fail(400,'Choose an active configured department');}
    const visited=new Set([id]);let cursor=input.managerId;
    while(cursor){if(visited.has(cursor))fail(409,'Reporting relationship would create a cycle');visited.add(cursor);if(visited.size>10000)fail(409,'Reporting chain exceeds the supported review limit');const parent=await OrganizationAssignment.findOne({where:{employeeId:cursor},attributes:['managerId'],transaction:t});cursor=parent?.managerId;}
    const designationId=Object.hasOwn(input,'designationId')?input.designationId:assignment?.designationId??null;
    let designationCategory=null;if(designationId){designationCategory=await DesignationCategory.findByPk(designationId,{transaction:t,lock:t.LOCK.UPDATE});if(!designationCategory||!designationCategory.isActive&&designationId!==assignment?.designationId)fail(400,'Choose an active configured designation');if(!Object.hasOwn(input,'designationId')&&input.designation!==assignment.designation)fail(400,'Choose a designation category explicitly before changing its label');}
    const changes={departmentId:input.departmentId,managerId:input.managerId,...(DesignationCategory&&{designationId}),designation:designationCategory?(designationId===assignment?.designationId?assignment.designation:designationCategory.name):input.designation,version:(assignment?.version??0)+1};
    const saved=assignment?await assignment.update(changes,{transaction:t}):await OrganizationAssignment.create({employeeId:id,createdBy:actor.id,...changes},{transaction:t});
    graph.version++;await graph.save({transaction:t});
    const details={reason:input.reason,before,after:saved.toJSON(),designationCategory:designationCategory?{id:designationCategory.id,name:designationCategory.name,isActive:designationCategory.isActive,version:designationCategory.version}:null,department:department?{id:department.id,name:department.name,isActive:department.isActive}:null,manager:manager?{id:manager.id,fullName:manager.fullName,role:manager.role,status:manager.status}:null,actor:{id:actor.id,fullName:actor.fullName}};
    await OrganizationEvent.create({assignmentId:saved.id,actorId:actor.id,managerId:input.managerId,departmentId:input.departmentId,commandKey,payloadHash,version:saved.version,details},{transaction:t});
    return{replayed:false,appliedVersion:saved.version};
  });return res.json({success:true,...outcome,data:await readSnapshot(id)});
}catch(e){return error(res,e);}};
exports.options=async(req,res)=>{try{
  if(Object.keys(req.query).some(k=>!['kind','search'].includes(k))||!['people','accounts','departments','designations'].includes(req.query.kind)||typeof req.query.search!=='string'||req.query.search.trim().length<2||req.query.search.trim().length>100)fail(400,'Choose accounts, people or departments and enter 2–100 search characters');
  const sql=req.query.kind==='designations'?"SELECT id,name,isActive FROM designation_categories WHERE isActive=1 AND LOCATE(:search,name)>0 ORDER BY name,id LIMIT 20":req.query.kind!=='departments'?"SELECT id,fullName,email,role,status FROM users WHERE role IN ('admin','manager','employee') "+(req.query.kind==='people'?"AND status='active' ":'')+"AND (LOCATE(:search,fullName)>0 OR LOCATE(:search,email)>0) ORDER BY fullName,id LIMIT 20":"SELECT id,name,isActive FROM departments WHERE isActive=1 AND LOCATE(:search,name)>0 ORDER BY name,id LIMIT 20";
  const [rows]=await sequelize.query(sql,{replacements:{search:req.query.search.trim()}});return res.json({success:true,data:rows});
}catch(e){return error(res,e);}};
exports.directory=async(req,res)=>{try{
  if(Object.keys(req.query).some(k=>!['search','page'].includes(k))||req.query.search!==undefined&&(typeof req.query.search!=='string'||req.query.search.length>100))fail(400,'Valid search required');
  const page=req.query.page===undefined?1:Number(req.query.page);if(!positive(page)||page>100000||req.query.page!==undefined&&(typeof req.query.page!=='string'||!/^\d+$/.test(req.query.page)))fail(400,'Valid page required');
  const search=req.query.search?.trim()||'',where="(:search = '' OR LOCATE(:search,u.fullName)>0 OR LOCATE(:search,u.email)>0 OR LOCATE(:search,a.designation)>0 OR LOCATE(:search,g.name)>0 OR LOCATE(:search,d.name)>0 OR LOCATE(:search,m.fullName)>0)",joins=' FROM organization_assignments a JOIN users u ON u.id=a.employeeId LEFT JOIN departments d ON d.id=a.departmentId LEFT JOIN users m ON m.id=a.managerId LEFT JOIN designation_categories g ON g.id=a.designationId ';
  const data=await sequelize.transaction({isolationLevel:'REPEATABLE READ',readOnly:true},async t=>{const params={search,offset:(page-1)*50},[[count]]=await sequelize.query('SELECT COUNT(*) total'+joins+'WHERE '+where,{replacements:params,transaction:t}),[rows]=await sequelize.query('SELECT a.employeeId,a.departmentId,a.managerId,a.designation,a.designationId,g.name designationCategoryName,g.isActive designationActive,a.version,u.fullName,u.email,u.role,u.status,d.name departmentName,d.isActive departmentActive,m.fullName managerName,m.role managerRole,m.status managerStatus'+joins+'WHERE '+where+' ORDER BY u.fullName,u.id LIMIT 50 OFFSET :offset',{replacements:params,transaction:t});return{rows,total:Number(count.total),page,totalPages:Math.ceil(Number(count.total)/50),search,scope:'explicit-organization-assignments'};});return res.json({success:true,data});
}catch(e){return error(res,e);}};
