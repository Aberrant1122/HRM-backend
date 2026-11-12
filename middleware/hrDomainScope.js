// HR balance routes still enforce current session and employee-scoped grants in their controller.
// Do not inherit payroll's legacy `hr` shortcut, project assignments or other domain grants.
module.exports=(req,res,next)=>{
 const balanceRead=req.method==='GET'&&/^\/leaves\/balances\/(access|types|[1-9]\d*)\/?$/.test(req.path),balanceWrite=req.method==='POST'&&/^\/leaves\/balances\/commands\/?$/.test(req.path);
 if(req.user.role==='hr'&&!balanceRead&&!balanceWrite&&!['/employee-documents','/employment-records'].some(path=>req.path===path||req.path.startsWith(path+'/')))return res.status(403).json({success:false,message:'HR access for this domain is not configured'});
 return next();
};
