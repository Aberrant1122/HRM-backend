const express = require('express');
const authRoutes = require('./authRoutes'); 

const router = express.Router();

router.use('/auth', authRoutes); // Routes from authRoutes.js will be prefixed with /auth

module.exports = router; 
