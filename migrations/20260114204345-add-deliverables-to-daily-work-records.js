'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('daily_work_records', 'deliverables', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of deliverable file URLs uploaded during checkout'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('daily_work_records', 'deliverables');
  }
};
