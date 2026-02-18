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
      Notification.belongsTo(models.Project, {
        foreignKey: 'projectId',
        as: 'project',
      });
    }
  }
  Notification.init({
    message: {
      type: DataTypes.STRING,
      allowNull: false
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    taskId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    projectId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM('status_change', 'task_completed', 'overdue', 'file_upload', 'task_assigned', 'manager_assignment', 'general'),
      allowNull: false,
      defaultValue: 'general'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional data like old/new status, file names, etc.'
    }
  }, {
    sequelize,
    modelName: 'Notification',
  });
  return Notification;
};