const table='leave_carry_rule_revisions';
module.exports={
 async up(q,S){
  const ref=model=>({type:S.INTEGER,allowNull:false,references:{model,key:'id'},onDelete:'RESTRICT'});
  await q.createTable(table,{id:{type:S.INTEGER,autoIncrement:true,primaryKey:true},policyId:ref('leave_policies'),typeId:ref('leave_types'),actorId:ref('users'),
   targetStart:{type:S.DATEONLY,allowNull:false},revision:{type:S.INTEGER,allowNull:false},mode:{type:S.STRING(12),allowNull:false},
   cap:{type:S.DECIMAL(12,1),allowNull:true},expiry:{type:S.DATEONLY,allowNull:true},reason:{type:S.STRING(500),allowNull:false},
   commandKey:{type:S.STRING(36),unique:true,allowNull:false},payloadHash:{type:S.STRING(64),allowNull:false},createdAt:{type:S.DATE,allowNull:false}});
  await q.addIndex(table,['policyId','typeId','targetStart','revision'],{unique:true,name:'carry_rule_period_revision'});
 },
 async down(q){const [[{total}]]=await q.sequelize.query('SELECT COUNT(*) total FROM leave_carry_rule_revisions');if(Number(total))throw Error('Retained carry-forward revisions require a forward migration');await q.dropTable(table);}
};
