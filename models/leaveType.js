"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
    class LeaveType extends Model {
        static associate(models) {
            LeaveType.hasMany(models.LeaveRequest, {
                foreignKey: "leaveTypeId",
                as: "requests",
            });
        }
    }

    LeaveType.init(
        {
            name: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: {
                    msg: "Leave type name must be unique",
                },
                validate: {
                    notEmpty: { msg: "Leave type name is required" },
                },
            },
            is_paid: {
                type: DataTypes.BOOLEAN,
                defaultValue: true,
            },
            annual_quota: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            requires_approval: {
                type: DataTypes.BOOLEAN,
                defaultValue: true,
            },
            max_consecutive_days: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            half_day_allowed: {
                type: DataTypes.BOOLEAN,
                defaultValue: true,
            },
            status: {
                type: DataTypes.ENUM("active", "inactive"),
                defaultValue: "active",
            },
        },
        {
            sequelize,
            modelName: "LeaveType",
            tableName: "leave_types",
            timestamps: true,
        }
    );

    return LeaveType;
};
