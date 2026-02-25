'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // 1. payroll_profiles
        await queryInterface.createTable('payroll_profiles', {
            id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                autoIncrement: true,
                primaryKey: true
            },
            employee_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                unique: true,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            salary_type: {
                type: Sequelize.ENUM('monthly', 'hourly', 'daily'),
                allowNull: false
            },
            base_salary: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false
            },
            standard_working_days: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 22
            },
            standard_working_hours: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 8
            },
            overtime_eligible: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            overtime_rate: {
                type: Sequelize.DECIMAL(10, 2),
                defaultValue: 0.00
            },
            late_penalty_rule: {
                type: Sequelize.JSON,
                allowNull: true
            },
            leave_deduction_rule: {
                type: Sequelize.JSON,
                allowNull: true
            },
            tax_percentage: {
                type: Sequelize.DECIMAL(5, 2),
                allowNull: true
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });

        // 2. payroll_periods
        await queryInterface.createTable('payroll_periods', {
            id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                autoIncrement: true,
                primaryKey: true
            },
            name: {
                type: Sequelize.STRING,
                allowNull: false
            },
            start_date: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            end_date: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            payroll_type: {
                type: Sequelize.ENUM('monthly', 'weekly'),
                allowNull: false
            },
            status: {
                type: Sequelize.ENUM('draft', 'reviewed', 'approved', 'paid'),
                allowNull: false,
                defaultValue: 'draft'
            },
            created_by: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT'
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });

        // 3. employee_payrolls
        await queryInterface.createTable('employee_payrolls', {
            id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                autoIncrement: true,
                primaryKey: true
            },
            payroll_period_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'payroll_periods',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            employee_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            gross_salary: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false
            },
            total_deductions: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false
            },
            net_salary: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false
            },
            snapshot: {
                type: Sequelize.JSON,
                allowNull: false
            },
            status: {
                type: Sequelize.ENUM('draft', 'approved', 'paid'),
                allowNull: false,
                defaultValue: 'draft'
            },
            locked: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });

        // 4. payroll_adjustments
        await queryInterface.createTable('payroll_adjustments', {
            id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                autoIncrement: true,
                primaryKey: true
            },
            employee_payroll_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'employee_payrolls',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            type: {
                type: Sequelize.ENUM('bonus', 'penalty', 'correction'),
                allowNull: false
            },
            amount: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false
            },
            reason: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            created_by: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });

        // Add explicit composite index for payroll lookups
        await queryInterface.addIndex('employee_payrolls', ['payroll_period_id', 'employee_id']);
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('payroll_adjustments');
        await queryInterface.dropTable('employee_payrolls');
        await queryInterface.dropTable('payroll_periods');
        await queryInterface.dropTable('payroll_profiles');
    }
};
