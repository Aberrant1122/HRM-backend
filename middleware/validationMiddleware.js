const { validationResult } = require('express-validator');

/**
 * Middleware to handle validation errors from express-validator
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const handleValidationErrors = (req, res, next) => {
  try {
    // Get the validation result from the request object
    const errors = validationResult(req);
    
    // If there are validation errors, return a 400 response with the errors
    if (!errors.isEmpty()) {
      console.error('=== VALIDATION ERRORS ===');
      console.error('Errors:', errors.array());
      
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
          value: err.value
        }))
      });
    }
    
    // If no errors, proceed to the next middleware/controller
    next();
  } catch (error) {
    console.error('Error in handleValidationErrors:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal validation error',
      error: error.message
    });
  }
};

module.exports = {
  handleValidationErrors
};
