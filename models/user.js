'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  User.init(
    {
      fullName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true
        }
      },
      role: {
        type: DataTypes.ENUM('admin', 'employee', 'manager'),
        allowNull: false,
        defaultValue: 'employee'
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active'
      }
    }, {
   sequelize,
      modelName: 'User',
      tableName: 'users',
      timestamps: true
  });
  User.associate = (models) => {
    User.hasOne(models.UserInfo, { foreignKey: 'userId', as: 'userInfo', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
  };
  return User;
};