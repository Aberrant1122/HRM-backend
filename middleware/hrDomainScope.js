// HR may reach documents and employment records; employment editing still requires an exact scoped grant.
// Do not inherit payroll's legacy `hr` shortcut, project assignments or other domain grants.
module.exports=(req,res,next)=>{
 if(req.user.role==='hr'&&!['/employee-documents','/employment-records'].some(path=>req.path===path||req.path.startsWith(path+'/')))return res.status(403).json({success:false,message:'HR access for this domain is not configured'});
 return next();
};
