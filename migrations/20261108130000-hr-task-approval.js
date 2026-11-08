'use strict';
module.exports={
 async up(q,S){
  const ref=(nullable=false)=>({type:S.INTEGER,allowNull:nullable,references:{model:'users',key:'id'},onDelete:'RESTRICT',onUpdate:'CASCADE'}),stamps=()=>({createdAt:{type:S.DATE,allowNull:false},updatedAt:{type:S.DATE,allowNull:false}});
  for(const field of ['submittedBy','approvedBy'])await q.addColumn('hr_tasks',field,ref(true));
  for(const field of ['submittedAt','approvedAt'])await q.addColumn('hr_tasks',field,{type:S.DATE,allowNull:true});
  await q.createTable('hr_task_approval_grants',{userId:{...ref(),primaryKey:true},active:{type:S.BOOLEAN,allowNull:false},version:{type:S.INTEGER,allowNull:false},grantedBy:ref(),...stamps()});
  await q.createTable('hr_task_approval_grant_events',{id:{type:S.INTEGER,primaryKey:true,autoIncrement:true,allowNull:false},userId:ref(),actorId:ref(),version:{type:S.INTEGER,allowNull:false},commandKey:{type:S.STRING(36),allowNull:false,unique:true},payloadHash:{type:S.STRING(64),allowNull:false},details:{type:S.JSON,allowNull:false},...stamps()});
  await q.addIndex('hr_task_approval_grant_events',['userId','version'],{unique:true});
 },
 async down(q){const [[r]]=await q.sequelize.query("SELECT (SELECT COUNT(*) FROM hr_task_approval_grants)+(SELECT COUNT(*) FROM hr_task_approval_grant_events)+(SELECT COUNT(*) FROM hr_task_events WHERE action IN ('submit','approve')) total");if(Number(r.total))throw Error('Refusing to remove retained HR task approval history; roll forward');await q.dropTable('hr_task_approval_grant_events');await q.dropTable('hr_task_approval_grants');for(const field of ['approvedAt','submittedAt','approvedBy','submittedBy'])await q.removeColumn('hr_tasks',field);}
};
