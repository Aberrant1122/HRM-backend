const {QueryTypes}=require("sequelize");
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const validId=x=>typeof x==="string"&&/^[1-9]\d*$/.test(x)&&Number.isSafeInteger(Number(x));
function amountField(field){
 const text="JSON_UNQUOTE(JSON_EXTRACT(e.snapshot,'$."+field+"'))";
 // Stored scalar numbers or decimal strings only. Unknown or malformed historical facts remain null.
 return "CASE WHEN "+text+" REGEXP '^[0-9]{1,16}([.][0-9]{1,18})?$' THEN CAST("+text+" AS DECIMAL(36,18)) END";
}
module.exports=({sequelize,User})=>async(req,res)=>{
 try{
  const {periodId}=req.params,{before}=req.query;if(!validId(periodId)||before!==undefined&&!validId(before))fail(400,"Invalid payroll period or cursor");
  const data=await sequelize.transaction({isolationLevel:"REPEATABLE READ"},async transaction=>{
   const actor=await User.findByPk(req.user.id,{attributes:["id","role","status","sessionVersion"],transaction,lock:transaction.LOCK.UPDATE});
   if(!actor||actor.role!=="admin"||actor.status!=="active"||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))fail(403,"Current administrator access required");
   const options={type:QueryTypes.SELECT,transaction,replacements:{id:Number(periodId),before:Number(before)||2147483648}};
   const [period]=await sequelize.query("SELECT id,name,start_date AS startDate,end_date AS endDate,status FROM payroll_periods WHERE id = :id",options);
   if(!period)fail(404,"Payroll period unavailable");
   const source=" FROM employee_payrolls e JOIN users u ON u.id=e.employee_id WHERE e.payroll_period_id = :id";
   const fact=amountField("overtimeHours");
   const [totals]=await sequelize.query("SELECT COUNT(*) records, COUNT(hours) known, SUM(CASE WHEN hours>0 THEN 1 ELSE 0 END) positive,CAST(SUM(hours) AS CHAR) totalHours FROM (SELECT "+fact+" hours"+source+") recorded",options);
   const rows=await sequelize.query("SELECT "+require("../utils/payrollCurrency").sql("row","e")+" AS currency,e.id,e.employee_id AS employeeId,u.fullName,e.status,CAST("+fact+" AS CHAR) overtimeHours,CAST("+amountField("totalWorkedHours")+" AS CHAR) workedHours,CAST("+amountField("overtimePay")+" AS CHAR) overtimePay"+source+" AND e.id < :before ORDER BY e.id DESC LIMIT 26",options);
   return {period,summary:{records:Number(totals.records),known:Number(totals.known),positive:Number(totals.positive||0),missing:Number(totals.records)-Number(totals.known),totalHours:totals.totalHours},rows:rows.slice(0,25),hasMore:rows.length>25};
  });res.json(data);
 }catch(e){res.status(Number.isInteger(e.code)?e.code:500).json({message:Number.isInteger(e.code)?e.message:"Recorded overtime report unavailable"});}
};
