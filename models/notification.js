'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      Notification.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user',
      });
      Notification.belongsTo(models.Task, {
        foreignKey: 'taskId',
        as: 'task',
      });
    }
  }
  Notification.init({
    message: DataTypes.STRING,
    isRead: DataTypes.BOOLEAN,
    userId: DataTypes.INTEGER,
    taskId: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Notification',
  });
  return Notification;
};