module.exports = (sequelize, D) => sequelize.define('OffboardingCase', {
  exitType:{type:D.STRING(20),allowNull:false},reportedDate:{type:D.DATEONLY,allowNull:true},noticeStart:{type:D.DATEONLY,allowNull:true},noticeEnd:{type:D.DATEONLY,allowNull:true},lastWorkingDate:{type:D.DATEONLY,allowNull:true},
  employeeId: { type: D.INTEGER, allowNull: false, unique: true },
  status: { type: D.STRING(20), allowNull: false, defaultValue: 'open' },
  version: { type: D.INTEGER, allowNull: false, defaultValue: 1 },
  createdBy: { type: D.INTEGER, allowNull: false },
}, { tableName: 'offboarding_cases' });
