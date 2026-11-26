module.exports=(s,D)=>s.define("HrReminderSchedule",{
  id:{type:D.UUID,primaryKey:true},ownerId:{type:D.INTEGER,allowNull:false},title:{type:D.STRING(180),allowNull:false},
  firstDate:{type:D.DATEONLY,allowNull:false},endDate:D.DATEONLY,intervalDays:{type:D.INTEGER,allowNull:false},
  stoppedAt:D.DATE,stopReason:D.STRING(300)
},{tableName:"hr_reminder_schedules"});
