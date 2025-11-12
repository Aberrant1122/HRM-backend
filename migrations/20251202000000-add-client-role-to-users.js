'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // For MySQL, change the column to include 'client' in the enum
    await queryInterface.changeColumn('users', 'role', {
      type: Sequelize.ENUM('admin', 'employee', 'client'),
      allowNull: false,
      defaultValue: 'employee'
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove 'client' from the enum
    await queryInterface.changeColumn('users', 'role', {
      type: Sequelize.ENUM('admin', 'employee'),
      allowNull: false,
      defaultValue: 'employee'
    });
  }
};
