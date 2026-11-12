const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { isAdmin } = require('../middleware/authMiddleware');
const { getAccountActivity } = require('../controllers/accountActivityController');

router.get('/account-activity', isAdmin, getAccountActivity);
router.get('/workforce',isAdmin,require('../controllers/workforceDashboardController')(require('../models')));
router.get('/summary', dashboardController.getSummary);

module.exports = router;
