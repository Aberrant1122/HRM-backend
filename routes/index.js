const express = require('express');
const authRoutes = require('./authRoutes');
const employeeRoutes = require('./employeeRoutes');

const router = express.Router();

router.use('/auth', authRoutes); // Routes from authRoutes.js will be prefixed with /auth
router.use('/employee', employeeRoutes); 


module.exports = router; 
