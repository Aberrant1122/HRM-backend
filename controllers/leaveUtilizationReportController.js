const charging=require('../utils/leaveCharging'),balance=require('../utils/leaveBalance');
module.exports=m=>async(req,res)=>{
 const fail=(code,message)=>{throw Object.assign(Error(message),{code});},positive=s=>typeof s==='string'&&/^[1-9]\d*$/.test(s)&&Number.isSafeInteger(Number(s));
 try{
  const {date,employeeId,typeId,page:pageInput}=req.query;
  if(Object.keys(req.query).some(k=>!['date','employeeId','typeId','page'].includes(k))||!charging.civil(date)||employeeId!==undefined&&!positive(employeeId)||typeId!==undefined&&!positive(typeId)||pageInput!==undefined&&!positive(pageInput))fail(400,'Explicit civil leave-year reference date and valid optional account/type/page required');
  const page=Number(pageInput||1);if(page>100000)fail(400,'Page exceeds supported range');
  const data=await m.sequelize.transaction({isolationLevel:'REPEATABLE READ'},async transaction=>{
   const actor=await m.User.findByPk(req.user.id,{transaction});if(!actor||req.user.role!=='admin'||actor.role!=='admin'||actor.status!=='active'||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))fail(403,'Current administrator report access required');
   const current=" FROM leave_policy_assignments a LEFT JOIN leave_policies p ON p.id=a.policyId LEFT JOIN users u ON u.id=a.userId ",latest="NOT EXISTS (SELECT 1 FROM leave_policy_assignments newer WHERE newer.userId=a.userId AND (newer.version>a.version OR newer.version=a.version AND newer.id>a.id))",account=" AND (:employeeId IS NULL OR a.userId=:employeeId)",keys=" JOIN JSON_TABLE(COALESCE(JSON_KEYS(p.allowances),JSON_ARRAY()), '$[*]' COLUMNS(typeKey VARCHAR(100) PATH '$')) k ON TRUE LEFT JOIN leave_types t ON CAST(t.id AS CHAR)=k.typeKey ",where=' WHERE '+latest+account+" AND (:typeId IS NULL OR k.typeKey=CAST(:typeId AS CHAR))",replacements={employeeId:employeeId?Number(employeeId):null,typeId:typeId?Number(typeId):null,offset:(page-1)*50},options={replacements,transaction};
   const [[scope]]=await m.sequelize.query('SELECT COUNT(*) assignedAccounts,COALESCE(SUM(p.id IS NULL OR JSON_TYPE(p.allowances)<>\'OBJECT\' OR JSON_LENGTH(p.allowances)=0),0) unconfiguredAssignedAccounts'+current+' WHERE '+latest+account,options);
   const [[count]]=await m.sequelize.query('SELECT COUNT(*) totalRows'+current+keys+where,options);
   const [raw]=await m.sequelize.query('SELECT a.id assignmentId,a.userId employeeId,a.policyId,a.version assignmentVersion,u.fullName currentAccountName,u.role currentAccountRole,u.status currentAccountStatus,p.name policyName,k.typeKey,t.name currentTypeName,t.status currentTypeStatus'+current+keys+where+' ORDER BY a.userId,k.typeKey LIMIT 50 OFFSET :offset',options),rows=[];
   const totals={completeRows:0,needsReviewRows:0,allowance:0,approvedUnits:0,adjustmentUnits:0,remainingUnits:0};
   for(const row of raw){
    try{
     if(!positive(row.typeKey)||!row.currentTypeName||!row.currentAccountName)fail(409,'Assigned type/account source is missing or invalid');
     const b=await balance(m,row.employeeId,Number(row.typeKey),date,transaction);
     if(b.policy.policyId!==row.policyId||b.policy.assignmentVersion!==row.assignmentVersion)fail(409,'Assignment source requires data review');
     const next={};for(const field of ['allowance','approvedUnits','adjustmentUnits','remainingUnits']){next[field]=totals[field]+b[field];if(!Number.isSafeInteger(next[field]*2))fail(409,'Page totals exceed exact half-day precision');}
     rows.push({...row,leaveTypeId:Number(row.typeKey),state:'verified',periodStart:b.periodStart,periodEnd:b.periodEnd,countingBasis:b.policy.rules.countingBasis,allowance:b.allowance,approvedUnits:b.approvedUnits,adjustmentUnits:b.adjustmentUnits,remainingUnits:b.remainingUnits,journalVersion:b.version,approvalReceipts:b.approvedChargeReceipts,adjustmentReceipts:b.adjustmentReceipts});
     totals.completeRows++;Object.assign(totals,next);
    }catch(e){if(e.code!==409)throw e;rows.push({...row,state:'needs-review',message:e.message});totals.needsReviewRows++;}
   }
   return{date,page,totalRows:Number(count.totalRows),totalPages:Math.ceil(Number(count.totalRows)/50),scope:{assignedAccounts:Number(scope.assignedAccounts),unconfiguredAssignedAccounts:Number(scope.unconfiguredAssignedAccounts)},rows,pageTotals:totals,basis:'Current explicit policy assignment only. The reference date selects the full policy leave year; approved utilization comes from verified retained approval receipts, with signed journal corrections shown separately. Pending requests are not reserved.',limitations:'Current read-time balances for the entire selected leave year, including already-approved future leave. Not a historical as-of snapshot, workforce census, clipped date-range report, automatic carry-forward or payroll decision. Only policy-configured account/type pairs are rows; unassigned accounts are outside this scope. Page totals include verified rows on this page only. Each page is a new repeatable snapshot.',generatedAt:new Date().toISOString()};
  });
  res.setHeader('Cache-Control','private, no-store');return res.json({success:true,data});
 }catch(e){return res.status(Number.isInteger(e.code)?e.code:500).json({success:false,message:Number.isInteger(e.code)?e.message:'Leave utilization report unavailable'});}
};
