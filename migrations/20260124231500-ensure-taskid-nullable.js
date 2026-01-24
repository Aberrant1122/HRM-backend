'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        console.log('Running migration: ensure-taskid-nullable');

        // Modify the taskId column to allow NULL
        // We use changeColumn to enforce the new definition
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

        console.log('Migration completed: taskId is now nullable');
    },

    async down(queryInterface, Sequelize) {
        // Revert to NOT NULL (if needed)
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
    },
};
