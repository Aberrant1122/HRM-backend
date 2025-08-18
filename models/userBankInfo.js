"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class UserBankInfo extends Model {
    static associate(models) {
      // Define association with User model
      UserBankInfo.belongsTo(models.User, {
        foreignKey: "userId",
        as: "user",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
    }
  }

  UserBankInfo.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
      },
      bankName: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "Bank name is required" },
          len: {
            args: [2, 100],
            msg: "Bank name must be between 2 and 100 characters",
          },
        },
      },
      accountTitle: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "Account title is required" },
          len: {
            args: [2, 100],
            msg: "Account title must be between 2 and 100 characters",
          },
        },
      },
      accountNumber: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "Account number is required" },
          isNumeric: { msg: "Account number must contain only numbers" },
          len: {
            args: [5, 30],
            msg: "Account number must be between 5 and 30 digits",
          },
        },
      },
      IBAN: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: { msg: "IBAN is required" },
          is: {
            args: /^[A-Z]{2}\d{2}[A-Z]{4}[A-Z0-9]{16}$/,
            msg: "Please provide a valid IBAN (format: PK00AAAA0000000000000000)",
          },
        },
      },
      branchCode: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
          len: {
            args: [0, 20],
            msg: "Branch code cannot exceed 20 characters",
          },
        },
      },
      branchAddress: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: {
          len: {
            args: [0, 500],
            msg: "Branch address cannot exceed 500 characters",
          },
        },
      },
    },
    {
      sequelize,
      modelName: "UserBankInfo",
      tableName: "userBankInfo",
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ["userId"],
        },
        {
          fields: ["accountNumber"],
        },
        {
          fields: ["IBAN"],
        },
      ],
    }
  );

  return UserBankInfo;
};
