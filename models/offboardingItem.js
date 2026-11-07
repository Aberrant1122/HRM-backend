module.exports = (sequelize, D) => sequelize.define('OffboardingItem', {
  caseId: { type: D.INTEGER, allowNull: false }, title: { type: D.STRING(200), allowNull: false },
  departmentId:{type:D.INTEGER,allowNull:true},kind:{type:D.STRING(20),allowNull:false},
  responsibleId: { type: D.INTEGER, allowNull: true }, dueDate: { type: D.DATEONLY, allowNull: true },
  status: { type: D.STRING(20), allowNull: false, defaultValue: 'pending' },
}, { tableName: 'offboarding_items' });
