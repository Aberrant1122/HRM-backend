'use strict';
module.exports = {
  async up(qi, S) {
    if (!(await qi.describeTable('users')).hasEmployeeHistory) {
      await qi.addColumn('users', 'hasEmployeeHistory', { type: S.BOOLEAN, allowNull: false, defaultValue: false });
    }
    await qi.sequelize.query(`UPDATE users u SET hasEmployeeHistory = 1 WHERE u.role = 'employee'
      OR EXISTS (SELECT 1 FROM attendances a WHERE a.userId = u.id)
      OR EXISTS (SELECT 1 FROM leave_requests l WHERE l.userId = u.id)
      OR EXISTS (SELECT 1 FROM payroll_profiles p WHERE p.employee_id = u.id)
      OR EXISTS (SELECT 1 FROM employee_payrolls e WHERE e.employee_id = u.id)
      OR EXISTS (SELECT 1 FROM daily_work_records d WHERE d.userId = u.id)
      OR EXISTS (SELECT 1 FROM userBankInfo b WHERE b.userId = u.id)`);
    const [triggers] = await qi.sequelize.query("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME IN ('users_retain_employee_history_insert','users_retain_employee_history_update')");
    const names = triggers.map(row => row.TRIGGER_NAME);
    if (!names.includes('users_retain_employee_history_insert')) await qi.sequelize.query(`CREATE TRIGGER users_retain_employee_history_insert BEFORE INSERT ON users FOR EACH ROW
      SET NEW.hasEmployeeHistory = (NEW.hasEmployeeHistory OR NEW.role = 'employee')`);
    if (!names.includes('users_retain_employee_history_update')) await qi.sequelize.query(`CREATE TRIGGER users_retain_employee_history_update BEFORE UPDATE ON users FOR EACH ROW
      SET NEW.hasEmployeeHistory = (OLD.hasEmployeeHistory OR NEW.hasEmployeeHistory OR OLD.role = 'employee' OR NEW.role = 'employee')`);
  },
  async down() {
    // Provenance is monotonic retention evidence. A rollback must not erase it.
  },
};
