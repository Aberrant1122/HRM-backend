const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models'); 
const { body, validationResult } = require('express-validator');

// Secret key for JWT signing (store securely in environment variables)
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'your_secret_key';

// Middleware for validation rules
const validateRegister = [
  body('fullName').notEmpty().withMessage('Full name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
];

const validateLogin = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
];

// Controller for user registration
const register = async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  
  console.log('Validation Errors:', errors.array()); // Debugging

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() }); // Send validation errors properly
  }

  const { fullName, email, password } = req.body;

  try {
    // Check if the user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const newUser = await User.create({
      fullName,
      email,
      password: hashedPassword,
    });

    return res.status(201).json({ message: 'User registered successfully', user: newUser });
  } catch (error) {
    console.error('Error in register:', error);

    return res.status(500).json({ 
      message: 'Internal Server Error', 
      error: error.message // Ensure error message is sent
    });
  }
};

// Controller for user login
const login = async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Compare provided password with stored hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET_KEY, { expiresIn: '1h' });

    return res.status(200).json({ message: 'Login successful', token });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = {
  register,
  login,
  validateRegister,
  validateLogin
};
