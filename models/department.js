"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Department extends Model {
    static associate(models) {
      // Define associations here if needed
      // For example, if you want to track which users belong to which departments
      // Department.hasMany(models.User, {
      //   foreignKey: "departmentId",
      //   as: "employees",
      // });
    }
  }

  Department.init(
    {
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: {
            msg: "Department name cannot be empty",
          },
          len: {
            args: [2, 100],
            msg: "Department name must be between 2 and 100 characters",
          },
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: "Department",
      tableName: "departments",
      timestamps: true,
      indexes: [
        {
          fields: ["name"],
          unique: true,
        },
        {
          fields: ["isActive"],
        },
      ],
    }
  );

  return Department;
};