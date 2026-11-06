"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("users");
    const role = columns.role;
    if (!role || !/^ENUM\(/i.test(role.type)) {
      throw new Error("Expected users.role to be an ENUM; inspect schema before changing it");
    }
    // Preserve any existing labels rather than narrowing a drifted deployed schema.
    const values = [...role.type.matchAll(/'((?:[^']|'')*)'/g)].map(match => match[1].replace(/''/g, "'"));
    if (values.includes("manager")) return;
    await queryInterface.changeColumn("users", "role", {
      type: Sequelize.ENUM(...values, "manager"),
      allowNull: role.allowNull,
      defaultValue: role.defaultValue,
    });
  },
  async down() {
    // Widening is compatible with the baseline application. Retain labels and data:
    // removing manager could truncate records, and does not restore session safety.
  },
};
