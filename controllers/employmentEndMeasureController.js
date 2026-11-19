const {QueryTypes}=require('sequelize'),measure=require('../utils/employmentEndMeasure');
module.exports=m=>async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 try{
  if(Object.keys(req.query).some(k=>!['source','numerator','denominator','from','to','asOf'].includes(k)))return res.status(400).json({message:'Unsupported measure parameter'});
  try{measure([],req.query);}catch(e){return res.status(400).json({message:e.message});}
  const data=await m.sequelize.transaction({isolationLevel:'REPEATABLE READ'},async transaction=>{
   const actor=await m.User.findByPk(req.user.id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!actor||actor.role!=='admin'||actor.role!==req.user.role||actor.status!=='active'||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))throw Object.assign(Error('Current administrator required'),{code:403});
   const rows=await m.EmploymentPeriod.findAll({attributes:['employeeId','startDate','endDate','voided'],raw:true,transaction});
   const [coverage]=await m.sequelize.query('SELECT COUNT(*) accountsWithoutValidEpisode FROM users u WHERE NOT EXISTS (SELECT 1 FROM employment_periods p WHERE p.employeeId=u.id AND p.voided=0 AND p.startDate>=\'1000-01-01\' AND (p.endDate IS NULL OR p.endDate>=p.startDate))',{transaction,type:QueryTypes.SELECT});
   return {...measure(rows,req.query),coverage};
  });res.json({data});
 }catch(e){res.status(e.code===403?403:500).json({message:e.code===403?e.message:'Employment-end statistics unavailable'});}
};
