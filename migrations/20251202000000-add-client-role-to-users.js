'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // For MySQL, change the column to include 'client' in the enum
    await queryInterface.changeColumn('users', 'role', {
      type: Sequelize.ENUM('admin', 'employee', 'client', 'manager'),
      allowNull: false,
      defaultValue: 'employee'
    });
  },

  async down(queryInterface, Sequelize) {
    // Both client and manager were supported by the preceding migration.
    // Keep the widened enum during rollback so populated rows are never coerced.
  }
};
