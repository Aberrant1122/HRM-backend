const {Op}=require('sequelize');
const civil=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='1000-01-01'&&s<='9999-12-31'&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
async function evidence(models,user,asOf,transaction){
 if(user&&['admin','manager','employee'].includes(user.role))return{allowed:true,basis:'existing-internal-account-scope',employmentAsOf:null,periods:[]};
 if(user?.role!=='hr')return{allowed:false,basis:'outside-organization-target-scope',employmentAsOf:null,periods:[]};
 if(!civil(asOf))return{allowed:false,basis:'HR-target-requires-explicit-employment-reference-date',employmentAsOf:null,periods:[]};
 if(!models.EmploymentPeriod)throw Object.assign(Error('Recorded employment source unavailable; apply reviewed migrations'),{code:503});
 const rows=await models.EmploymentPeriod.findAll({where:{employeeId:user.id,voided:false,startDate:{[Op.lte]:asOf},[Op.or]:[{endDate:null},{endDate:{[Op.gte]:asOf}}]},attributes:['id','version','startDate','endDate'],order:[['startDate','DESC'],['id','DESC']],transaction}),valid=rows.filter(p=>Number.isSafeInteger(p.id)&&p.id>0&&Number.isSafeInteger(p.version)&&p.version>0&&civil(p.startDate)&&(p.endDate===null||civil(p.endDate)&&p.startDate<=p.endDate));
 return{allowed:valid.length>0,basis:'recorded-HR-employment-on-selected-date',employmentAsOf:asOf,periods:valid.map(p=>({id:p.id,version:p.version,startDate:p.startDate,endDate:p.endDate})),excludedInvalidMatchingRecords:rows.length-valid.length};
}
module.exports={civil,evidence};
