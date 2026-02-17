const express = require('express');
const router = express.Router();

const NotificationController = require('../controllers/notificationController');



router.get('/', NotificationController.getMyNotifications);
router.get('/unread-count', NotificationController.getUnreadCount);
router.post('/', NotificationController.createNotification);
router.put('/:id/read', NotificationController.markAsRead);
router.put('/mark-all-read', NotificationController.markAllAsRead);
router.patch('/:id/read', NotificationController.markAsRead);
router.patch('/read-all', NotificationController.markAllAsRead);
router.delete('/:id', NotificationController.deleteNotification);

router.get('/:userId', NotificationController.getNotifications);

module.exports = router;