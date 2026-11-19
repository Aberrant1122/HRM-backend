const table='settlement_handoff_events';
module.exports={
  async up(q,S){
    const ref=model=>({type:S.INTEGER,allowNull:false,references:{model,key:'id'},onDelete:'RESTRICT'});
    await q.createTable(table,{
      id:{type:S.INTEGER,primaryKey:true,autoIncrement:true},caseId:ref('offboarding_cases'),actorId:ref('users'),recipientId:ref('users'),
      action:{type:S.STRING(12),allowNull:false},caseVersion:{type:S.INTEGER,allowNull:false},note:{type:S.STRING(500),allowNull:false},
      sequence:{type:S.INTEGER,allowNull:false},clearanceStatus:{type:S.STRING(20),allowNull:false},pendingItems:{type:S.INTEGER,allowNull:false},
      commandKey:{type:S.STRING(36),unique:true,allowNull:false},payloadHash:{type:S.STRING(64),allowNull:false},createdAt:{type:S.DATE,allowNull:false},
    });
    await q.addIndex(table,['caseId','sequence'],{unique:true});await q.addIndex(table,['recipientId','caseId']);
  },
  async down(q){const [[{total}]]=await q.sequelize.query('SELECT COUNT(*) total FROM settlement_handoff_events');if(Number(total))throw Error('Settlement handoff history requires a forward migration');await q.dropTable(table);}
};
