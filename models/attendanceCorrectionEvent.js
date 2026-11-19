module.exports = (db,D) => db.define('AttendanceCorrectionEvent',{
  id:{type:D.INTEGER,primaryKey:true,autoIncrement:true},correctionId:D.INTEGER,actorId:D.INTEGER,version:D.INTEGER,
  action:D.STRING(16),reason:D.STRING(2000),before:D.JSON,after:D.JSON,createdAt:D.DATE,
},{tableName:'attendance_correction_events',timestamps:false});
