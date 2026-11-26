"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
    class LeaveRequest extends Model {
        static associate(models) {
            LeaveRequest.belongsTo(models.User, {
                foreignKey: "userId",
                as: "user",
            });
            LeaveRequest.belongsTo(models.LeaveType, {
                foreignKey: "leaveTypeId",
                as: "leaveType",
            });
            LeaveRequest.belongsTo(models.User, {
                foreignKey: "approvedBy",
                as: "approver",
            });
        }
    }

    LeaveRequest.init(
        {
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
            leaveTypeId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            startDate: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            endDate: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            totalDays: {
                type: DataTypes.FLOAT,
                allowNull: false,
            },
            leaveMode: {
                type: DataTypes.ENUM("full-day", "half-day"),
                defaultValue: "full-day",
            },
            reason: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
            status: {
                type: DataTypes.ENUM("pending", "approved", "rejected"),
                defaultValue: "pending",
            },
            approvedBy: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            rejectionReason: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
        },
        {
            sequelize,
            modelName: "LeaveRequest",
            tableName: "leave_requests",
            timestamps: true,
            indexes: [
                {
                    fields: ["userId", "status", "startDate", "endDate"],
                    name: "idx_leave_user_status_date"
                }
            ]
        }

    );

    return LeaveRequest;
};
