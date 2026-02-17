'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Users table
    await queryInterface.addIndex('users', ['role']);
    await queryInterface.addIndex('users', ['status']);
    await queryInterface.addIndex('users', ['createdAt']);

    // UserInfo table (Correct table name is userInfo, not user_infos)
    await queryInterface.addIndex('userInfo', ['userId']);
    await queryInterface.addIndex('userInfo', ['createdAt']);

    // Tasks table
    await queryInterface.addIndex('tasks', ['createdAt']);
    await queryInterface.addIndex('tasks', ['isActive']);

    // Projects table
    await queryInterface.addIndex('projects', ['createdAt']);
    await queryInterface.addIndex('projects', ['isActive']);

    // Attendances table
    await queryInterface.addIndex('attendances', ['userId']);
    await queryInterface.addIndex('attendances', ['date']);
    await queryInterface.addIndex('attendances', ['status']);
    await queryInterface.addIndex('attendances', ['createdAt']);

    // Leave Requests table
    await queryInterface.addIndex('leave_requests', ['userId']);
    await queryInterface.addIndex('leave_requests', ['leaveTypeId']);
    await queryInterface.addIndex('leave_requests', ['status']);
    await queryInterface.addIndex('leave_requests', ['createdAt']);

    // Notifications table (Correct table name is Notifications)
    await queryInterface.addIndex('Notifications', ['userId']);
    await queryInterface.addIndex('Notifications', ['taskId']);
    await queryInterface.addIndex('Notifications', ['projectId']);
    await queryInterface.addIndex('Notifications', ['isRead']);
    await queryInterface.addIndex('Notifications', ['createdAt']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('users', ['role']);
    await queryInterface.removeIndex('users', ['status']);
    await queryInterface.removeIndex('users', ['createdAt']);
    await queryInterface.removeIndex('user_infos', ['userId']);
    await queryInterface.removeIndex('user_infos', ['createdAt']);
    await queryInterface.removeIndex('tasks', ['createdAt']);
    await queryInterface.removeIndex('tasks', ['isActive']);
    await queryInterface.removeIndex('projects', ['createdAt']);
    await queryInterface.removeIndex('projects', ['isActive']);
    await queryInterface.removeIndex('attendances', ['userId']);
    await queryInterface.removeIndex('attendances', ['date']);
    await queryInterface.removeIndex('attendances', ['status']);
    await queryInterface.removeIndex('attendances', ['createdAt']);
    await queryInterface.removeIndex('leave_requests', ['userId']);
    await queryInterface.removeIndex('leave_requests', ['leaveTypeId']);
    await queryInterface.removeIndex('leave_requests', ['status']);
    await queryInterface.removeIndex('leave_requests', ['createdAt']);
    await queryInterface.removeIndex('notifications', ['userId']);
    await queryInterface.removeIndex('notifications', ['taskId']);
    await queryInterface.removeIndex('notifications', ['projectId']);
    await queryInterface.removeIndex('notifications', ['isRead']);
    await queryInterface.removeIndex('notifications', ['createdAt']);
  }
};
