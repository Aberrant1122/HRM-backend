// Role-change preservation only. Other payroll/status/date/permission checks remain.
const {Op}=require('sequelize');
module.exports={
 where:()=>({[Op.or]:[{role:'employee'},{role:'hr',retainedEmployeeMembership:true}]}),
 includes:u=>u?.role==='employee'||u?.role==='hr'&&u.retainedEmployeeMembership===true,
 basis:'employee login accounts plus audited employee-to-HR membership preservation; not a complete workforce or new eligibility policy'
};
