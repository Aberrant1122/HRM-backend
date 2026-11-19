const {QueryTypes}=require('sequelize');
const {civil}=require('../utils/leaveCharging');
module.exports=m=>async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  const {source,from,to,asOf,before}=req.query;
  if(!['reported-resignation','ended-episode'].includes(source)||![from,to,asOf].every(d=>typeof d==='string'&&civil(d))||from>to||to>asOf||before!==undefined&&(typeof before!=='string'||!/^\d+$/.test(before)||Number(before)<1||!Number.isSafeInteger(Number(before)))||Object.keys(req.query).some(k=>!['source','from','to','asOf','before'].includes(k)))return res.status(400).json({message:'Select a source, inclusive dates and an as-of date on or after the window'});
  try{
    const data=await m.sequelize.transaction({isolationLevel:'REPEATABLE READ'},async transaction=>{
      const actor=await m.User.findByPk(req.user.id,{transaction,lock:transaction.LOCK.UPDATE});
      if(!actor||actor.role!=='admin'||req.user.role!==actor.role||actor.status!=='active'||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))throw Object.assign(Error('Current administrator required'),{code:403});
      const query=(sql)=>m.sequelize.query(sql,{type:QueryTypes.SELECT,transaction,replacements:{from,to,asOf,before:Number(before)||2147483648}});
      const resignation=source==='reported-resignation';
      const table=resignation?'offboarding_cases':'employment_periods';
      const day=resignation?'reportedDate':'endDate';
      const qualifies=resignation?"s.exitType='resignation'":"s.voided=0 AND s.startDate >= '1000-01-01' AND s.endDate >= s.startDate AND s.endDate < :asOf";
      const scope=' FROM '+table+' s JOIN users u ON u.id=s.employeeId';
      const matched=scope+' WHERE '+qualifies+' AND s.'+day+' BETWEEN :from AND :to';
      const [total]=await query('SELECT COUNT(*) records,COUNT(DISTINCT s.employeeId) people'+matched);
      const [coverage]=await query(resignation?
        "SELECT COUNT(*) sourceRecords,COUNT(CASE WHEN s.exitType='resignation' AND s.reportedDate IS NULL THEN 1 END) undated,COUNT(CASE WHEN s.exitType<>'resignation' THEN 1 END) otherType FROM offboarding_cases s":
        "SELECT COUNT(*) sourceRecords,COUNT(CASE WHEN s.voided=0 AND s.endDate IS NULL THEN 1 END) openEpisodes,COUNT(CASE WHEN s.voided=0 AND s.endDate>=:asOf THEN 1 END) stillEffectiveOrFutureEnd,COUNT(CASE WHEN s.voided=1 THEN 1 END) voidedEpisodes FROM employment_periods s");
      const rows=await query('SELECT s.id,s.employeeId,u.fullName,s.'+day+' AS eventDate,'+(resignation?'s.status AS checklistStatus,s.lastWorkingDate AS plannedLastWorkingDate':'s.startDate AS episodeStart')+matched+' AND s.id < :before ORDER BY s.id DESC LIMIT 51');
      return {source,from,to,asOf,total,coverage,rows:rows.slice(0,50),hasMore:rows.length>50};
    });res.json({data});
  }catch(e){res.status(e.code===403?403:500).json({message:e.code===403?e.message:'Separation report unavailable'});}
};
