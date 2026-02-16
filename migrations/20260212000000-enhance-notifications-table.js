'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add new columns to notifications table
    await queryInterface.addColumn('Notifications', 'projectId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'projects',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    await queryInterface.addColumn('Notifications', 'type', {
      type: Sequelize.ENUM('status_change', 'task_completed', 'overdue', 'file_upload', 'task_assigned', 'general'),
      allowNull: false,
      defaultValue: 'general'
    });

    await queryInterface.addColumn('Notifications', 'metadata', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Additional data like old/new status, file names, etc.'
    });

    // Add index for better query performance
    await queryInterface.addIndex('Notifications', ['userId', 'isRead']);
    await queryInterface.addIndex('Notifications', ['projectId']);
    await queryInterface.addIndex('Notifications', ['type']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('Notifications', ['userId', 'isRead']);
    await queryInterface.removeIndex('Notifications', ['projectId']);
    await queryInterface.removeIndex('Notifications', ['type']);
    
    await queryInterface.removeColumn('Notifications', 'metadata');
    await queryInterface.removeColumn('Notifications', 'type');
    await queryInterface.removeColumn('Notifications', 'projectId');
  }
};
