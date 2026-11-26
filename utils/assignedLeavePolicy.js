module.exports=async(models,userId,typeId,transaction)=>{
 const assignment=await models.LeavePolicyAssignment.findOne({where:{userId},order:[['version','DESC']],transaction});
 const policy=assignment?await models.LeavePolicy.findByPk(assignment.policyId,{transaction}):null,allowance=policy?.allowances?.[String(typeId)];
 if(!policy||typeof allowance!=='number'||!Number.isFinite(allowance)||allowance<0||allowance>2147483647||!Number.isInteger(allowance*2))throw Object.assign(Error('Applicable leave allowance is unconfigured or invalid; administrator policy assignment required'),{code:409});
 return{policyId:policy.id,policyName:policy.name,assignmentVersion:assignment.version,allowance,rules:policy.rules??null};
};
