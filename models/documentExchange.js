module.exports = (sequelize, D) => sequelize.define("DocumentExchange", {
  id: {type: D.UUID, primaryKey: true},
  employeeId: {type: D.INTEGER, allowNull: false},
  createdBy: {type: D.INTEGER, allowNull: false},
  title: {type: D.STRING(180), allowNull: false},
  direction: {type: D.STRING(8), allowNull: false},
  dueDate: D.DATEONLY,
  resolvedBy: D.INTEGER,
  resolvedAt: D.DATE,
  resolution: D.STRING(16),
  note: D.STRING(240),
  resolutionKey: {type: D.UUID, unique: true}
}, {tableName: "document_exchanges"});
