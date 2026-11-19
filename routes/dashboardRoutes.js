const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { isAdmin } = require('../middleware/authMiddleware');
const { getAccountActivity } = require('../controllers/accountActivityController');

router.get('/account-activity', isAdmin, getAccountActivity);
router.get('/workforce',isAdmin,require('../controllers/workforceDashboardController')(require('../models')));
router.get('/hr-tasks',isAdmin,require('../controllers/pendingHrTaskDashboardController')(require('../models')));
router.get('/probation-expirations',isAdmin,require('../controllers/probationExpiryDashboardController')(require('../models')));
router.get('/approved-leave-day',isAdmin,require('../controllers/approvedLeaveDayDashboardController')(require('../models')));
router.get('/upcoming/:kind',isAdmin,require('../controllers/workforceCelebrationsController')(require('../models')));
router.get('/summary', dashboardController.getSummary);

module.exports = router;
