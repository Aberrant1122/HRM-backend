const {QueryTypes}=require("sequelize");
const positive=s=>typeof s==="string"&&/^[1-9]\d*$/.test(s)&&Number.isSafeInteger(Number(s));
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
module.exports=({sequelize,User})=>async(req,res)=>{
 try{
  const {periodId,rowId}=req.params,{before}=req.query;
  if(!positive(periodId)||rowId!==undefined&&!positive(rowId)||before!==undefined&&(rowId||!positive(before)))fail(400,"Invalid period, payslip or cursor");
  const data=await sequelize.transaction({isolationLevel:"REPEATABLE READ"},async transaction=>{
   const actor=await User.findByPk(req.user.id,{attributes:["id","role","status","sessionVersion"],transaction,lock:transaction.LOCK.UPDATE});
   if(!actor||actor.role!=="admin"||actor.status!=="active"||Number(req.user.sessionVersion??0)!==Number(actor.sessionVersion))fail(403,"Current administrator access required");
   const options={type:QueryTypes.SELECT,transaction,replacements:{periodId:Number(periodId),rowId:Number(rowId)||0,before:Number(before)||2147483648}};
   const currency=require("../utils/payrollCurrency").sql;
   const [period]=await sequelize.query("SELECT "+currency("period","p")+" AS currency,p.id,p.name,p.start_date AS startDate,end_date AS endDate,payroll_type AS type,status FROM payroll_periods p WHERE p.id = :periodId",options);
   if(!period)fail(404,"Payroll period unavailable");
   const source=" FROM employee_payrolls e JOIN users u ON u.id=e.employee_id WHERE e.payroll_period_id = :periodId";
   const fields="SELECT "+currency("row","e")+" AS currency,e.id,e.employee_id AS employeeId,u.fullName,e.status,e.locked,CAST(e.gross_salary AS CHAR) gross,CAST(e.total_deductions AS CHAR) deductions,CAST(e.net_salary AS CHAR) net";
   if(rowId){
    const [row]=await sequelize.query(fields+source+" AND e.id = :rowId",options);
    if(!row)fail(404,"Payslip unavailable for this period");
    return {period,row};
   }
   const groups=await sequelize.query('SELECT status,currency,COUNT(*) records,IF(currency IS NULL,NULL,CAST(SUM(gross) AS CHAR)) gross,IF(currency IS NULL,NULL,CAST(SUM(deductions) AS CHAR)) deductions,IF(currency IS NULL,NULL,CAST(SUM(net) AS CHAR)) net FROM (SELECT e.status,'+currency('row','e')+' currency,e.gross_salary gross,e.total_deductions deductions,e.net_salary net'+source+') facts GROUP BY status,currency ORDER BY status,currency',options);
   const rows=await sequelize.query(fields+source+" AND e.id < :before ORDER BY e.id DESC LIMIT 26",options);
   return {period,groups,rows:rows.slice(0,25),hasMore:rows.length>25};
  });res.json(data);
 }catch(e){res.status(Number.isInteger(e.code)?e.code:500).json({message:Number.isInteger(e.code)?e.message:"Payroll statement unavailable"});}
};
