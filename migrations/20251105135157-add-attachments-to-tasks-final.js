'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('tasks');

    if (!tableDescription.attachments) {
      await queryInterface.addColumn('tasks', 'attachments', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of file attachments for task deliverables'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('tasks');

    if (tableDescription.attachments) {
      await queryInterface.removeColumn('tasks', 'attachments');
    }
  }
};
