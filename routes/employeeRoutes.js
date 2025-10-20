const express = require("express");
const { param, query } = require("express-validator");
const {
  getAllEmployeesWithUserInfo,
  addUserBankInfo,
  updateUserBankInfo,
  getUserBankDetails,
  getUserById,
  deactivateUser,
  addEmployeeAttachments,
  removeEmployeeAttachment,
} = require("../controllers/employeeController");
const { authenticate, isAdmin } = require("../middleware/authMiddleware");
const {
  handleValidationErrors,
} = require("../middleware/validationMiddleware");
const {
  bankInfoValidation,
  updateBankInfoValidation,
} = require("../validations/bankInfoValidation");
const { uploadEmployeeAttachments } = require("../middleware/upload");

const router = express.Router();

// Routes

// Get a specific user's information (public endpoint)
router.get(
  "/:userId/user-info",
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    handleValidationErrors,
  ],
  getUserById
);

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

// Deactivate a user (admin only)
router.delete(
  "/:userId",
  authenticate,
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    handleValidationErrors,
  ],
  isAdmin, // Only admins can deactivate users
  deactivateUser
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

// Update bank details for a user (partial updates allowed)
router.put(
  "/:userId/update-bank-details",
  authenticate,
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    ...updateBankInfoValidation,
    handleValidationErrors,
  ],
  updateUserBankInfo
);

// Upload attachments for an employee
router.post(
  "/:userId/attachments",
  authenticate,
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    handleValidationErrors,
  ],
  uploadEmployeeAttachments.array("attachments", 10), // Allow up to 10 files
  addEmployeeAttachments
);

// Remove an attachment for an employee
router.delete(
  "/:userId/attachments/:attachmentId",
  authenticate,
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    param("attachmentId")
      .notEmpty()
      .withMessage("Attachment ID is required"),
    handleValidationErrors,
  ],
  removeEmployeeAttachment
);

module.exports = router;
