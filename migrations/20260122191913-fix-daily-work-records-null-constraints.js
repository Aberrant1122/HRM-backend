'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First, remove the foreign key constraint if it exists
    try {
      await queryInterface.removeConstraint('daily_work_records', 'daily_work_records_ibfk_3');
    } catch (error) {
      console.log('Foreign key constraint might not exist, continuing...');
    }

    // Modify the taskId column to allow NULL
    await queryInterface.changeColumn('daily_work_records', 'taskId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'tasks',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    // Modify the taskStatus column to allow NULL
    await queryInterface.changeColumn('daily_work_records', 'taskStatus', {
      type: Sequelize.ENUM('planning', 'in-progress', 'testing', 'blocked', 'completed'),
      allowNull: true,
    });

    // Modify workNote to allow NULL (should already be nullable but ensuring it)
    await queryInterface.changeColumn('daily_work_records', 'workNote', {
      type: Sequelize.STRING(120),
      allowNull: true,
    });

    // Modify deliverableLink to allow NULL (should already be nullable but ensuring it)
    await queryInterface.changeColumn('daily_work_records', 'deliverableLink', {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert taskId to NOT NULL
    await queryInterface.changeColumn('daily_work_records', 'taskId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'tasks',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    // Revert taskStatus to NOT NULL
    await queryInterface.changeColumn('daily_work_records', 'taskStatus', {
      type: Sequelize.ENUM('planning', 'in-progress', 'testing', 'blocked', 'completed'),
      allowNull: false,
    });
  },
};
