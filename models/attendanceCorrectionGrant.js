module.exports=(db,D)=>db.define('AttendanceCorrectionGrant',{
  userId:{type:D.INTEGER,primaryKey:true},active:D.BOOLEAN,version:D.INTEGER,grantedBy:D.INTEGER,updatedAt:D.DATE,
},{tableName:'attendance_correction_grants',timestamps:false});
