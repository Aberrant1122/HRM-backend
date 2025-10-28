"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if attachments column already exists
    const tableDescription = await queryInterface.describeTable("userInfo");
    if (!tableDescription.attachments) {
      // If team column exists, add after it, otherwise just add the column
      if (tableDescription.team) {
        await queryInterface.addColumn("userInfo", "attachments", {
          type: Sequelize.JSON,
          allowNull: true,
          defaultValue: [],
          after: "team",
        });
      } else {
        await queryInterface.addColumn("userInfo", "attachments", {
          type: Sequelize.JSON,
          allowNull: true,
          defaultValue: [],
        });
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("userInfo");
    if (tableDescription.attachments) {
      await queryInterface.removeColumn("userInfo", "attachments");
    }
  },
};
