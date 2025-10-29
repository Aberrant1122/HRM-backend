"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Ensure the userInfo table exists and add attachments if missing
    let tableDescription;
    try {
      tableDescription = await queryInterface.describeTable("userInfo");
    } catch (err) {
      // Table does not exist; nothing to do
      return;
    }

    if (!tableDescription.attachments) {
      const columnDef = {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: [],
      };
      if (tableDescription.team) {
        columnDef.after = "team";
      }
      await queryInterface.addColumn("userInfo", "attachments", columnDef);
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


