module.exports=async(models,ids,qi,Sequelize)=>{
  const legacyFields=model=>Object.keys(model.rawAttributes).filter(k=>k!=='currency');
  const oldProfile=await models.PayrollProfile.create({employee_id:ids.employee,salary_type:'monthly',base_salary:'1000.00',standard_working_days:20,standard_working_hours:8},{fields:legacyFields(models.PayrollProfile)});
  ids.oldProfile=oldProfile.id;
  for(const [i,month] of ['01','02'].entries()){
    const period=await models.PayrollPeriod.create({name:'Synthetic legacy '+month,start_date:'2032-'+month+'-01',end_date:'2032-'+month+'-28',payroll_type:'monthly',status:'paid',created_by:ids.admin},{fields:legacyFields(models.PayrollPeriod)});
    const row=await models.EmployeePayroll.create({employee_id:ids.employee,payroll_period_id:period.id,status:'paid',locked:true,snapshot:{},gross_salary:i?'50.22':'20.11',total_deductions:'1.00',net_salary:i?'49.22':'19.11'},{fields:legacyFields(models.EmployeePayroll)});
    ids['oldPeriod'+i]=period.id;ids['oldRow'+i]=row.id;
  }
  await require('../../migrations/20261117002000-payroll-currency-provenance').up(qi,Sequelize);
};
