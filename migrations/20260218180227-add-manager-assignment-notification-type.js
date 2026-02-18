'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add 'manager_assignment' to the notification type enum
    await queryInterface.sequelize.query(`
      ALTER TABLE notifications 
      MODIFY COLUMN type ENUM(
        'status_change', 
        'task_completed', 
        'overdue', 
        'file_upload', 
        'task_assigned', 
        'manager_assignment',
        'general'
      ) NOT NULL DEFAULT 'general';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Revert back to original enum values
    await queryInterface.sequelize.query(`
      ALTER TABLE notifications 
      MODIFY COLUMN type ENUM(
        'status_change', 
        'task_completed', 
        'overdue', 
        'file_upload', 
        'task_assigned', 
        'general'
      ) NOT NULL DEFAULT 'general';
    `);
  }
};
