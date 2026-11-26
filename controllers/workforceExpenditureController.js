const {QueryTypes}=require("sequelize");
const date=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&x>="1000-01-01"&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
module.exports=({sequelize,User})=>async(req,res)=>{
 try{
  const {from,to,before}=req.query;
  if(!date(from)||!date(to)||from>to||before!==undefined&&(typeof before!=="string"||!/^[1-9]\d*$/.test(before)||!Number.isSafeInteger(Number(before))))return res.status(400).json({message:"Choose a valid inclusive period-end date range and cursor"});
  const data=await sequelize.transaction({isolationLevel:"REPEATABLE READ"},async transaction=>{
   const actor=await User.findByPk(req.user.id,{attributes:["role","status","sessionVersion"],transaction,lock:transaction.LOCK.UPDATE});
   if(!actor||actor.status!=="active"||actor.role!=="admin"||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))throw Object.assign(Error("Current administrator access required"),{code:403});
   const options={type:QueryTypes.SELECT,transaction,replacements:{from,to,before:Number(before)||2147483648}};
   const source=" FROM payroll_periods p JOIN employee_payrolls e ON e.payroll_period_id=p.id JOIN users u ON u.id=e.employee_id WHERE p.end_date BETWEEN :from AND :to";
   const currency=require('../utils/payrollCurrency').sql('row','e');
   const paid=source+" AND e.status='paid'";
   const [summary]=await sequelize.query('SELECT COUNT(DISTINCT e.employee_id) employees,COUNT(DISTINCT p.id) periods,COUNT(*) payrollRows'+paid,options);
   const [coverage]=await sequelize.query("SELECT COUNT(*) notMarkedPaid"+source+" AND e.status<>'paid'",options);
   const totals=await sequelize.query('SELECT currency,COUNT(*) payrollRows,IF(currency IS NULL,NULL,CAST(SUM(gross) AS CHAR)) gross FROM (SELECT '+currency+' AS currency,e.gross_salary gross'+paid+') facts GROUP BY currency ORDER BY currency',options);
   const employees=await sequelize.query('SELECT e.employee_id employeeId,u.fullName,COUNT(DISTINCT p.id) periods,COUNT(*) payrollRows'+paid+' AND e.employee_id < :before GROUP BY e.employee_id,u.fullName ORDER BY e.employee_id DESC LIMIT 26',options);
   const rows=employees.slice(0,25);
   if(rows.length){
     const ids=rows.map(x=>x.employeeId);
     const groups=await sequelize.query('SELECT employeeId,currency,COUNT(*) payrollRows,IF(currency IS NULL,NULL,CAST(SUM(gross) AS CHAR)) gross FROM (SELECT e.employee_id employeeId,'+currency+' currency,e.gross_salary gross'+paid+' AND e.employee_id IN (:ids)) facts GROUP BY employeeId,currency ORDER BY employeeId,currency',{...options,replacements:{...options.replacements,ids}});
     for(const row of rows)row.totals=groups.filter(x=>x.employeeId===row.employeeId);
   }
   return {from,to,summary:{...summary,...coverage,totals},rows,hasMore:employees.length>25};
  });res.json(data);
 }catch(e){res.status(e.code===403?403:500).json({message:e.code===403?e.message:"Payroll expenditure unavailable"});}
};
