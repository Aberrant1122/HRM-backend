"use strict";
const { Model, Op } = require("sequelize");
const bcrypt = require("bcryptjs");

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // User has one UserInfo
      User.hasOne(models.UserInfo, {
        foreignKey: "userId",
        as: "userInfo",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });

      User.hasMany(models.Attendance, {
        foreignKey: "userId",
        as: "attendances",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });

      User.hasOne(models.UserBankInfo, {
        foreignKey: "userId",
        as: "bankInfo",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
    }

    // Method to compare password
    async comparePassword(candidatePassword) {
      return bcrypt.compare(candidatePassword, this.password);
    }
  }

  User.init(
    {
      fullName: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "Full name is required" },
          len: {
            args: [2, 100],
            msg: "Name must be between 2 and 100 characters",
          },
        },
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: {
          msg: "Email already exists",
        },
        validate: {
          isEmail: { msg: "Please provide a valid email" },
          notEmpty: { msg: "Email is required" },
        },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true, // Allow null for OAuth users
        validate: {
          notEmpty: { msg: "Password is required" },
          len: {
            args: [6, 100],
            msg: "Password must be at least 6 characters long",
          },
        },
      },
      role: {
        type: DataTypes.ENUM("admin", "employee", "client"),
        allowNull: false,
        defaultValue: "employee",
        validate: {
          isIn: {
            args: [["admin", "employee", "client"]],
            msg: "Invalid role. Must be either admin, employee, or client.",
          },
        },
      },
      status: {
        type: DataTypes.ENUM("active", "inactive", "suspended"),
        allowNull: false,
        defaultValue: "inactive",
        validate: {
          isIn: {
            args: [["active", "inactive", "suspended"]],
            msg: "Invalid status",
          },
        },
      },
      resetToken: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      resetTokenExpiry: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      lastLogin: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      passwordChangedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      profilePicture: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "User",
      tableName: "users",
      timestamps: true,
      defaultScope: {
        attributes: { exclude: ["password", "resetToken", "resetTokenExpiry"] },
      },
      scopes: {
        withSensitiveData: {
          attributes: {
            include: ["password", "resetToken", "resetTokenExpiry"],
          },
        },
      },
      hooks: {
        beforeCreate: async (user) => {
          if (user.password) {
            user.password = await bcrypt.hash(user.password, 12);
          }
        },
        beforeUpdate: async (user) => {
          if (user.changed("password")) {
            user.password = await bcrypt.hash(user.password, 12);
            user.passwordChangedAt = new Date();
          }
        },
      },
    }
  );

  return User;
};
