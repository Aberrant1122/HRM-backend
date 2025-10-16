module.exports = (sequelize, DataTypes) => {
  const Project = sequelize.define('Project', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Project name is required" },
        len: {
          args: [3, 100],
          msg: "Project name must be between 3 and 100 characters"
        }
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('planning', 'active', 'on-hold', 'completed', 'cancelled'),
      defaultValue: 'planning',
      validate: {
        isIn: {
          args: [['planning', 'active', 'on-hold', 'completed', 'cancelled']],
          msg: 'Invalid project status'
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
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
      validate: {
        isDate: { msg: "End date must be a valid date" },
        isAfterStartDate(value) {
          if (this.startDate && value && new Date(value) <= new Date(this.startDate)) {
            throw new Error('End date must be after start date');
          }
        }
      }
    },
    budget: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      validate: {
        min: { args: [0], msg: 'Budget cannot be negative' }
      }
    },
    managerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    clientName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    clientEmail: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: { msg: "Please provide a valid client email" }
      }
    },
    attachment: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tags: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    attachments: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
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
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    }
  }, {
    tableName: 'projects',
    timestamps: true,
    indexes: [
      {
        fields: ['managerId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['priority']
      },
      {
        fields: ['startDate']
      },
      {
        fields: ['endDate']
      }
    ],
    hooks: {
      beforeUpdate: (project) => {
        // Auto-update progress based on completed tasks
        if (project.changed('status') && project.status === 'completed') {
          project.progress = 100;
        }
      }
    }
  });

  // Define associations
  Project.associate = function(models) {
    // Project belongs to a User (manager)
    Project.belongsTo(models.User, {
      foreignKey: 'managerId',
      as: 'manager',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });

    // Project has many Tasks
    Project.hasMany(models.Task, {
      foreignKey: 'projectId',
      as: 'tasks',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  };

  // Instance methods
  Project.prototype.updateProgress = function(newProgress) {
    if (newProgress >= 0 && newProgress <= 100) {
      this.progress = newProgress;
      if (newProgress === 100) {
        this.status = 'completed';
      }
      return this.save();
    }
    throw new Error('Progress must be between 0 and 100');
  };

  Project.prototype.changeStatus = function(newStatus) {
    const validStatuses = ['planning', 'active', 'on-hold', 'completed', 'cancelled'];
    if (validStatuses.includes(newStatus)) {
      this.status = newStatus;
      return this.save();
    }
    throw new Error('Invalid status value');
  };

  // Class methods
  Project.findByManager = function(userId) {
    return this.findAll({
      where: { managerId: userId, isActive: true },
      include: [
        { model: this.sequelize.models.User, as: 'manager', attributes: ['id', 'fullName', 'email'] }
      ],
      order: [['createdAt', 'DESC']]
    });
  };

  Project.findActive = function() {
    return this.findAll({
      where: { 
        status: 'active',
        isActive: true 
      },
      include: [
        { model: this.sequelize.models.User, as: 'manager', attributes: ['id', 'fullName', 'email'] }
      ],
      order: [['priority', 'DESC'], ['endDate', 'ASC']]
    });
  };

  Project.findOverdue = function() {
    return this.findAll({
      where: {
        endDate: {
          [sequelize.Op.lt]: new Date()
        },
        status: {
          [sequelize.Op.notIn]: ['completed', 'cancelled']
        },
        isActive: true
      },
      include: [
        { model: this.sequelize.models.User, as: 'manager', attributes: ['id', 'fullName', 'email'] }
      ]
    });
  };

  return Project;
};
