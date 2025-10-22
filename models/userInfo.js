"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class UserInfo extends Model {
    static associate(models) {
      UserInfo.belongsTo(models.User, {
        foreignKey: "userId",
        as: "users",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
    }
  }

  UserInfo.init(
    {
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
      },
      contactNumber: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      startDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      department: {
        type: DataTypes.ENUM(
          "development",
          "design",
          "seo",
          "marketing",
          "content writing"
        ),
        allowNull: false,
        defaultValue: "development",
      },
      probationEndDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      dob: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      reportingManager: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      cnic: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      employmentStatus: {
        type: DataTypes.ENUM(
          "permanent",
          "contract",
          "internship",
          "terminated",
          "probation"
        ),
        allowNull: false,
        defaultValue: "permanent",
      },
      salary: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      position: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      team: {
        type: DataTypes.ENUM(
          "Royal Executive Limo (REL)",
          "MTM",
          "XCEL HVAC",
          "Ankadiversify",
          "ADS",
          "Team C2"
        ),
        allowNull: true,
        defaultValue: null,
      },
      attachments: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
      },
    },
    {
      sequelize,
      modelName: "UserInfo",
      tableName: "userInfo",
      timestamps: true,
    }
  );

  return UserInfo;
};
