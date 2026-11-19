"use strict";
module.exports = (sequelize, D) => sequelize.define("EmployeeImport", {
  id: { type: D.UUID, primaryKey: true },
  actorId: { type: D.INTEGER, allowNull: false },
  digest: { type: D.STRING(64), allowNull: false },
  rows: { type: D.JSON, allowNull: false },
}, {tableName: "employee_imports"});
