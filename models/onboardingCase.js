module.exports = (sequelize, D) => sequelize.define('OnboardingCase', {
  employeeId: { type: D.INTEGER, allowNull: false, unique: true },
  status: { type: D.STRING(20), allowNull: false, defaultValue: 'open' },
  version: { type: D.INTEGER, allowNull: false, defaultValue: 1 },
  createdBy: { type: D.INTEGER, allowNull: false },
}, { tableName: 'onboarding_cases' });
