module.exports={
 async up(q,D){
  const ref=table=>({type:D.INTEGER,allowNull:false,references:{model:table,key:"id"},onDelete:"RESTRICT"});
  await q.createTable("hr_task_notices",{id:{type:D.UUID,primaryKey:true},taskId:ref("hr_tasks"),taskVersion:{type:D.INTEGER,allowNull:false},recipientId:ref("users"),senderId:ref("users"),
    taskTitle:{type:D.STRING(200),allowNull:false},dueDate:{type:D.DATEONLY,allowNull:false},asOf:{type:D.DATEONLY,allowNull:false},readAt:D.DATE,createdAt:{type:D.DATE,allowNull:false},updatedAt:{type:D.DATE,allowNull:false}});
  await q.addIndex("hr_task_notices",["taskId","recipientId","asOf"],{unique:true,name:"hr_task_notice_recipient_day"});
 },
 async down(q){const [[r]]=await q.sequelize.query("SELECT COUNT(*) total FROM hr_task_notices");if(Number(r.total))throw Error("Retained task notices exist. Roll forward.");await q.dropTable("hr_task_notices");}
};
