module.exports = (db, D) => db.define('AttendanceUploadAttempt', {
  id: { type: D.STRING(36), primaryKey: true }, userId: D.INTEGER,
  commandKey: D.STRING(36), objectKey: D.STRING(255), bucket: D.STRING(255),
  state: D.STRING(16), createdAt: D.DATE,
}, { tableName: 'attendance_upload_attempts', timestamps: false });
