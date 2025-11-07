const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const NotificationController = require('../controllers/notificationController');

// Get all notifications for a user
router.get('/:userId', authenticate, NotificationController.getNotifications);

// Mark a notification as read
router.put('/:id/read', authenticate, NotificationController.markAsRead);

module.exports = router;