'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if the column already exists
    const tableDescription = await queryInterface.describeTable('userInfo');
    
    if (!tableDescription.dob) {
      await queryInterface.addColumn('userInfo', 'dob', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Date of birth of the user'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove the column if it exists
    const tableDescription = await queryInterface.describeTable('userInfo');
    
    if (tableDescription.dob) {
      await queryInterface.removeColumn('userInfo', 'dob');
    }
  }
};
