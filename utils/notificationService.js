const { emitToUser } = require('./realtimeAccess');
const { Notification, User, Project } = require('../models');

class NotificationService {
  /**
   * Create a notification and emit via Socket.IO
   * @param {Object} data - Notification data
   * @param {number} data.userId - User ID to notify
   * @param {string} data.message - Notification message
   * @param {string} data.type - Notification type
   * @param {number} data.projectId - Optional project ID
   * @param {number} data.taskId - Optional task ID
   * @param {Object} data.metadata - Optional metadata
   * @param {Object} io - Socket.IO instance
   */
  static async createNotification(data, io = null) {
    try {
      const notification = await Notification.create({
        userId: data.userId,
        message: data.message,
        type: data.type || 'general',
        projectId: data.projectId || null,
        taskId: data.taskId || null,
        metadata: data.metadata || null,
        isRead: false
      });

      // Emit real-time notification via Socket.IO
      if (io) {
        await emitToUser(io, data.userId, 'notification', {
          id: notification.id,
          message: notification.message,
          type: notification.type,
          projectId: notification.projectId,
          taskId: notification.taskId,
          metadata: notification.metadata,
          isRead: false,
          createdAt: notification.createdAt
        });
      }

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Notify client about project status change
   */
  static async notifyProjectStatusChange(projectId, oldStatus, newStatus, io = null) {
    try {
      const project = await Project.findByPk(projectId, {
        include: [{ model: User, as: 'manager' }]
      });

      if (!project || !project.clientEmail) {
        return null;
      }

      // Find client user by email
      const client = await User.findOne({
        where: { email: project.clientEmail, role: 'client' }
      });

      if (!client) {
        return null;
      }

      const message = `Project "${project.name}" status changed from ${oldStatus} to ${newStatus}`;
      
      return await this.createNotification({
        userId: client.id,
        message,
        type: 'status_change',
        projectId: project.id,
        metadata: { oldStatus, newStatus }
      }, io);
    } catch (error) {
      console.error('Error notifying project status change:', error);
      return null;
    }
  }

  /**
   * Notify client about task completion
   */
  static async notifyTaskCompletion(task, io = null) {
    try {
      if (!task.projectId) {
        return null;
      }

      const project = await Project.findByPk(task.projectId);
      if (!project || !project.clientEmail) {
        return null;
      }

      const client = await User.findOne({
        where: { email: project.clientEmail, role: 'client' }
      });

      if (!client) {
        return null;
      }

      const message = `Task "${task.title}" in project "${project.name}" has been completed`;
      
      return await this.createNotification({
        userId: client.id,
        message,
        type: 'task_completed',
        projectId: project.id,
        taskId: task.id,
        metadata: { taskTitle: task.title, projectName: project.name }
      }, io);
    } catch (error) {
      console.error('Error notifying task completion:', error);
      return null;
    }
  }

  /**
   * Notify client about overdue task
   */
  static async notifyOverdueTask(task, io = null) {
    try {
      if (!task.projectId) {
        return null;
      }

      const project = await Project.findByPk(task.projectId);
      if (!project || !project.clientEmail) {
        return null;
      }

      const client = await User.findOne({
        where: { email: project.clientEmail, role: 'client' }
      });

      if (!client) {
        return null;
      }

      const message = `Task "${task.title}" in project "${project.name}" is overdue`;
      
      return await this.createNotification({
        userId: client.id,
        message,
        type: 'overdue',
        projectId: project.id,
        taskId: task.id,
        metadata: { 
          taskTitle: task.title, 
          projectName: project.name,
          dueDate: task.dueDate 
        }
      }, io);
    } catch (error) {
      console.error('Error notifying overdue task:', error);
      return null;
    }
  }

  /**
   * Notify client about file upload
   */
  static async notifyFileUpload(projectId, fileName, uploadedBy, io = null) {
    try {
      const project = await Project.findByPk(projectId);
      if (!project || !project.clientEmail) {
        return null;
      }

      const client = await User.findOne({
        where: { email: project.clientEmail, role: 'client' }
      });

      if (!client) {
        return null;
      }

      const message = `New file "${fileName}" uploaded to project "${project.name}"`;
      
      return await this.createNotification({
        userId: client.id,
        message,
        type: 'file_upload',
        projectId: project.id,
        metadata: { 
          fileName, 
          uploadedBy,
          projectName: project.name 
        }
      }, io);
    } catch (error) {
      console.error('Error notifying file upload:', error);
      return null;
    }
  }

  /**
   * Notify user about being assigned as project manager
   */
  static async notifyManagerAssignment(userId, projectId, projectName, io = null) {
    try {
      const message = `You have been assigned as manager for project: "${projectName}"`;
      
      return await this.createNotification({
        userId,
        message,
        type: 'manager_assignment',
        projectId,
        metadata: { 
          projectName,
          assignedAt: new Date()
        }
      }, io);
    } catch (error) {
      console.error('Error notifying manager assignment:', error);
      return null;
    }
  }

  /**
   * Batch notify clients about overdue tasks
   */
  static async notifyOverdueTasks(io = null) {
    try {
      const { Task, Project, User } = require('../models');
      const { Op } = require('sequelize');

      // Find all overdue tasks
      const overdueTasks = await Task.findAll({
        where: {
          dueDate: { [Op.lt]: new Date() },
          status: { [Op.notIn]: ['completed', 'cancelled'] },
          isActive: true
        },
        include: [
          {
            model: Project,
            as: 'project',
            where: { clientEmail: { [Op.ne]: null } }
          }
        ]
      });

      const notifications = [];
      for (const task of overdueTasks) {
        const notification = await this.notifyOverdueTask(task, io);
        if (notification) {
          notifications.push(notification);
        }
      }

      return notifications;
    } catch (error) {
      console.error('Error in batch overdue notification:', error);
      return [];
    }
  }
}

module.exports = NotificationService;
