const express = require("express");
const {
  inviteEmployee,
  login,
  register,
  setPassword,
  requestPasswordReset,
  validateInviteToken,
  validateInviteEmployee,
  validateLogin,
  validateRegister,
  validateSetPassword,
  isAuthenticated,
  isAdmin,
  isEmployee,
  checkIsProjectManager,
} = require("../controllers/authController");

const router = express.Router();

// Public routes
// Account creation with caller-selected roles requires an existing administrator.
router.post("/register", isAuthenticated, isAdmin, validateRegister, register);
router.post("/login", validateLogin, login);
router.post("/request-password-reset", requestPasswordReset);
router.post("/set-password", validateSetPassword, setPassword);
router.get("/validate-invite", validateInviteToken);

// Protected routes
router.use(isAuthenticated);

// Check if user is a project manager (available to all authenticated users)
router.get("/check-project-manager", checkIsProjectManager);

// Employee routes
// router.use(isEmployee);
// Add employee-specific routes here

// Admin routes
router.use(isAdmin);
router.post("/invite-employee", validateInviteEmployee, inviteEmployee);

module.exports = router;
