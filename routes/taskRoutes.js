const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const verifyToken = require('../middleware/verifyToken');

// Apply authentication middleware to all routes
router.use(verifyToken);

// Task CRUD operations
router.post('/create-task', taskController.createTask);
router.get('/all-tasks', taskController.getAllTasks);
router.get('/get-task/:id', taskController.getTaskById);
router.put('/update-task/:id', taskController.updateTask);
router.delete('/delete-task/:id', taskController.deleteTask);

// Task management operations
router.put('/update-task-progress/:id', taskController.updateTaskProgress);
router.put('/change-task-status/:id', taskController.changeTaskStatus);
router.put('/assign-task-to-user/:id', taskController.assignTaskToUser);

// Task queries
router.get('/assignee/:assigneeId', taskController.getTasksByAssignee);
router.get('/project/:projectId', taskController.getTasksByProject);
router.get('/overdue', taskController.getOverdueTasks);
router.get('/statistics', taskController.getTaskStatistics);

module.exports = router;
