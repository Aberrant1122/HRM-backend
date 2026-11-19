const {Op,Validator,QueryTypes}=require("sequelize");
const {sequelize,User,EmployeeArchiveEvent:Event}=require("../models");
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const handle=(res,e)=>res.status(Number.isInteger(e.code)?e.code:500).json({message:Number.isInteger(e.code)?e.message:"Employee archive unavailable"});
const employeeId=req=>{
  const value=Number(req.params.id);
  if(!Number.isSafeInteger(value)||value<=0)fail(400,"Invalid employee ID");
  return value;
};
async function context(req,id,transaction){
  const ids=[...new Set([req.user.id,id].filter(Boolean))].sort((a,b)=>a-b);
  const users=new Map();
  for(const key of ids)users.set(key,await User.findByPk(key,{attributes:["id","fullName","role","status","sessionVersion"],transaction,lock:transaction.LOCK.UPDATE}));
  const actor=users.get(req.user.id);
  if(!actor||actor.role!=="admin"||actor.status!=="active"||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))fail(403,"Administrator access required");
  if(id&&!["employee","manager","admin","hr"].includes(users.get(id)?.role))fail(404,"Employee record unavailable");
  return actor;
}
exports.read=async(req,res)=>{
  try{
    const id=employeeId(req),before=req.query.before===undefined?null:Number(req.query.before);
    if(before!==null&&(!Number.isSafeInteger(before)||before<1))fail(400,"Invalid history cursor");
    const data=await sequelize.transaction(async transaction=>{
      await context(req,id,transaction);
      const latest=await Event.findOne({where:{employeeId:id},order:[["version","DESC"]],transaction});
      const page=await Event.findAll({where:{employeeId:id,...(before&&{version:{[Op.lt]:before}})},order:[["version","DESC"]],limit:26,transaction});
      return {archived:latest?.archived??false,version:latest?.version??0,history:page.slice(0,25),hasMore:page.length>25};
    });
    res.json(data);
  }catch(e){handle(res,e);}
};
exports.write=async(req,res)=>{
  try{
    const id=employeeId(req),{commandKey,expectedVersion,archived,reason}=req.body;
    if(typeof commandKey!=="string"||!Validator.isUUID(commandKey,4)||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||typeof archived!=="boolean"||
       typeof reason!=="string"||!reason.trim()||reason.trim().length>600)fail(400,"Provide a reason, version and valid archive command");
    const event=await sequelize.transaction(async transaction=>{
      const actor=await context(req,id,transaction);
      const prior=await Event.findByPk(commandKey,{transaction});
      if(prior){
        if(prior.employeeId!==id||prior.actorId!==actor.id||prior.version!==expectedVersion+1||prior.archived!==archived||prior.reason!==reason.trim())fail(409,"This command is bound to another archive change");
        return prior;
      }
      const last=await Event.findOne({where:{employeeId:id},order:[["version","DESC"]],transaction});
      if((last?.version??0)!==expectedVersion||(last?.archived??false)===archived)fail(409,"Record changed. Refresh its archive status.");
      return Event.create({commandKey,employeeId:id,actorId:actor.id,actorName:actor.fullName,version:expectedVersion+1,archived,reason:reason.trim()},{transaction});
    });
    res.json(event);
  }catch(e){handle(res,e);}
};
exports.list=async(req,res)=>{
  try{
    const before=req.query.before===undefined?2147483648:Number(req.query.before);
    if(!Number.isSafeInteger(before)||before<=0)fail(400,"Invalid cursor");
    const rows=await sequelize.transaction(async transaction=>{
      await context(req,null,transaction);
      return sequelize.query("SELECT e.employeeId, u.fullName, e.actorName, e.createdAt, e.version FROM employee_archive_events e JOIN users u ON u.id=e.employeeId WHERE e.archived=1 AND e.employeeId < :before AND NOT EXISTS (SELECT 1 FROM employee_archive_events newer WHERE newer.employeeId=e.employeeId AND newer.version>e.version) ORDER BY e.employeeId DESC LIMIT 26",{replacements:{before},type:QueryTypes.SELECT,transaction});
    });
    res.json({rows:rows.slice(0,25),hasMore:rows.length>25});
  }catch(e){handle(res,e);}
};
