"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
    class PayrollPeriod extends Model {
        static associate(models) {
            PayrollPeriod.belongsTo(models.User, {
                foreignKey: "created_by",
                as: "creator",
                onDelete: "RESTRICT",
                onUpdate: "CASCADE",
            });
            PayrollPeriod.hasMany(models.EmployeePayroll, {
                foreignKey: "payroll_period_id",
                as: "payrolls",
            });
        }
    }

    PayrollPeriod.init(
        {
            name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            start_date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            end_date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            payroll_type: {
                type: DataTypes.ENUM("monthly", "weekly"),
                allowNull: false,
            },
            status: {
                type: DataTypes.ENUM("draft", "reviewed", "approved", "paid"),
                allowNull: false,
                defaultValue: "draft",
            },
            created_by: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: "users",
                    key: "id",
                },
            },
            audit_log: {
                type: DataTypes.JSON,
                allowNull: true,
                defaultValue: [],
            },
        },
        {
            sequelize,
            modelName: "PayrollPeriod",
            tableName: "payroll_periods",
            underscored: true,
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            defaultScope: {
                attributes: { exclude: ["audit_log"] }
            },

        }
    );

    return PayrollPeriod;
};
