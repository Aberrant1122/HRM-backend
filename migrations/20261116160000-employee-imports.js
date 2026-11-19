"use strict";
module.exports = {
  async up(q, D) {
    await q.createTable("employee_imports", {
      id: {type: D.UUID, primaryKey: true},
      actorId: {type: D.INTEGER, allowNull: false, references: {model: "users", key: "id"}, onDelete: "RESTRICT"},
      digest: {type: D.STRING(64), allowNull: false},
      rows: {type: D.JSON, allowNull: false},
      createdAt: {type: D.DATE, allowNull: false},
      updatedAt: {type: D.DATE, allowNull: false},
    });
  },
  async down(q) {
    const [[row]] = await q.sequelize.query("SELECT COUNT(*) AS total FROM employee_imports");
    if (Number(row.total)) throw new Error("Employee import history exists. Roll forward.");
    await q.dropTable("employee_imports");
  }
};
