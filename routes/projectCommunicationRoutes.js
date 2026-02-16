const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const ProjectCommunicationController = require('../controllers/projectCommunicationController');
const { upload } = require('../middleware/upload');

// All routes require authentication
router.use(authenticate);

// Create a new message (with optional file attachments)
router.post('/', upload.array('files', 5), ProjectCommunicationController.createMessage);

// Get all messages for a project
router.get('/project/:projectId', ProjectCommunicationController.getProjectMessages);

// Get unread count for a project
router.get('/project/:projectId/unread-count', ProjectCommunicationController.getUnreadCount);

// Update a message
router.patch('/:id', ProjectCommunicationController.updateMessage);

// Delete a message
router.delete('/:id', ProjectCommunicationController.deleteMessage);

module.exports = router;
