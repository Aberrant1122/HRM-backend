module.exports=(s,D)=>s.define("HrTaskNotice",{
 id:{type:D.UUID,primaryKey:true},taskId:{type:D.INTEGER,allowNull:false},taskVersion:{type:D.INTEGER,allowNull:false},
 recipientId:{type:D.INTEGER,allowNull:false},senderId:{type:D.INTEGER,allowNull:false},taskTitle:{type:D.STRING(200),allowNull:false},
 stage:D.STRING(16),deadlineVersion:D.INTEGER,dueDate:{type:D.DATEONLY,allowNull:false},asOf:{type:D.DATEONLY,allowNull:false},readAt:D.DATE
},{tableName:"hr_task_notices"});
