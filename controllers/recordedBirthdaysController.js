// Read-only current source report. No birthday observance or notification policy.
module.exports=m=>async(req,res)=>{
 const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
 const civil=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='1000-01-01'&&s<='9999-12-31'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 res.setHeader('Cache-Control','private, no-store');
 try{
  const {month,asOf,before}=req.query;
  if(Object.keys(req.query).some(k=>!['month','asOf','before'].includes(k))||typeof month!=='string'||! /^(?:[1-9]|1[0-2])$/.test(month)||!civil(asOf)||before!==undefined&&(typeof before!=='string'||! /^[1-9]\d*$/.test(before)||!Number.isSafeInteger(Number(before))))fail(400,'Choose a month (1–12), an explicit valid employment as-of date and a valid cursor');
  const data=await m.sequelize.transaction({isolationLevel:'REPEATABLE READ'},async transaction=>{
   const actor=await m.User.findByPk(req.user.id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!actor||req.user.role!=='admin'||actor.role!=='admin'||actor.status!=='active'||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))fail(403,'Current administrator authorization required');
   const source=' FROM users u LEFT JOIN (SELECT userId,COUNT(*) profileCount,MAX(dob) dob FROM userInfo GROUP BY userId) b ON b.userId=u.id WHERE EXISTS (SELECT 1 FROM employment_periods p WHERE p.employeeId=u.id AND p.voided=0 AND p.startDate<=:asOf AND (p.endDate IS NULL OR p.endDate>=:asOf))';
   const usable='b.profileCount=1 AND b.dob IS NOT NULL AND DATE(b.dob)>=\'1000-01-01\' AND DATE(b.dob)<=:asOf AND MONTH(b.dob) BETWEEN 1 AND 12 AND DAY(b.dob) BETWEEN 1 AND 31';
   const opts={transaction,replacements:{month:Number(month),asOf,before:Number(before)||null}};
   const [[counts]]=await m.sequelize.query('SELECT COUNT(*) recordedActivePeople,COALESCE(SUM('+usable+'),0) usableBirthdayPeople,COALESCE(SUM(CASE WHEN COALESCE(b.profileCount,0)=0 OR b.profileCount=1 AND b.dob IS NULL THEN 1 ELSE 0 END),0) missingBirthdayPeople,COALESCE(SUM(CASE WHEN b.profileCount>1 THEN 1 ELSE 0 END),0) ambiguousProfilePeople,COALESCE(SUM(CASE WHEN b.profileCount=1 AND b.dob IS NOT NULL AND (DATE(b.dob)<\'1000-01-01\' OR DATE(b.dob)>:asOf OR MONTH(b.dob)=0 OR DAY(b.dob)=0) THEN 1 ELSE 0 END),0) invalidOrFutureBirthdayPeople'+source,opts);
   const matching=source+' AND '+usable+' AND MONTH(b.dob)=:month';
   const [[count]]=await m.sequelize.query('SELECT COUNT(*) total'+matching,opts);
   const [raw]=await m.sequelize.query("SELECT u.id employeeId,u.fullName currentAccountName,DATE_FORMAT(b.dob,'%m-%d') recordedMonthDay"+matching+(before?' AND u.id < :before':'')+' ORDER BY u.id DESC LIMIT 51',opts);
   const rows=raw.slice(0,50);
   return{month:Number(month),asOf,total:Number(count.total),counts:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,Number(v)])),rows,hasMore:raw.length>50,pageRowCount:rows.length,basis:'People with a non-void recorded employment period covering the selected civil as-of date, inclusive of both endpoints. Each account counts once regardless of login role/status or overlapping periods.',context:'Selected month uses the current single profile’s stored birth month/day. Stored calendar month/day values are used without timezone conversion. Birth year, age and other private profile fields are not returned. Missing, ambiguous and invalid/future dates are excluded and counted across the whole recorded-active cohort.',limitations:'This is a recorded birthday-month source report, not a scheduled upcoming event or historical birthday snapshot. No February 29 observance rule, reminders, notifications or source correction/backfill is inferred. Employment membership is tested on the selected as-of date, not on a projected birthday. Current source edits can change results; later pages use fresh snapshots. Rows are in descending account ID order.',generatedAt:new Date().toISOString()};
  });
  return res.json({success:true,data});
 }catch(e){return res.status(Number.isInteger(e.code)?e.code:500).json({success:false,message:Number.isInteger(e.code)?e.message:'Recorded birthday report unavailable'});}
};




