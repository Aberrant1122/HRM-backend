const {Op}=require('sequelize');
module.exports=async(models,{userId,typeId,period,transaction})=>{
 const rows=await models.LeaveBalanceAdjustment.findAll({where:{employeeId:userId,leaveTypeId:typeId,periodStart:{[Op.lte]:period.periodEnd},periodEnd:{[Op.gte]:period.periodStart}},order:[['version','ASC']],transaction});let adjusted=0,version=0;const receipts=[];
 for(const r of rows){const n=Number(r.delta);if(r.periodStart!==period.periodStart||r.periodEnd!==period.periodEnd||!Number.isFinite(n)||!Number.isSafeInteger(n*2)||n===0||r.version!==version+1)throw Object.assign(Error('Retained balance adjustment period or sequence requires data review'),{code:409});version=r.version;adjusted+=n;receipts.push({adjustmentId:r.id,version:r.version,delta:n});}
 if(!Number.isSafeInteger(adjusted*2))throw Object.assign(Error('Adjusted balance requires data review'),{code:409});return{adjusted,version,receipts};
};
