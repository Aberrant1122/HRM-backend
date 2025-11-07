module.exports = (sequelize, DataTypes) => {
  const Task = sequelize.define('Task', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Task title is required" },
        len: {
          args: [3, 200],
          msg: "Task title must be between 3 and 200 characters"
        }
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'in-progress', 'completed', 'blocked', 'cancelled'),
      defaultValue: 'pending',
      validate: {
        isIn: {
          args: [['pending', 'in-progress', 'completed', 'blocked', 'cancelled']],
          msg: 'Invalid status value'
        }
      }
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
      defaultValue: 'medium',
      validate: {
        isIn: {
          args: [['low', 'medium', 'high', 'urgent']],
          msg: 'Invalid priority value'
        }
      }
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: true,
      validate: {
        isDate: { msg: "Due date must be a valid date" },
        isFutureDate(value) {
          if (value && new Date(value) < new Date()) {
            throw new Error('Due date cannot be in the past');
          }
        }
      }
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
   
   
    assigneeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    projectId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'projects',
        key: 'id'
      }
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
  
    progress: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: { args: [0], msg: 'Progress cannot be negative' },
        max: { args: [100], msg: 'Progress cannot exceed 100%' }
      }
    },
    attachments: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      validate: {
        isArray(value) {
          if (value && !Array.isArray(value)) {
            throw new Error('Attachments must be an array');
          }
        }
      }
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    }
  }, {
    tableName: 'tasks',
    timestamps: true,
    indexes: [
      {
        fields: ['assigneeId']
      },
      {
        fields: ['projectId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['priority']
      },
      {
        fields: ['dueDate']
      },
      {
        fields: ['createdBy']
      }
    ],
    hooks: {
      beforeUpdate: (task) => {
        // Auto-update completedDate when status changes to completed
        if (task.changed('status') && task.status === 'completed' && !task.completedDate) {
          task.completedDate = new Date();
        }
        
        // Auto-update progress when status changes
        if (task.changed('status')) {
          switch (task.status) {
            case 'pending':
              task.progress = 0;
              break;
            case 'in-progress':
              task.progress = task.progress > 0 ? task.progress : 25;
              break;
            case 'completed':
              task.progress = 100;
              break;
            case 'blocked':
              task.progress = task.progress;
              break;
            case 'cancelled':
              task.progress = 0;
              break;
          }
        }
      }
    }
  });

  // Define associations
  Task.associate = function(models) {
    // Task belongs to a User (assignee)
    Task.belongsTo(models.User, {
      foreignKey: 'assigneeId',
      as: 'assignee',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    // Task belongs to a Project
    Task.belongsTo(models.Project, {
      foreignKey: 'projectId',
      as: 'project',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    // Task belongs to a User (creator)
    Task.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });
  };

  // Instance methods
  Task.prototype.updateProgress = function(newProgress) {
    if (newProgress >= 0 && newProgress <= 100) {
      this.progress = newProgress;
      if (newProgress === 100) {
        this.status = 'completed';
        this.completedDate = new Date();
      } else if (newProgress > 0) {
        this.status = 'in-progress';
      }
      return this.save();
    }
    throw new Error('Progress must be between 0 and 100');
  };

  Task.prototype.assignToUser = async function(userId) {
    const oldAssigneeId = this.assigneeId;

    this.assigneeId = userId;
    await this.save();

    return this;
  };

  Task.prototype.changeStatus = function(newStatus) {
    const validStatuses = ['pending', 'in-progress', 'completed', 'blocked', 'cancelled'];
    if (validStatuses.includes(newStatus)) {
      this.status = newStatus;
      return this.save();
    }
    throw new Error('Invalid status value');
  };

  // Class methods
  Task.findByAssignee = function(userId) {
    return this.findAll({
      where: { assigneeId: userId, isActive: true },
      include: [
        { model: this.sequelize.models.User, as: 'assignee', attributes: ['id', 'fullName', 'email'] },
        { model: this.sequelize.models.Project, as: 'project', attributes: ['id', 'name'] }
      ],
      order: [['dueDate', 'ASC'], ['priority', 'DESC']]
    });
  };

  Task.findByProject = function(projectId) {
    return this.findAll({
      where: { projectId: projectId, isActive: true },
      include: [
        { model: this.sequelize.models.User, as: 'assignee', attributes: ['id', 'fullName', 'email'] },
        { model: this.sequelize.models.User, as: 'creator', attributes: ['id', 'fullName', 'email'] }
      ],
      order: [['dueDate', 'ASC'], ['priority', 'DESC']]
    });
  };

  Task.findOverdue = function() {
    return this.findAll({
      where: {
        dueDate: {
          [sequelize.Op.lt]: new Date()
        },
        status: {
          [sequelize.Op.notIn]: ['completed', 'cancelled']
        },
        isActive: true
      },
      include: [
        { model: this.sequelize.models.User, as: 'assignee', attributes: ['id', 'fullName', 'email'] }
      ]
    });
  };

  return Task;
};