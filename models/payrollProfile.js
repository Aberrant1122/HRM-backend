"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
    class PayrollProfile extends Model {
        static associate(models) {
            PayrollProfile.belongsTo(models.User, {
                foreignKey: "employee_id",
                as: "employee",
                onDelete: "CASCADE",
                onUpdate: "CASCADE",
            });
        }
    }

    PayrollProfile.init(
        {
            employee_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                unique: true,
                references: {
                    model: "users",
                    key: "id",
                },
            },
            salary_type: {
                type: DataTypes.ENUM("monthly", "hourly", "daily"),
                allowNull: false,
            },
            base_salary: {
                type: DataTypes.DECIMAL(12, 2),
                allowNull: false,
            },
            standard_working_days: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 22,
            },
            standard_working_hours: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 8,
            },
            overtime_eligible: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },
            overtime_rate: {
                type: DataTypes.DECIMAL(10, 2),
                defaultValue: 0.0,
            },
            late_penalty_rule: {
                type: DataTypes.JSON,
                allowNull: true,
            },
            leave_deduction_rule: {
                type: DataTypes.JSON,
                allowNull: true,
            },
            tax_percentage: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: true,
            },
        },
        {
            sequelize,
            modelName: "PayrollProfile",
            tableName: "payroll_profiles",
            underscored: true,
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
        }
    );

    return PayrollProfile;
};
