'use strict';
module.exports = {
  async up(qi, S) {
    const id = { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false };
    const user = { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' };
    const timestamps = () => ({ createdAt: { type: S.DATE, allowNull: false }, updatedAt: { type: S.DATE, allowNull: false } });
    await qi.createTable('onboarding_cases', { id, employeeId: { ...user, unique: true }, status: { type: S.STRING(20), allowNull: false, defaultValue: 'open' }, version: { type: S.INTEGER, allowNull: false, defaultValue: 1 }, createdBy: user, ...timestamps() });
    const caseId = { type: S.INTEGER, allowNull: false, references: { model: 'onboarding_cases', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' };
    await qi.createTable('onboarding_items', { id, caseId, title: { type: S.STRING(200), allowNull: false }, responsibleId: { ...user, allowNull: true }, dueDate: { type: S.DATEONLY, allowNull: true }, status: { type: S.STRING(20), allowNull: false, defaultValue: 'pending' }, ...timestamps() });
    await qi.addIndex('onboarding_items', ['caseId', 'id']);
    await qi.createTable('onboarding_events', { id, caseId, commandKey: { type: S.STRING(36), allowNull: false, unique: true }, payloadHash: { type: S.STRING(64), allowNull: false }, actorId: user, action: { type: S.STRING(30), allowNull: false }, version: { type: S.INTEGER, allowNull: false }, details: { type: S.JSON, allowNull: false }, ...timestamps() });
    await qi.addIndex('onboarding_events', ['caseId', 'version'], { unique: true });
  },
  async down(qi) {
    const [[row]] = await qi.sequelize.query('SELECT COUNT(*) AS total FROM onboarding_cases');
    if (Number(row.total)) throw new Error('Refusing to remove populated onboarding history; retain tables and roll forward');
    for (const name of ['onboarding_events', 'onboarding_items', 'onboarding_cases']) await qi.dropTable(name);
  },
};
