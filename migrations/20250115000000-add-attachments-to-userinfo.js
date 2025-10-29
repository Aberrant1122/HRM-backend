"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Safely handle case where table may not exist yet on fresh deploys
    let tableDescription;
    try {
      tableDescription = await queryInterface.describeTable("userInfo");
    } catch (err) {
      // Table doesn't exist yet; skip this migration step gracefully
      return;
    }

    if (!tableDescription.attachments) {
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
    let tableDescription;
    try {
      tableDescription = await queryInterface.describeTable("userInfo");
    } catch (err) {
      return;
    }
    if (tableDescription.attachments) {
      await queryInterface.removeColumn("userInfo", "attachments");
    }
  },
};
