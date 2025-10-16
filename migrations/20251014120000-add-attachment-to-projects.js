"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("projects", "attachment", {
      type: Sequelize.STRING,
      allowNull: true,
      after: "endDate",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("projects", "attachment");
  },
};


