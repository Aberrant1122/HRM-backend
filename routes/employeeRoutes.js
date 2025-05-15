const express = require('express');
const { getAllEmployeesWithUserInfo } = require('../controllers/employeeController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// Route to get all employees with user info
router.get('/allEmployees',authenticate, getAllEmployeesWithUserInfo);

module.exports = router;
