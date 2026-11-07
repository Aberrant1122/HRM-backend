module.exports = (db, D) => db.define('AttendanceCommand', {
  commandKey: { type: D.STRING(36), primaryKey: true }, userId: D.INTEGER,
  digest: D.STRING(64), response: D.JSON, createdAt: D.DATE,
}, { tableName: 'attendance_commands', timestamps: false });
