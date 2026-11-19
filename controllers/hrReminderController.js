const {Validator,QueryTypes}=require("sequelize");
const {sequelize,HrReminderSchedule:Schedule,User}=require("../models");
const validDate=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&x>="1000-01-01"&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const error=(res,e)=>res.status(Number.isInteger(e.code)?e.code:500).json({message:Number.isInteger(e.code)?e.message:"Reminder schedules unavailable"});
async function owner(req,t){
 const account=await User.findByPk(req.user.id,{attributes:["id","role","status","sessionVersion"],transaction:t,lock:t.LOCK.UPDATE});
 if(!account||account.role!=="admin"||account.status!=="active"||Number(req.user.sessionVersion??0)!==Number(account.sessionVersion))fail(403,"Current administrator access required");
 return account.id;
}
exports.list=async(req,res)=>{
 try{
  const {on}=req.query,page=Number(req.query.page||1),mode=req.query.mode||"all";
  if(!["all","due"].includes(mode)||mode==="due"&&!validDate(on)||!Number.isSafeInteger(page)||page<1||page>1000000)fail(400,"Choose a valid list, date and page");
  const rows=await sequelize.transaction(async t=>{
   const ownerId=await owner(req,t);
   const due=mode==="due"?" AND stoppedAt IS NULL AND firstDate <= :on AND (endDate IS NULL OR endDate >= :on) AND MOD(DATEDIFF(:on,firstDate),intervalDays)=0":"";
   return sequelize.query("SELECT id,title,firstDate,endDate,intervalDays,stoppedAt,stopReason FROM hr_reminder_schedules WHERE ownerId = :ownerId"+due+" ORDER BY firstDate DESC,id LIMIT 26 OFFSET :offset",
     {replacements:{ownerId,on:on||null,offset:(page-1)*25},type:QueryTypes.SELECT,transaction:t});
  });
  res.json({rows:rows.slice(0,25),hasMore:rows.length>25});
 }catch(e){error(res,e);}
};
exports.write=async(req,res)=>{
 try{
  const {id,action,title,firstDate,endDate,intervalDays,reason}=req.body;
  if(typeof id!=="string"||!Validator.isUUID(id,4)||!["create","stop"].includes(action))fail(400,"Invalid reminder command");
  const result=await sequelize.transaction(async t=>{
   const ownerId=await owner(req,t),prior=await Schedule.findByPk(id,{transaction:t,lock:t.LOCK.UPDATE});
   if(prior&&prior.ownerId!==ownerId)fail(404,"Reminder unavailable");
   if(action==="stop"){
    if(!prior)fail(404,"Reminder unavailable");
    if(typeof reason!=="string"||!reason.trim()||reason.trim().length>300)fail(400,"Enter a reason to stop this schedule");
    if(prior.stoppedAt){if(prior.stopReason!==reason.trim())fail(409,"Schedule already stopped");return prior;}
    return prior.update({stoppedAt:new Date(),stopReason:reason.trim()},{transaction:t});
   }
   if(typeof title!=="string"||!title.trim()||title.trim().length>180||!validDate(firstDate)||!(endDate===null||validDate(endDate)&&endDate>=firstDate)||
      !Number.isInteger(intervalDays)||intervalDays<1||intervalDays>3660)fail(400,"Check title, first date, positive repeat interval and inclusive end date");
   const fields={title:title.trim(),firstDate,endDate,intervalDays};
   if(prior){if(Object.keys(fields).some(k=>fields[k]!==prior[k]))fail(409,"Reminder ID is bound to different settings");return prior;}
   return Schedule.create({id,ownerId,...fields},{transaction:t});
  });
  res.json(result);
 }catch(e){error(res,e);}
};
