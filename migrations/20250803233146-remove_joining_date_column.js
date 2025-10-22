'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('userInfo');

    // Check if joiningDate column exists
    if (tableDescription.joiningDate) {
      // First, copy data from joiningDate to startDate for existing records
      await queryInterface.sequelize.query(
        'UPDATE userInfo SET startDate = joiningDate WHERE startDate IS NULL;'
      );

      // Then remove the joiningDate column
      await queryInterface.removeColumn('userInfo', 'joiningDate');
    }
  },

  async down(queryInterface, Sequelize) {
    // Add back the joiningDate column
    await queryInterface.addColumn('userInfo', 'joiningDate', {
      type: Sequelize.DATE,
      allowNull: true
    });

    // Copy data back from startDate to joiningDate
    await queryInterface.sequelize.query(
      'UPDATE userInfo SET joiningDate = startDate;'
    );
  }
};
