const table = 'payroll_component_records';
module.exports = {
  async up(q,S) {
    const ref = model => ({type:S.INTEGER,allowNull:false,references:{model,key:'id'},onDelete:'RESTRICT'});
    await q.createTable(table,{
      id:{type:S.INTEGER,autoIncrement:true,primaryKey:true},payrollId:ref('employee_payrolls'),actorId:ref('users'),
      kind:{type:S.STRING(16),allowNull:false},amount:{type:S.DECIMAL(16,4),allowNull:false},currency:{type:S.STRING(3),allowNull:false},
      reference:{type:S.STRING(240),allowNull:false},commandKey:{type:S.STRING(36),allowNull:false,unique:true},
      createdAt:{type:S.DATE,allowNull:false}
    });
    await q.addIndex(table,['payrollId','id']);
  },
  async down(q) {
    const [[{total}]]=await q.sequelize.query('SELECT COUNT(*) total FROM payroll_component_records');
    if(Number(total))throw Error('Retained payroll components require a forward migration');
    await q.dropTable(table);
  },
};
