// Run only against an explicitly selected, reviewed environment. No scheduling here.
if (process.env.HRM_RECONCILE_ATTENDANCE_UPLOADS !== '1') throw Error('Explicit reconciliation opt-in required');
const models = require('../models');
const recovery = require('../services/attendanceRecovery')(models);
(async () => {
  try {
    const rows = await models.AttendanceUploadAttempt.findAll({ where: { state: 'pending' }, attributes: ['userId'], group: ['userId'], raw: true });
    for (const row of rows) await recovery.reconcile(row.userId);
    console.log('Attendance reconciliation finished; inspect pending journal count through reviewed metadata.');
  } finally { await models.sequelize.close(); }
})().catch(() => { console.error('Attendance reconciliation incomplete'); process.exitCode = 1; });
