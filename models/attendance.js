"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Attendance extends Model {
    static associate(models) {
      Attendance.belongsTo(models.User, {
        foreignKey: "userId",
        as: "user",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
    }
  }

  Attendance.init(
    {
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: () => new Date().toISOString().slice(0, 10), // gives 'YYYY-MM-DD'
      },

      clockIn: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      clockOut: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("present", "absent", "half-day", "on-leave"),
        allowNull: false,
        defaultValue: "present",
      },
      totalHours: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Attendance",
      tableName: "attendances",
      timestamps: true,
    }
  );

  return Attendance;
};
