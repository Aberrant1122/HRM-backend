const {QueryTypes}=require("sequelize");
module.exports=({sequelize,User})=>async(req,res)=>{
 try{
  const {basis="all",before}=req.query;
  if(!["all","monthly","hourly","daily"].includes(basis)||before!==undefined&&(typeof before!=="string"||!/^\d+$/.test(before)||!Number.isSafeInteger(Number(before))||Number(before)<1))return res.status(400).json({message:"Choose a valid salary basis and cursor"});
  const data=await sequelize.transaction({isolationLevel:"REPEATABLE READ"},async transaction=>{
   const actor=await User.findByPk(req.user.id,{attributes:["id","role","status","sessionVersion"],transaction,lock:transaction.LOCK.UPDATE});
   if(!actor||actor.role!=="admin"||actor.status!=="active"||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))throw Object.assign(Error("Current administrator access required"),{code:403});
   const options={type:QueryTypes.SELECT,transaction,replacements:{basis,before:Number(before)||2147483648}};
   const source=" FROM payroll_profiles p JOIN users u ON u.id=p.employee_id WHERE 1=1"+(basis==="all"?"":" AND p.salary_type = :basis");
   const groups=await sequelize.query("SELECT p.salary_type AS basis,COUNT(*) AS profiles,SUM(CASE WHEN p.overtime_eligible=1 THEN 1 ELSE 0 END) AS overtimeEligible"+source+" GROUP BY p.salary_type ORDER BY p.salary_type",options);
   const rows=await sequelize.query("SELECT "+require("../utils/payrollCurrency").sql("profile","p")+" AS currency,p.id AS profileId,u.id AS employeeId,u.fullName,p.salary_type AS basis,CAST(p.base_salary AS CHAR) AS baseSalary,p.salary_revision AS version,p.standard_working_days AS standardDays,p.standard_working_hours AS standardHours,p.overtime_eligible AS overtimeEligible,CAST(p.overtime_rate AS CHAR) AS overtimeRate,CAST(p.tax_percentage AS CHAR) AS taxPercentage"+source+" AND p.id < :before ORDER BY p.id DESC LIMIT 26",options);
   return {groups:groups.map(g=>({...g,profiles:Number(g.profiles),overtimeEligible:Number(g.overtimeEligible)})),rows:rows.slice(0,25),hasMore:rows.length>25};
  });
  res.json(data);
 }catch(e){res.status(e.code===403?403:500).json({message:e.code===403?e.message:"Compensation summary unavailable"});}
};
