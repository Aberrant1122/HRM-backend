const express = require("express");
const {
  getAllEmployeesWithUserInfo,
} = require("../controllers/employeeController");
const { authenticate } = require("../middleware/authMiddleware");
const { query } = require("express-validator");

const router = express.Router();

// router.get(
//   "/",
//   authenticate,
//   [
//     query('includeUserInfo')
//       .optional()
//       .isBoolean()
//       .withMessage('includeUserInfo must be a boolean')
//       .toBoolean(),
//   ],
//   getAllEmployeesWithUserInfo
// );

// Legacy route - kept for backward compatibility
router.get("/all", authenticate, getAllEmployeesWithUserInfo);

module.exports = router;
