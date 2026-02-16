'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProjectCommunication extends Model {
    static associate(models) {
      // ProjectCommunication belongs to Project
      ProjectCommunication.belongsTo(models.Project, {
        foreignKey: 'projectId',
        as: 'project',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });

      // ProjectCommunication belongs to User (sender)
      ProjectCommunication.belongsTo(models.User, {
        foreignKey: 'senderId',
        as: 'sender',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
    }
  }

  ProjectCommunication.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    projectId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'projects',
        key: 'id'
      }
    },
    senderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Message cannot be empty' }
      }
    },
    attachments: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    isPrivate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'ProjectCommunication',
    tableName: 'ProjectCommunications',
    timestamps: true,
    indexes: [
      {
        fields: ['projectId']
      },
      {
        fields: ['senderId']
      },
      {
        fields: ['isPrivate']
      },
      {
        fields: ['createdAt']
      }
    ]
  });

  return ProjectCommunication;
};
