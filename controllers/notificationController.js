const { Notification } = require('../models');

class NotificationController {
  // Get all notifications for a user
  async getNotifications(req, res) {
    try {
      const { userId } = req.params;
      const notifications = await Notification.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
      });
      res.json({ success: true, data: notifications });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
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
      await notification.update({ isRead: true });
      res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
    }
  }
}

module.exports = new NotificationController();