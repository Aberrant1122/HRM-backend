// The new HR role is currently authorized for the employee-document workflow only.
// Do not inherit payroll's legacy `hr` shortcut, project assignments or other domain grants.
module.exports=(req,res,next)=>{
 if(req.user.role==='hr'&&req.path!=='/employee-documents'&&!req.path.startsWith('/employee-documents/'))return res.status(403).json({success:false,message:'HR access for this domain is not configured'});
 return next();
};
