// HR balance routes still enforce current session and employee-scoped grants in their controller.
// Do not inherit payroll's legacy `hr` shortcut, project assignments or other domain grants.
module.exports=(req,res,next)=>{
 const balanceRead=req.method==='GET'&&/^\/leaves\/balances\/(access|types|[1-9]\d*)\/?$/.test(req.path),balanceWrite=req.method==='POST'&&/^\/leaves\/balances\/commands\/?$/.test(req.path);
 const ownReview=(req.method==='GET'&&/^\/performance\/reviewer(?:\/evaluation\/[1-9]\d*)?\/?$/.test(req.path))||(req.method==='POST'&&/^\/performance\/reviewer\/evaluation\/[1-9]\d*\/feedback\/?$/.test(req.path));
 const ownTask=(req.method==='GET'&&/^\/hr-tasks\/(access|mine(?:\/[1-9]\d*)?|review(?:\/[1-9]\d*)?|notices)\/?$/.test(req.path))||(req.method==='POST'&&/^\/hr-tasks\/(mine\/commands|review\/commands|notices\/[0-9a-f-]{36}\/read)\/?$/i.test(req.path));
 const ownProbation=(req.method==='GET'&&/^\/probation-feedback\/assigned(?:\/[1-9]\d*)?\/?$/.test(req.path))||(req.method==='POST'&&/^\/probation-feedback\/assigned\/[1-9]\d*\/feedback\/?$/.test(req.path));
 const scopedDecision=(req.method==='GET'&&/^\/probation-decisions\/(access|employee\/[1-9]\d*)\/?$/.test(req.path))||(req.method==='POST'&&/^\/probation-decisions\/employee\/[1-9]\d*\/commands\/?$/.test(req.path));
 const probationReminder=(req.method==='GET'&&/^\/probation-reminders\/(inbox|employee\/[1-9]\d*(?:\/recipients)?)\/?$/.test(req.path))||(req.method==='POST'&&/^\/probation-reminders\/employee\/[1-9]\d*\/commands\/?$/.test(req.path));
 const scopedPlan=['GET','POST'].includes(req.method)&&/^\/probation-decisions\/employee\/[1-9]\d*\/plan\/?$/.test(req.path);
 // These endpoints retain their own dedicated correction grant checks; no general attendance access.
 const correction=(req.method==='GET'&&/^\/attendance\/(correction-access|corrections(?:\/(?:source|[1-9]\d*))?)\/?$/.test(req.path))||(req.method==='POST'&&/^\/attendance\/corrections\/commands\/?$/.test(req.path));
 const ownClockAlert=req.method==='GET'&&/^\/attendance\/clock-alerts\/mine\/?$/.test(req.path)||req.method==='POST'&&/^\/attendance\/clock-alerts\/[1-9]\d*\/read\/?$/.test(req.path);
 if(!ownClockAlert&&!correction&&!scopedPlan&&req.user.role==='hr'&&!probationReminder&&!scopedDecision&&!ownProbation&&!ownTask&&!ownReview&&!balanceRead&&!balanceWrite&&!['/payroll-access','/employee-documents','/employment-records'].some(path=>req.path===path||req.path.startsWith(path+'/')))return res.status(403).json({success:false,message:'HR access for this domain is not configured'});
 return next();
};

