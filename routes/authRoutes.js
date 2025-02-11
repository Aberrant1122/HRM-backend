const express = require('express');
const { register, login } = require('../controllers/authController'); // Import controller functions

const router = express.Router();

// Define the routes and connect them with controller functions
router.post('/register', register);  // POST request to /auth/register
router.post('/login', login);        // POST request to /auth/login

module.exports = router;  
