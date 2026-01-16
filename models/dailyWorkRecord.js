"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class DailyWorkRecord extends Model {
    static associate(models) {
      DailyWorkRecord.belongsTo(models.User, {
        foreignKey: "userId",
        as: "user",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      DailyWorkRecord.belongsTo(models.Attendance, {
        foreignKey: "attendanceId",
        as: "attendance",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      DailyWorkRecord.belongsTo(models.Task, {
        foreignKey: "taskId",
        as: "task",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
    }
  }

  DailyWorkRecord.init(
    {
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
      },
      attendanceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "attendances",
          key: "id",
        },
      },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "tasks",
          key: "id",
        },
      },
      taskStatus: {
        type: DataTypes.ENUM("planning", "in-progress", "testing", "blocked", "completed"),
        allowNull: false,
      },
      workNote: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      deliverableLink: {
        type: DataTypes.STRING(500),
        allowNull: true,
        validate: {
          isUrl: {
            msg: "Deliverable link must be a valid URL",
          },
        },
      },
      deliverables: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: "Array of deliverable file URLs uploaded during checkout",
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "DailyWorkRecord",
      tableName: "daily_work_records",
      timestamps: true,
      indexes: [
        {
          fields: ["userId"],
        },
        {
          fields: ["date"],
        },
        {
          fields: ["taskId"],
        },
        {
          fields: ["taskStatus"],
        },
        {
          unique: true,
          fields: ["userId", "attendanceId"],
          name: "unique_user_attendance",
        },
      ],
    }
  );

  return DailyWorkRecord;
};

