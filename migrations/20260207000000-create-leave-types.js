'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('leave_types', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            name: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true,
            },
            is_paid: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            annual_quota: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            requires_approval: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            max_consecutive_days: {
                type: Sequelize.INTEGER,
                allowNull: true,
            },
            half_day_allowed: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            status: {
                type: Sequelize.ENUM('active', 'inactive'),
                allowNull: false,
                defaultValue: 'active',
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            },
        });

        // Seed default leave types
        await queryInterface.bulkInsert('leave_types', [
            { name: 'Casual Leave', is_paid: true, annual_quota: 10, requires_approval: true, max_consecutive_days: 3, half_day_allowed: true, status: 'active' },
            { name: 'Sick Leave', is_paid: true, annual_quota: 8, requires_approval: true, max_consecutive_days: 2, half_day_allowed: true, status: 'active' },
            { name: 'Annual Leave', is_paid: true, annual_quota: 15, requires_approval: true, max_consecutive_days: null, half_day_allowed: false, status: 'active' },
            { name: 'Unpaid Leave', is_paid: false, annual_quota: 365, requires_approval: true, max_consecutive_days: null, half_day_allowed: true, status: 'active' },
        ]);
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('leave_types');
    },
};
