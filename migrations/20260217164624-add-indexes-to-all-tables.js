'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const safeAddIndex = async (tableName, columns, options = {}) => {
      try {
        const indexes = await queryInterface.showIndex(tableName);
        const indexName = options.name || `${tableName}_${columns.join('_')}`;
        const exists = indexes.some(idx => idx.name === indexName);

        if (!exists) {
          await queryInterface.addIndex(tableName, columns, options);
          console.log(`Index ${indexName} added to ${tableName}`);
        } else {
          console.log(`Index ${indexName} already exists on ${tableName}, skipping.`);
        }
      } catch (error) {
        // If the table doesn't exist yet, we might get an error, but usually migrations run in order
        console.warn(`Could not check/add index for ${tableName}:`, error.message);
      }
    };

    // Users table
    await safeAddIndex('users', ['role']);
    await safeAddIndex('users', ['status']);
    await safeAddIndex('users', ['createdAt']);

    // UserInfo table
    await safeAddIndex('userInfo', ['userId']);
    await safeAddIndex('userInfo', ['createdAt']);

    // Tasks table
    await safeAddIndex('tasks', ['createdAt']);
    await safeAddIndex('tasks', ['isActive']);

    // Projects table
    await safeAddIndex('projects', ['createdAt']);
    await safeAddIndex('projects', ['isActive']);

    // Attendances table
    await safeAddIndex('attendances', ['userId']);
    await safeAddIndex('attendances', ['date']);
    await safeAddIndex('attendances', ['status']);
    await safeAddIndex('attendances', ['createdAt']);

    // Leave Requests table
    await safeAddIndex('leave_requests', ['userId']);
    await safeAddIndex('leave_requests', ['leaveTypeId']);
    await safeAddIndex('leave_requests', ['status']);
    await safeAddIndex('leave_requests', ['createdAt']);

    // Notifications table
    await safeAddIndex('Notifications', ['userId']);
    await safeAddIndex('Notifications', ['taskId']);
    await safeAddIndex('Notifications', ['projectId']);
    await safeAddIndex('Notifications', ['isRead']);
    await safeAddIndex('Notifications', ['createdAt']);
  },

  async down(queryInterface, Sequelize) {
    const safeRemoveIndex = async (tableName, columns, options = {}) => {
      try {
        const indexes = await queryInterface.showIndex(tableName);
        const indexName = options.name || `${tableName}_${columns.join('_')}`;
        const exists = indexes.some(idx => idx.name === indexName);

        if (exists) {
          await queryInterface.removeIndex(tableName, indexName);
          console.log(`Index ${indexName} removed from ${tableName}`);
        }
      } catch (error) {
        console.warn(`Could not check/remove index for ${tableName}:`, error.message);
      }
    };

    await safeRemoveIndex('users', ['role']);
    await safeRemoveIndex('users', ['status']);
    await safeRemoveIndex('users', ['createdAt']);
    await safeRemoveIndex('userInfo', ['userId']);
    await safeRemoveIndex('userInfo', ['createdAt']);
    await safeRemoveIndex('tasks', ['createdAt']);
    await safeRemoveIndex('tasks', ['isActive']);
    await safeRemoveIndex('projects', ['createdAt']);
    await safeRemoveIndex('projects', ['isActive']);
    await safeRemoveIndex('attendances', ['userId']);
    await safeRemoveIndex('attendances', ['date']);
    await safeRemoveIndex('attendances', ['status']);
    await safeRemoveIndex('attendances', ['createdAt']);
    await safeRemoveIndex('leave_requests', ['userId']);
    await safeRemoveIndex('leave_requests', ['leaveTypeId']);
    await safeRemoveIndex('leave_requests', ['status']);
    await safeRemoveIndex('leave_requests', ['createdAt']);
    await safeRemoveIndex('Notifications', ['userId']);
    await safeRemoveIndex('Notifications', ['taskId']);
    await safeRemoveIndex('Notifications', ['projectId']);
    await safeRemoveIndex('Notifications', ['isRead']);
    await safeRemoveIndex('Notifications', ['createdAt']);
  }
};
