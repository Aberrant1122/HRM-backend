const table='settlement_draft_revisions';
module.exports={
 async up(q,S){
  const ref=model=>({type:S.INTEGER,allowNull:false,references:{model,key:'id'},onDelete:'RESTRICT'});
  await q.createTable(table,{id:{type:S.INTEGER,autoIncrement:true,primaryKey:true},caseId:ref('offboarding_cases'),actorId:ref('users'),
   revision:{type:S.INTEGER,allowNull:false},reason:{type:S.STRING(500),allowNull:false},currency:{type:S.STRING(3),allowNull:false},
   items:{type:S.JSON,allowNull:false},credit:{type:S.DECIMAL(20,4),allowNull:false},deduction:{type:S.DECIMAL(20,4),allowNull:false},net:{type:S.DECIMAL(20,4),allowNull:false},
   commandKey:{type:S.STRING(36),unique:true,allowNull:false},payloadHash:{type:S.STRING(64),allowNull:false},createdAt:{type:S.DATE,allowNull:false}});
  await q.addIndex(table,['caseId','revision'],{unique:true});
 },
 async down(q){const [[{total}]]=await q.sequelize.query('SELECT COUNT(*) total FROM settlement_draft_revisions');if(Number(total))throw Error('Settlement revisions require a forward migration');await q.dropTable(table);}
};
