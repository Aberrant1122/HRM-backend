'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // 1. Add version column for optimistic locking
        await queryInterface.addColumn('employee_payrolls', 'version', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        });

        // 2. Add snapshot_hash for integrity verification
        await queryInterface.addColumn('employee_payrolls', 'snapshot_hash', {
            type: Sequelize.STRING(64),
            allowNull: true
        });

        // 3. Update status ENUM to include 'reviewed'
        // Note: In MySQL, we need to redefine the column
        await queryInterface.changeColumn('employee_payrolls', 'status', {
            type: Sequelize.ENUM('draft', 'reviewed', 'approved', 'paid'),
            allowNull: false,
            defaultValue: 'draft'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('employee_payrolls', 'version');
        await queryInterface.removeColumn('employee_payrolls', 'snapshot_hash');

        // Revert status ENUM
        await queryInterface.changeColumn('employee_payrolls', 'status', {
            type: Sequelize.ENUM('draft', 'approved', 'paid'),
            allowNull: false,
            defaultValue: 'draft'
        });
    }
};
