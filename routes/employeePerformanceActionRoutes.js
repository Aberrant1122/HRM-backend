const express = require('express');
const models = require('../models');
const { isAdmin } = require('../middleware/authMiddleware');
const createController = require('../controllers/employeeRecommendationController');

const controller = createController({
  sequelize: models.sequelize,
  User: models.User,
  EmployeeRecommendation: models.EmployeePerformanceAction,
  EmployeeRecommendationEvent: models.EmployeePerformanceActionEvent,
}, ['warning', 'performance_action']);

const router = express.Router();
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});
router.use(isAdmin);
router.get('/employee/:employeeId', controller.list);
router.post('/employee/:employeeId/commands', controller.command);
router.get('/recommendation/:recommendationId', controller.read);
module.exports = router;