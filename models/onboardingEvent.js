module.exports = (sequelize, D) => sequelize.define('OnboardingEvent', {
  caseId: { type: D.INTEGER, allowNull: false }, commandKey: { type: D.STRING(36), allowNull: false, unique: true },
  payloadHash: { type: D.STRING(64), allowNull: false }, actorId: { type: D.INTEGER, allowNull: false },
  action: { type: D.STRING(30), allowNull: false }, version: { type: D.INTEGER, allowNull: false },
  details: { type: D.JSON, allowNull: false },
}, { tableName: 'onboarding_events' });
