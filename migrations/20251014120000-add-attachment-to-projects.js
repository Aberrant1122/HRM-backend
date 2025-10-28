"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("projects");
    
    // Check if attachment column already exists
    if (!tableDescription.attachment) {
      // If endDate exists, add after it, otherwise just add the column
      if (tableDescription.endDate) {
        await queryInterface.addColumn("projects", "attachment", {
          type: Sequelize.STRING,
          allowNull: true,
          after: "endDate",
        });
      } else {
        await queryInterface.addColumn("projects", "attachment", {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("projects");
    
    if (tableDescription.attachment) {
      await queryInterface.removeColumn("projects", "attachment");
    }
  },
};


