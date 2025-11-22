const { Task, User, Project, Notification, UserInfo } = require('../models');
const { Op } = require('sequelize');

class TaskController {
  // Create a new task
  async createTask(req, res) {
    try {
      const {
        title,
        description,
        status = 'pending',
        priority = 'medium',
        dueDate,
        startDate,
        estimatedHours,
        assigneeId,
        projectId,
        tags = [],
        attachments = []
      } = req.body;

      // Validate required fields
      if (!title) {
        return res.status(400).json({
          success: false,
          message: 'Task title is required'
        });
      }

      // Check if assignee exists
      if (assigneeId) {
        const assignee = await User.findByPk(assigneeId);
        if (!assignee) {
          return res.status(400).json({
            success: false,
            message: 'Assignee not found'
          });
        }
      }

      // Check if project exists
      if (projectId) {
        const project = await Project.findByPk(projectId);
        if (!project) {
          return res.status(400).json({
            success: false,
            message: 'Project not found'
          });
        }
      }

      // Authorization: admin, manager, or project manager
      if (!(req.user.role === 'admin' || req.user.role === 'manager' || (projectId && (await Project.count({ where: { id: projectId, managerId: req.user.id } }))))) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      // Manager department scope when assigning
      if (req.user.role === 'manager' && assigneeId) {
        const [managerInfo, assigneeInfo] = await Promise.all([
          UserInfo.findOne({ where: { userId: req.user.id } }),
          UserInfo.findOne({ where: { userId: assigneeId } }),
        ]);
        const mDept = (managerInfo?.department || '').toLowerCase();
        const aDept = (assigneeInfo?.department || '').toLowerCase();
        if (!mDept || !aDept || mDept !== aDept) {
          return res.status(403).json({ success: false, message: "Assignee must be in manager's department" });
        }
      }

      const task = await Task.create({
        title,
        description,
        status,
        priority,
        dueDate,
        startDate,
        estimatedHours,
        assigneeId,
        projectId,
        tags,
        attachments,
        createdBy: req.user.id
      });

      // Fetch the created task with associations
      const createdTask = await Task.findByPk(task.id, {
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'fullName', 'email']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name']
          },
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'fullName', 'email']
          }
        ]
      });

      // Create a notification for the assignee
      if (createdTask.assigneeId) {
        await Notification.create({
          message: `You have been assigned a new task: "${createdTask.title}"`,
          isRead: false,
          userId: createdTask.assigneeId,
          taskId: createdTask.id,
        });
      }

      res.status(201).json({
        success: true,
        message: 'Task created successfully',
        data: createdTask
      });
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create task',
        error: error.message
      });
    }
  }

  // Get all tasks with filtering and pagination
  async getAllTasks(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        priority,
        assigneeId,
        projectId,
        search,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;
      const where = { isActive: true };

      // Apply filters
      if (status) where.status = status;
      if (priority) where.priority = priority;
      if (assigneeId) where.assigneeId = assigneeId;
      if (projectId) where.projectId = projectId;

      // Search functionality (keep separate to avoid being overwritten)
      const searchOr = [];
      if (search) {
        searchOr.push(
          { title: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } }
        );
      }

      // Scope to projects managed by the current user (works for role 'manager' and project managers)
      const projectsManaged = await Project.findAll({ where: { managerId: req.user.id }, attributes: ['id'] });
      const managedProjectIds = projectsManaged.map(p => p.id);
      const isAdmin = req.user.role === 'admin';
      const isManager = req.user.role === 'manager';
      if (!isAdmin && (isManager || managedProjectIds.length)) {
        const scopeOr = [
          ...(managedProjectIds.length ? [{ projectId: { [Op.in]: managedProjectIds } }] : []),
        ];
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({ [Op.or]: scopeOr });
      }

      // Apply search conditions if present
      if (searchOr.length) {
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({ [Op.or]: searchOr });
      }

      const { count, rows: tasks } = await Task.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'fullName', 'email']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name']
          },
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'fullName', 'email']
          }
        ],
        order: [[sortBy, sortOrder.toUpperCase()]],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const totalPages = Math.ceil(count / limit);

      res.json({
        success: true,
        data: tasks,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tasks',
        error: error.message
      });
    }
  }

  // Get a single task by ID
  async getTaskById(req, res) {
    try {
      const { id } = req.params;

      const task = await Task.findOne({
        where: { id, isActive: true },
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'fullName', 'email']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name', 'description']
          },
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'fullName', 'email']
          }
        ]
      });

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Task not found'
        });
      }

      res.json({
        success: true,
        data: task
      });
    } catch (error) {
      console.error('Error fetching task:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch task',
        error: error.message
      });
    }
  }

  // Update a task
  async updateTask(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const task = await Task.findOne({
        where: { id, isActive: true }
      });

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Task not found'
        });
      }

      // Store the old assignee ID before updating
      const oldAssigneeId = task.assigneeId;

      // Check if assignee exists
      if (updateData.assigneeId) {
        const assignee = await User.findByPk(updateData.assigneeId);
        if (!assignee) {
          return res.status(400).json({
            success: false,
            message: 'Assignee not found'
          });
        }
      }

      // Check if project exists
      if (updateData.projectId) {
        const project = await Project.findByPk(updateData.projectId);
        if (!project) {
          return res.status(400).json({
            success: false,
            message: 'Project not found'
          });
        }
      }

      // Authorization: admin, manager, or project manager
      const projectMgr = await Project.findOne({ where: { id: task.projectId, managerId: req.user.id } });
      if (!(req.user.role === 'admin' || req.user.role === 'manager' || projectMgr)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      // Update the task
      await task.update(updateData);

      // Create notification if assignee changed
      if (updateData.assigneeId && updateData.assigneeId !== oldAssigneeId) {
        try {
          const notification = await Notification.create({
            message: `You have been assigned a new task: "${task.title}"`,
            isRead: false,
            userId: updateData.assigneeId,
            taskId: task.id,
          });

          // Emit socket event to the new assignee
          const io = req.app.get('io');
          if (io) {
            io.to(`user_${updateData.assigneeId}`).emit('notification', notification);
          }
        } catch (notificationError) {
          console.error('Error creating notification:', notificationError);
          // Don't fail the task update if notification creation fails
        }
      }

      // Fetch updated task with associations
      const updatedTask = await Task.findByPk(id, {
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'fullName', 'email']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name']
          },
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'fullName', 'email']
          }
        ]
      });

      res.json({
        success: true,
        message: 'Task updated successfully',
        data: updatedTask
      });
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update task',
        error: error.message
      });
    }
  }

  // Delete a task (soft delete)
  async deleteTask(req, res) {
    try {
      const { id } = req.params;

      const task = await Task.findOne({
        where: { id, isActive: true }
      });

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Task not found'
        });
      }

      // Soft delete by setting isActive to false
      await task.update({ isActive: false });

      res.json({
        success: true,
        message: 'Task deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete task',
        error: error.message
      });
    }
  }

  // Get tasks by assignee
  async getTasksByAssignee(req, res) {
    try {
      const { assigneeId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const offset = (page - 1) * limit;

      const { count, rows: tasks } = await Task.findAndCountAll({
        where: { assigneeId, isActive: true },
        include: [
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name']
          },
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'fullName', 'email']
          }
        ],
        order: [['dueDate', 'ASC'], ['priority', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const totalPages = Math.ceil(count / limit);

      res.json({
        success: true,
        data: tasks,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching tasks by assignee:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tasks by assignee',
        error: error.message
      });
    }
  }

  // Get tasks by project
  async getTasksByProject(req, res) {
    try {
      const { projectId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const offset = (page - 1) * limit;

      const { count, rows: tasks } = await Task.findAndCountAll({
        where: { projectId, isActive: true },
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'fullName', 'email']
          },
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'fullName', 'email']
          }
        ],
        order: [['dueDate', 'ASC'], ['priority', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const totalPages = Math.ceil(count / limit);

      res.json({
        success: true,
        data: tasks,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching tasks by project:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tasks by project',
        error: error.message
      });
    }
  }

  // Update task progress
  async updateTaskProgress(req, res) {
    try {
      const { id } = req.params;
      const { progress } = req.body;

      if (progress < 0 || progress > 100) {
        return res.status(400).json({
          success: false,
          message: 'Progress must be between 0 and 100'
        });
      }

      const task = await Task.findOne({
        where: { id, isActive: true }
      });

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Task not found'
        });
      }

      await task.updateProgress(progress);

      res.json({
        success: true,
        message: 'Task progress updated successfully',
        data: task
      });
    } catch (error) {
      console.error('Error updating task progress:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update task progress',
        error: error.message
      });
    }
  }

  // Change task status
  async changeTaskStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const task = await Task.findOne({
        where: { id, isActive: true }
      });

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Task not found'
        });
      }

      const projMgr = await Project.findOne({ where: { id: task.projectId, managerId: req.user.id } });
      const privileged = (req.user.role === 'admin' || req.user.role === 'manager' || projMgr);
      if (status === 'completed' && !privileged) {
        return res.status(403).json({ success: false, message: 'Only manager or admin can approve completion' });
      }
      await task.changeStatus(status);

      res.json({
        success: true,
        message: 'Task status changed successfully',
        data: task
      });
    } catch (error) {
      console.error('Error changing task status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to change task status',
        error: error.message
      });
    }
  }

  // Assign task to user
  async assignTaskToUser(req, res) {
    try {
      const { id } = req.params;
      const { assigneeId } = req.body;

      if (!assigneeId) {
        return res.status(400).json({
          success: false,
          message: 'Assignee ID is required'
        });
      }

      // Check if assignee exists
      const assignee = await User.findByPk(assigneeId);
      if (!assignee) {
        return res.status(400).json({
          success: false,
          message: 'Assignee not found'
        });
      }

      const task = await Task.findOne({
        where: { id, isActive: true }
      });

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Task not found'
        });
      }

      // Authorization: admin, manager, or project manager
      const projMgr = await Project.findOne({ where: { id: task.projectId, managerId: req.user.id } });
      if (!(req.user.role === 'admin' || req.user.role === 'manager' || projMgr)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      // Manager department check
      if (req.user.role === 'manager') {
        const [managerInfo, assigneeInfo] = await Promise.all([
          UserInfo.findOne({ where: { userId: req.user.id } }),
          UserInfo.findOne({ where: { userId: assigneeId } }),
        ]);
        const mDept = (managerInfo?.department || '').toLowerCase();
        const aDept = (assigneeInfo?.department || '').toLowerCase();
        if (!mDept || !aDept || mDept !== aDept) {
          return res.status(403).json({ success: false, message: "Assignee must be in manager's department" });
        }
      }

      // Store old assignee ID for notification logic
      const oldAssigneeId = task.assigneeId;

      await task.assignToUser(assigneeId);

      // Create notification if assignee changed
      if (assigneeId && assigneeId !== oldAssigneeId) {
        try {
          const notification = await Notification.create({
            message: `You have been assigned a new task: "${task.title}"`,
            isRead: false,
            userId: assigneeId,
            taskId: task.id,
          });

          // Emit socket event to the new assignee
          const io = req.app.get('io');
          if (io) {
            io.to(`user_${assigneeId}`).emit('notification', notification);
          }
        } catch (notificationError) {
          console.error('Error creating notification:', notificationError);
          // Don't fail the task assignment if notification creation fails
        }
      }

      res.json({
        success: true,
        message: 'Task assigned successfully',
        data: task
      });
    } catch (error) {
      console.error('Error assigning task:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to assign task',
        error: error.message
      });
    }
  }

  // Get overdue tasks
  async getOverdueTasks(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const { count, rows: tasks } = await Task.findAndCountAll({
        where: {
          dueDate: {
            [Op.lt]: new Date()
          },
          status: {
            [Op.notIn]: ['completed', 'cancelled']
          },
          isActive: true
        },
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'fullName', 'email']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name']
          }
        ],
        order: [['dueDate', 'ASC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const totalPages = Math.ceil(count / limit);

      res.json({
        success: true,
        data: tasks,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching overdue tasks:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch overdue tasks',
        error: error.message
      });
    }
  }

  // Submit deliverables for a task
  async submitDeliverables(req, res) {
    try {
      const { id } = req.params;
      const { comment } = req.body;

      const task = await Task.findOne({
        where: { id, isActive: true }
      });

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Task not found'
        });
      }

      // Check if user is the assignee
      if (task.assigneeId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to submit deliverables for this task'
        });
      }

      // Check if task is in progress or pending
      if (task.status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Cannot submit deliverables for completed task'
        });
      }

      const attachments = [];

      // Process uploaded files
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          attachments.push({
            filename: file.originalname,
            key: file.key,
            url: file.location || `${process.env.AWS_S3_ENDPOINT || 'https://s3.amazonaws.com'}/${process.env.AWS_S3_BUCKET}/${file.key}`,
            size: file.size,
            mimetype: file.mimetype,
            uploadedAt: new Date()
          });
        });
      }

      // Update task attachments
      const currentAttachments = task.attachments || [];
      const updatedAttachments = [...currentAttachments, ...attachments];

      await task.update({
        attachments: updatedAttachments,
        status: 'in-review',
        progress: 100
      });

      // Create notification for task creator
      if (task.createdBy) {
        await Notification.create({
          message: `Deliverables submitted for task: "${task.title}"`,
          isRead: false,
          userId: task.createdBy,
          taskId: task.id,
        });
      }

      res.json({
        success: true,
        message: 'Deliverables submitted successfully',
        data: {
          task: task,
          attachments: attachments
        }
      });
    } catch (error) {
      console.error('Error submitting deliverables:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit deliverables',
        error: error.message
      });
    }
  }

  // Get task statistics
  async getTaskStatistics(req, res) {
    try {
      const totalTasks = await Task.count({ where: { isActive: true } });
      const pendingTasks = await Task.count({ where: { status: 'pending', isActive: true } });
      const inProgressTasks = await Task.count({ where: { status: 'in-progress', isActive: true } });
      const completedTasks = await Task.count({ where: { status: 'completed', isActive: true } });
      const blockedTasks = await Task.count({ where: { status: 'blocked', isActive: true } });
      const overdueTasks = await Task.count({
        where: {
          dueDate: { [Op.lt]: new Date() },
          status: { [Op.notIn]: ['completed', 'cancelled'] },
          isActive: true
        }
      });

      res.json({
        success: true,
        data: {
          total: totalTasks,
          pending: pendingTasks,
          inProgress: inProgressTasks,
          completed: completedTasks,
          blocked: blockedTasks,
          overdue: overdueTasks
        }
      });
    } catch (error) {
      console.error('Error fetching task statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch task statistics',
        error: error.message
      });
    }
  }

  // Get manager-specific task statistics (only tasks from projects they manage)
  async getManagerTaskStatistics(req, res) {
    try {
      // Get all projects managed by this manager
      const projectsManaged = await Project.findAll({
        where: { managerId: req.user.id },
        attributes: ['id']
      });
      const managedProjectIds = projectsManaged.map(p => p.id);

      // If manager has no projects, return zeros
      if (managedProjectIds.length === 0) {
        return res.json({
          success: true,
          data: {
            totalTasks: 0,
            pendingTasks: 0,
            inProgressTasks: 0,
            completedTasks: 0,
            overdueTasks: 0,
            activeProjects: 0
          }
        });
      }

      // Count tasks only from manager's projects
      const baseWhere = {
        projectId: { [Op.in]: managedProjectIds },
        isActive: true
      };

      const totalTasks = await Task.count({ where: baseWhere });
      const pendingTasks = await Task.count({
        where: { ...baseWhere, status: 'pending' }
      });
      const inProgressTasks = await Task.count({
        where: { ...baseWhere, status: 'in-progress' }
      });
      const completedTasks = await Task.count({
        where: { ...baseWhere, status: 'completed' }
      });
      const overdueTasks = await Task.count({
        where: {
          ...baseWhere,
          dueDate: { [Op.lt]: new Date() },
          status: { [Op.notIn]: ['completed', 'cancelled'] }
        }
      });

      res.json({
        success: true,
        data: {
          totalTasks,
          pendingTasks,
          inProgressTasks,
          completedTasks,
          overdueTasks,
          activeProjects: managedProjectIds.length
        }
      });
    } catch (error) {
      console.error('Error fetching manager task statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch manager task statistics',
        error: error.message
      });
    }
  }
}

module.exports = new TaskController();
