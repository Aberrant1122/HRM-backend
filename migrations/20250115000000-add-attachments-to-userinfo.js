"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("userInfo", "attachments", {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: [],
      after: "team",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("userInfo", "attachments");
  },
};
