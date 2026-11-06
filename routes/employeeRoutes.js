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
  updateUserProfile,
  uploadProfilePicture,
  deleteProfilePicture,
  changeEmployeePassword,
  updateEmployeeRole,
} = require("../controllers/employeeController");
const { isAdmin } = require("../middleware/authMiddleware");
const {
  handleValidationErrors,
} = require("../middleware/validationMiddleware");
const {
  bankInfoValidation,
  updateBankInfoValidation,
} = require("../validations/bankInfoValidation");
const { uploadEmployeeAttachments, uploadProfilePicture: uploadProfilePictureMiddleware } = require("../middleware/upload");
const profileValidation = require("../validations/profileValidation");

const { requireEmployeeAccess } = require("../middleware/employeeAccess");

const router = express.Router();

router.get('/account-summary', isAdmin, require('../controllers/employeeAccountSummaryController').getEmployeeAccountSummary);

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
  [
    query("includeUserInfo")
      .optional()
      .isBoolean()
      .withMessage("includeUserInfo must be a boolean")
      .toBoolean(),
    query('page').optional().isString().bail().isInt({ min: 1, max: 1000000 }).toInt(),
    query('limit').optional().isString().bail().isInt({ min: 1, max: 1000 }).toInt(),
    query('search').optional().isString().bail().trim().isLength({ max: 100 }),
    query('department').optional().isString().bail().trim().isLength({ min: 1, max: 255 }),
    query('status').optional().isString().bail().isIn(['active', 'inactive', 'suspended']),
    handleValidationErrors,
  ],
  getAllEmployeesWithUserInfo
);

// Get bank details for a user
router.get(
  "/:userId/get-bank-details",
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    handleValidationErrors,
  ],
  requireEmployeeAccess,
  getUserBankDetails
);

// Deactivate a user (admin only)
router.delete(
  "/:userId",
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
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    bankInfoValidation,
    handleValidationErrors,
  ],
  requireEmployeeAccess,
  addUserBankInfo
);

// Update bank details for a user (partial updates allowed)
router.put(
  "/:userId/update-bank-details",
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    ...updateBankInfoValidation,
    handleValidationErrors,
  ],
  requireEmployeeAccess,
  updateUserBankInfo
);

// Upload attachments for an employee
router.post(
  "/:userId/attachments",
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    handleValidationErrors,
  ],
  requireEmployeeAccess,
  uploadEmployeeAttachments.array("attachments", 10), // Allow up to 10 files
  addEmployeeAttachments
);

// Remove an attachment for an employee
router.delete(
  "/:userId/attachments/:attachmentId",
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
  requireEmployeeAccess,
  removeEmployeeAttachment
);

// Download employee attachment
router.get(
  "/:userId/download-attachment/:attachmentId",
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
  require("../controllers/employeeController").downloadEmployeeAttachment
);

// View employee attachment inline
router.get(
  "/:userId/view-attachment/:attachmentId",
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
  require("../controllers/employeeController").viewEmployeeAttachment
);

// Update user profile
router.put(
  "/:userId/profile",
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    ...profileValidation,
    handleValidationErrors,
  ],
  updateUserProfile
);

// Upload profile picture
router.post(
  "/:userId/profile-picture",
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    handleValidationErrors,
  ],
  requireEmployeeAccess,
  uploadProfilePictureMiddleware.single("profilePicture"),
  uploadProfilePicture
);

// Delete profile picture
router.delete(
  "/:userId/profile-picture",
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    handleValidationErrors,
  ],
  deleteProfilePicture
);

// Change employee password (admin only)
router.patch(
  "/:userId/password",
  isAdmin,
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    handleValidationErrors,
  ],
  changeEmployeePassword
);

// Update employee role (admin only)
router.patch(
  "/:userId/role",
  isAdmin,
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer")
      .toInt(),
    handleValidationErrors,
  ],
  updateEmployeeRole
);

module.exports = router;
