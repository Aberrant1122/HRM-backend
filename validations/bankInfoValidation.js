const { body } = require('express-validator');

const bankInfoValidation = [
  body('bankName')
    .trim()
    .notEmpty().withMessage('Bank name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Bank name must be between 2 and 100 characters'),
  
  body('accountTitle')
    .trim()
    .notEmpty().withMessage('Account title is required')
    .isLength({ min: 2, max: 100 }).withMessage('Account title must be between 2 and 100 characters'),
  
  body('accountNumber')
    .trim()
    .notEmpty().withMessage('Account number is required')
    .isLength({ min: 5, max: 30 }).withMessage('Account number must be between 5 and 30 characters'),
  
  body('IBAN')
    .trim()
    .notEmpty().withMessage('IBAN is required')
    .isIBAN().withMessage('Please provide a valid IBAN'),
  
  body('branchCode')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 20 }).withMessage('Branch code cannot exceed 20 characters'),
  
  body('branchAddress')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Branch address cannot exceed 500 characters')
];

module.exports = {
  bankInfoValidation
};
