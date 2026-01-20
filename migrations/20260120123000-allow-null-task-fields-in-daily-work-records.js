'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
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

    await queryInterface.changeColumn('daily_work_records', 'taskStatus', {
      type: Sequelize.ENUM('planning', 'in-progress', 'testing', 'blocked', 'completed'),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
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

    await queryInterface.changeColumn('daily_work_records', 'taskStatus', {
      type: Sequelize.ENUM('planning', 'in-progress', 'testing', 'blocked', 'completed'),
      allowNull: false,
    });
  },
};
