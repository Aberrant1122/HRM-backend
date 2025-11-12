const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { upload } = require('../middleware/upload');
const verifyToken = require('../middleware/verifyToken');

// Apply authentication middleware to all routes
router.use(verifyToken);

// Project CRUD operations
router.post('/create-project', upload.single('attachment'), projectController.createProject);
router.get('/get-all-projects', projectController.getAllProjects);
router.get('/get-project-by-id/:id', projectController.getProjectById);
router.put('/update-project/:id', projectController.updateProject);
router.delete('/delete-project/:id', projectController.deleteProject);

// Project management operations
router.put('/update-project-progress/:id', projectController.updateProjectProgress);
router.put('/change-project-status/:id', projectController.changeProjectStatus);

// Project queries
router.get('/get-project-by-manager/:managerId', projectController.getProjectsByManager);
router.get('/project-statistics', projectController.getProjectStatistics);

// Download project attachment
router.get('/download-attachment/:id', projectController.downloadProjectAttachment);

// Client routes
router.get('/get-projects-by-client', projectController.getProjectsByClient);

module.exports = router;
