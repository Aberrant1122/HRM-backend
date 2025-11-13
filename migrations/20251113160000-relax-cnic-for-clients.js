"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("userInfo");

    if (tableDescription.cnic) {
      await queryInterface.changeColumn("userInfo", "cnic", {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      });

      // Normalize existing empty strings to NULL to avoid unique index collisions
      await queryInterface.sequelize.query(
        "UPDATE userInfo SET cnic = NULL WHERE cnic = ''"
      );
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("userInfo");
    if (tableDescription.cnic) {
      await queryInterface.changeColumn("userInfo", "cnic", {
        type: Sequelize.STRING,
        allowNull: false,
      });
    }
  },
};