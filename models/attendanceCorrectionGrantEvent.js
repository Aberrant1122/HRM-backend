module.exports=(db,D)=>db.define('AttendanceCorrectionGrantEvent',{
  id:{type:D.INTEGER,primaryKey:true,autoIncrement:true},userId:D.INTEGER,actorId:D.INTEGER,version:D.INTEGER,active:D.BOOLEAN,reason:D.STRING(500),createdAt:D.DATE,
},{tableName:'attendance_correction_grant_events',timestamps:false});
