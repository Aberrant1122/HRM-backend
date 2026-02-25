'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('payroll_periods', 'audit_log', {
            type: Sequelize.JSON,
            allowNull: true,
            defaultValue: []
        });

        await queryInterface.addColumn('employee_payrolls', 'audit_log', {
            type: Sequelize.JSON,
            allowNull: true,
            defaultValue: []
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('payroll_periods', 'audit_log');
        await queryInterface.removeColumn('employee_payrolls', 'audit_log');
    }
};
