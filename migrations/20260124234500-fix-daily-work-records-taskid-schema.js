'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        console.log('Running migration: fix-daily-work-records-taskid-schema');

        // Force taskId to be nullable
        // We use modify/changeColumn with explicit allowNull: true
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

        console.log('Migration completed: taskId forced to be nullable');
    },

    async down(queryInterface, Sequelize) {
        // Revert to strict schema if needed
        // Note: This might fail if there are existing NULL values
        try {
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
        } catch (error) {
            console.warn('Could not revert taskId to NOT NULL (likely contains NULL values):', error.message);
        }
    }
};
