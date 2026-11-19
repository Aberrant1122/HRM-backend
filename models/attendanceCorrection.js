module.exports = (db,D) => db.define('AttendanceCorrection',{
  id:{type:D.INTEGER,primaryKey:true,autoIncrement:true},employeeId:D.INTEGER,attendanceId:D.INTEGER,workDate:D.DATEONLY,
  state:D.STRING(16),version:D.INTEGER,baseline:D.JSON,proposed:D.JSON,appliedRecord:D.JSON,createdBy:D.INTEGER,createdAt:D.DATE,updatedAt:D.DATE,
},{tableName:'attendance_corrections',timestamps:false});
