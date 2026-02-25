"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
    class PayrollAdjustment extends Model {
        static associate(models) {
            PayrollAdjustment.belongsTo(models.EmployeePayroll, {
                foreignKey: "employee_payroll_id",
                as: "payroll",
                onDelete: "CASCADE",
                onUpdate: "CASCADE",
            });
            PayrollAdjustment.belongsTo(models.User, {
                foreignKey: "created_by",
                as: "creator",
                onDelete: "SET NULL",
                onUpdate: "CASCADE",
            });
        }
    }

    PayrollAdjustment.init(
        {
            employee_payroll_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: "employee_payrolls",
                    key: "id",
                },
            },
            type: {
                type: DataTypes.ENUM("bonus", "penalty", "correction"),
                allowNull: false,
            },
            amount: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: false,
                validate: {
                    isDecimal: { msg: "Adjustment amount must be a numeric value." },
                    min: { args: [0.01], msg: "Adjustment amount must be greater than zero." },
                    max: { args: [1000000], msg: "Adjustment amount exceeds the maximum allowed limit ($1,000,000)." }
                }
            },
            reason: {
                type: DataTypes.TEXT,
                allowNull: false,
                validate: {
                    notEmpty: { msg: "A reason is required for any payroll adjustment." },
                    len: { args: [5, 500], msg: "Reason must be between 5 and 500 characters." }
                }
            },
            created_by: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: "users",
                    key: "id",
                },
            },
        },
        {
            sequelize,
            modelName: "PayrollAdjustment",
            tableName: "payroll_adjustments",
            underscored: true,
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            indexes: [
                {
                    fields: ["employee_payroll_id", "type"],
                    name: "idx_adj_payroll_type"
                }
            ]
        }

    );

    return PayrollAdjustment;
};
