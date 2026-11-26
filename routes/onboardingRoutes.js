const router = require('express').Router();
const { isAdmin } = require('../middleware/authMiddleware');
const controller = require('../controllers/onboardingController');
router.use(isAdmin);
router.use((req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
router.get('/employee/:employeeId', controller.read);
router.post('/employee/:employeeId/commands', controller.command);
module.exports = router;
