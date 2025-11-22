'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('users', 'role', {
      type: Sequelize.ENUM('admin', 'employee', 'client', 'manager'),
      allowNull: false,
      defaultValue: 'employee'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('users', 'role', {
      type: Sequelize.ENUM('admin', 'employee', 'client'),
      allowNull: false,
      defaultValue: 'employee'
    });
  }
};