'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('tasks', 'status', {
      type: Sequelize.ENUM('pending', 'in-progress', 'in-review', 'completed', 'blocked', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('tasks', 'status', {
      type: Sequelize.ENUM('pending', 'in-progress', 'completed', 'blocked', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending'
    });
  }
};