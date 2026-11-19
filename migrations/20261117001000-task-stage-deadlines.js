module.exports={
 async up(q,D){
  for(const column of ['submissionDueDate','approvalDueDate'])await q.addColumn('hr_tasks',column,{type:D.DATEONLY,allowNull:true});
  await q.addColumn('hr_tasks','deadlineVersion',{type:D.INTEGER,allowNull:false,defaultValue:0});
  await q.addColumn('hr_task_notices','stage',{type:D.STRING(16),allowNull:true});
  await q.addColumn('hr_task_notices','deadlineVersion',{type:D.INTEGER,allowNull:true});
  await q.addIndex('hr_task_notices',['taskId','recipientId','asOf','stage'],{unique:true,name:'hr_task_notice_recipient_day_stage'});
  await q.removeIndex('hr_task_notices','hr_task_notice_recipient_day');
  await q.createTable('hr_task_deadline_events',{
   id:{type:D.INTEGER,primaryKey:true,autoIncrement:true},taskId:{type:D.INTEGER,allowNull:false,references:{model:'hr_tasks',key:'id'},onDelete:'RESTRICT'},
   actorId:{type:D.INTEGER,allowNull:false,references:{model:'users',key:'id'},onDelete:'RESTRICT'},version:{type:D.INTEGER,allowNull:false},
   submissionDueDate:D.DATEONLY,approvalDueDate:D.DATEONLY,reason:{type:D.STRING(500),allowNull:false},commandKey:{type:D.STRING(36),unique:true,allowNull:false},
   payloadHash:{type:D.STRING(64),allowNull:false},createdAt:{type:D.DATE,allowNull:false}});
  await q.addIndex('hr_task_deadline_events',['taskId','version'],{unique:true});
 },
 async down(q){
  const [[{total}]]=await q.sequelize.query('SELECT (SELECT COUNT(*) FROM hr_task_deadline_events)+(SELECT COUNT(*) FROM hr_tasks WHERE submissionDueDate IS NOT NULL OR approvalDueDate IS NOT NULL)+(SELECT COUNT(*) FROM hr_task_notices WHERE stage IS NOT NULL) total');
  if(Number(total))throw Error('Recorded stage deadlines or notices require a forward migration');
  await q.addIndex('hr_task_notices',['taskId','recipientId','asOf'],{unique:true,name:'hr_task_notice_recipient_day'});
  await q.removeIndex('hr_task_notices','hr_task_notice_recipient_day_stage');
  await q.dropTable('hr_task_deadline_events');for(const col of ['stage','deadlineVersion'])await q.removeColumn('hr_task_notices',col);
  for(const col of ['submissionDueDate','approvalDueDate','deadlineVersion'])await q.removeColumn('hr_tasks',col);
 }
};
