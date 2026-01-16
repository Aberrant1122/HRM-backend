'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('daily_work_records', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      attendanceId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'attendances',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      taskId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'tasks',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      taskStatus: {
        type: Sequelize.ENUM('planning', 'in-progress', 'testing', 'blocked', 'completed'),
        allowNull: false
      },
      workNote: {
        type: Sequelize.STRING(120),
        allowNull: true
      },
      deliverableLink: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    // Add indexes
    await queryInterface.addIndex('daily_work_records', ['userId']);
    await queryInterface.addIndex('daily_work_records', ['date']);
    await queryInterface.addIndex('daily_work_records', ['taskId']);
    await queryInterface.addIndex('daily_work_records', ['taskStatus']);
    
    // Add unique constraint for one record per attendance
    await queryInterface.addIndex('daily_work_records', ['userId', 'attendanceId'], {
      unique: true,
      name: 'unique_user_attendance'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('daily_work_records');
  }
};
