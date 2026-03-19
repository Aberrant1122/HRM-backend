"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("userInfo", "expectedHours", {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: 8,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("userInfo", "expectedHours");
  },
};
