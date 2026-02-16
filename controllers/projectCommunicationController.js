const { ProjectCommunication, User, Project } = require('../models');
const { Op } = require('sequelize');

class ProjectCommunicationController {
  /**
   * Create a new comment/message in a project
   */
  async createMessage(req, res) {
    try {
      const { projectId, message, isPrivate = false } = req.body;
      const senderId = req.user.id;
      const senderRole = req.user.role;

      // Validate required fields
      if (!projectId || !message) {
        return res.status(400).json({
          success: false,
          message: 'Project ID and message are required'
        });
      }

      // Check if project exists
      const project = await Project.findByPk(projectId);
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      // Authorization check
      const isAdmin = senderRole === 'admin';
      const isManager = senderRole === 'manager' && project.managerId === senderId;
      const isClient = senderRole === 'client';

      // Get client for this project
      let projectClient = null;
      if (project.clientEmail) {
        projectClient = await User.findOne({
          where: { email: project.clientEmail, role: 'client' }
        });
      }

      const isProjectClient = isClient && projectClient && projectClient.id === senderId;

      if (!isAdmin && !isManager && !isProjectClient) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this project'
        });
      }

      // Only admin can create private notes
      if (isPrivate && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Only admins can create private notes'
        });
      }

      // Handle file attachments
      const attachments = [];
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

      // Create the communication
      const communication = await ProjectCommunication.create({
        projectId,
        senderId,
        message,
        isPrivate,
        attachments
      });

      // Fetch with associations
      const createdCommunication = await ProjectCommunication.findByPk(communication.id, {
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'fullName', 'email', 'role']
          }
        ]
      });

      // Emit real-time notification to relevant users
      const io = req.app.get('io');
      if (io) {
        // Notify project manager
        if (project.managerId && project.managerId !== senderId) {
          io.to(`user_${project.managerId}`).emit('new_message', {
            projectId,
            message: `New message in project "${project.name}"`,
            communication: createdCommunication
          });
        }

        // Notify client (only if not private or if client is sender)
        if (projectClient && projectClient.id !== senderId && !isPrivate) {
          io.to(`user_${projectClient.id}`).emit('new_message', {
            projectId,
            message: `New message in project "${project.name}"`,
            communication: createdCommunication
          });
        }
      }

      res.status(201).json({
        success: true,
        message: 'Message created successfully',
        data: createdCommunication
      });
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create message',
        error: error.message
      });
    }
  }

  /**
   * Get all messages for a project
   */
  async getProjectMessages(req, res) {
    try {
      const { projectId } = req.params;
      const { page = 1, limit = 50 } = req.query;
      const userId = req.user.id;
      const userRole = req.user.role;

      const offset = (page - 1) * limit;

      // Check if project exists
      const project = await Project.findByPk(projectId);
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      // Authorization check
      const isAdmin = userRole === 'admin';
      const isManager = userRole === 'manager' && project.managerId === userId;
      
      let isClient = false;
      if (userRole === 'client' && project.clientEmail) {
        const client = await User.findOne({
          where: { email: project.clientEmail, role: 'client' }
        });
        isClient = client && client.id === userId;
      }

      if (!isAdmin && !isManager && !isClient) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this project'
        });
      }

      // Build where clause
      const where = { projectId, isActive: true };

      // Managers cannot see private notes (admin-client only)
      if (isManager) {
        where.isPrivate = false;
      }

      // Clients can only see non-private messages
      if (isClient) {
        where.isPrivate = false;
      }

      const { count, rows: messages } = await ProjectCommunication.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'fullName', 'email', 'role']
          }
        ],
        order: [['createdAt', 'ASC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const totalPages = Math.ceil(count / limit);

      res.json({
        success: true,
        data: messages,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching project messages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch messages',
        error: error.message
      });
    }
  }

  /**
   * Update a message (edit)
   */
  async updateMessage(req, res) {
    try {
      const { id } = req.params;
      const { message } = req.body;
      const userId = req.user.id;

      if (!message) {
        return res.status(400).json({
          success: false,
          message: 'Message content is required'
        });
      }

      const communication = await ProjectCommunication.findOne({
        where: { id, isActive: true }
      });

      if (!communication) {
        return res.status(404).json({
          success: false,
          message: 'Message not found'
        });
      }

      // Only sender can edit their message
      if (communication.senderId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only edit your own messages'
        });
      }

      await communication.update({ message });

      const updatedCommunication = await ProjectCommunication.findByPk(id, {
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'fullName', 'email', 'role']
          }
        ]
      });

      res.json({
        success: true,
        message: 'Message updated successfully',
        data: updatedCommunication
      });
    } catch (error) {
      console.error('Error updating message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update message',
        error: error.message
      });
    }
  }

  /**
   * Delete a message (soft delete)
   */
  async deleteMessage(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;

      const communication = await ProjectCommunication.findOne({
        where: { id, isActive: true }
      });

      if (!communication) {
        return res.status(404).json({
          success: false,
          message: 'Message not found'
        });
      }

      // Only sender or admin can delete
      if (communication.senderId !== userId && userRole !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'You can only delete your own messages'
        });
      }

      await communication.update({ isActive: false });

      res.json({
        success: true,
        message: 'Message deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete message',
        error: error.message
      });
    }
  }

  /**
   * Get unread messages count for a project
   */
  async getUnreadCount(req, res) {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;

      // This is a simplified version - you might want to track read status per user
      // For now, we'll return the count of recent messages
      const count = await ProjectCommunication.count({
        where: {
          projectId,
          isActive: true,
          senderId: { [Op.ne]: userId }
        }
      });

      res.json({
        success: true,
        count
      });
    } catch (error) {
      console.error('Error fetching unread count:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch unread count',
        error: error.message
      });
    }
  }
}

module.exports = new ProjectCommunicationController();
