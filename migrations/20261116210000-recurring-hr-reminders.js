module.exports={
 async up(q,D){await q.createTable("hr_reminder_schedules",{id:{type:D.UUID,primaryKey:true},ownerId:{type:D.INTEGER,allowNull:false,references:{model:"users",key:"id"},onDelete:"RESTRICT"},
   title:{type:D.STRING(180),allowNull:false},firstDate:{type:D.DATEONLY,allowNull:false},endDate:D.DATEONLY,intervalDays:{type:D.INTEGER,allowNull:false},stoppedAt:D.DATE,stopReason:D.STRING(300),createdAt:{type:D.DATE,allowNull:false},updatedAt:{type:D.DATE,allowNull:false}});
   await q.addIndex("hr_reminder_schedules",["ownerId","firstDate"],{name:"hr_reminder_owner_start"});},
 async down(q){const [[r]]=await q.sequelize.query("SELECT COUNT(*) total FROM hr_reminder_schedules");if(Number(r.total))throw Error("Retained HR reminder schedules exist. Roll forward.");await q.dropTable("hr_reminder_schedules");}
};
