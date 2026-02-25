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

    // Method to format time in PKT timezone
    getPKTFormat(time) {
      if (!time) return null;
      const utc = new Date(time);
      const pkt = new Date(utc.getTime() + (5 * 60 * 60 * 1000));
      return pkt.toLocaleString('en-PK', {
        timeZone: 'Asia/Karachi',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }

    // Method to format date in PKT timezone
    getPKTDate(time) {
      if (!time) return null;
      const utc = new Date(time);
      const pkt = new Date(utc.getTime() + (5 * 60 * 60 * 1000));
      return pkt.toLocaleDateString('en-PK', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    }

    // Method to convert hours to HH:MM format
    getHoursFormat(hours) {
      if (hours === null || hours === undefined) return null;

      // Get hours and minutes from the decimal value
      const hoursPart = Math.floor(hours);
      const minutesPart = Math.floor((hours - hoursPart) * 60);

      // Format as HH:MM
      return `${hoursPart.toString().padStart(2, '0')}:${minutesPart.toString().padStart(2, '0')}`;
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
      indexes: [
        {
          fields: ["userId", "date"],
          name: "idx_attendance_user_date"
        }
      ]
    }

  );

  return Attendance;
};
