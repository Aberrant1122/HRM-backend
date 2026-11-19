'use strict';
const table = 'payroll_advance_entries';
module.exports = {
  async up(q, S) {
    const ref = (model, allowNull = false) => ({ type: S.INTEGER, allowNull, references: { model, key: 'id' }, onDelete: 'RESTRICT' });
    await q.createTable(table, {
      id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
      accountId: ref(table, true), employeeId: ref('users'), actorId: ref('users'),
      kind: { type: S.STRING(16), allowNull: false }, currency: { type: S.STRING(3), allowNull: false },
      amount: { type: S.DECIMAL(16,4), allowNull: false }, effectiveDate: { type: S.DATEONLY, allowNull: false },
      reference: { type: S.STRING(240), allowNull: false }, commandKey: { type: S.STRING(36), allowNull: false, unique: true },
      payloadHash: { type: S.STRING(64), allowNull: false }, createdAt: { type: S.DATE, allowNull: false },
    });
    await q.addIndex(table, ['employeeId', 'accountId', 'id']);
  },
  async down(q) {
    const [[{ total }]] = await q.sequelize.query('SELECT COUNT(*) AS total FROM payroll_advance_entries');
    if (Number(total)) throw new Error('Retained advance or loan entries require a forward migration');
    await q.dropTable(table);
  },
};
