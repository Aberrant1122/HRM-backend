const { Notification, Task } = require('../models');

class NotificationController {
  // Get all notifications for a user
  async getNotifications(req, res) {
    try {
      const { userId } = req.params;
      const notifications = await Notification.findAll({
        where: { userId },
        include: [{ model: Task, as: 'task' }],
        order: [['createdAt', 'DESC']],
      });
      res.json({ success: true, data: notifications });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
  }

  // Get notifications for authenticated user
  async getMyNotifications(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const notifications = await Notification.findAll({
        where: { userId },
        include: [{ model: Task, as: 'task' }],
        order: [['createdAt', 'DESC']],
      });
      res.json({ success: true, data: notifications });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
  }

  // Create a notification
  async createNotification(req, res) {
    try {
      const { userId, message, taskId } = req.body;
      if (!userId || !message) {
        return res.status(400).json({ success: false, message: 'userId and message are required' });
      }
      const notification = await Notification.create({
        userId,
        message,
        taskId: taskId || null,
        isRead: false,
      });
      res.status(201).json({ success: true, data: notification });
    } catch (error) {
      console.error('Error creating notification:', error);
      res.status(500).json({ success: false, message: 'Failed to create notification' });
    }
  }

  // Mark a notification as read
  async markAsRead(req, res) {
    try {
      const { id } = req.params;
      const notification = await Notification.findByPk(id);
      if (!notification) {
        return res.status(404).json({ success: false, message: 'Notification not found' });
      }
      if (req.user && notification.userId !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      await notification.update({ isRead: true });
      res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
    }
  }

  // Mark all notifications as read for authenticated user
  async markAllAsRead(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      await Notification.update(
        { isRead: true },
        { where: { userId, isRead: false } }
      );
      res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({ success: false, message: 'Failed to mark all notifications as read' });
    }
  }

  // Delete a notification
  async deleteNotification(req, res) {
    try {
      const { id } = req.params;
      const notification = await Notification.findByPk(id);
      if (!notification) {
        return res.status(404).json({ success: false, message: 'Notification not found' });
      }
      if (req.user && notification.userId !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      await notification.destroy();
      res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({ success: false, message: 'Failed to delete notification' });
    }
  }

  // Get unread notifications count for authenticated user
  async getUnreadCount(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const count = await Notification.count({ where: { userId, isRead: false } });
      res.json({ success: true, count });
    } catch (error) {
      console.error('Error fetching unread notifications count:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch unread count' });
    }
  }
}

module.exports = new NotificationController();