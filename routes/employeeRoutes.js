const express = require("express");
const { param, query } = require("express-validator");
const {
  getAllEmployeesWithUserInfo,
  addUserBankInfo,
  updateUserBankInfo,
  getUserBankDetails,
} = require("../controllers/employeeController");
const { authenticate } = require("../middleware/authMiddleware");
const {
  handleValidationErrors,
} = require("../middleware/validationMiddleware");
const { bankInfoValidation } = require("../validations/bankInfoValidation");

const router = express.Router();

// Routes

// Get all employees with optional user info
router.get(
  "/all",
  authenticate,
  [
    query("includeUserInfo")
      .optional()
      .isBoolean()
      .withMessage("includeUserInfo must be a boolean")
      .toBoolean(),
  ],
  getAllEmployeesWithUserInfo
);

// Get bank details for a user
router.get(
  "/:userId/get-bank-details",
  authenticate,
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    handleValidationErrors,
  ],
  getUserBankDetails
);

// Create or add bank details for a user
router.post(
  "/:userId/add-bank-details",
  authenticate,
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    bankInfoValidation,
    handleValidationErrors,
  ],
  addUserBankInfo
);

// Update bank details for a user
router.put(
  "/:userId/update-bank-details",
  authenticate,
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    bankInfoValidation,
    handleValidationErrors,
  ],
  updateUserBankInfo
);

module.exports = router;
