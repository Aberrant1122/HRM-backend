const express = require("express");
const {
  inviteEmployee,
  login,
  setPassword,
  requestPasswordReset,
  validateInviteEmployee,
  validateLogin,
  validateSetPassword,
  isAuthenticated,
  isAdmin,
  isEmployee,
} = require("../controllers/authController");

const router = express.Router();

// Public routes
router.post("/login", validateLogin, login);
router.post("/request-password-reset", requestPasswordReset);
router.post("/set-password", validateSetPassword, setPassword);

// Protected routes
router.use(isAuthenticated);

// Employee routes
router.use(isEmployee);
// Add employee-specific routes here

// Admin routes
router.use(isAdmin);
router.post("/invite-employee", validateInviteEmployee, inviteEmployee);

module.exports = router;
