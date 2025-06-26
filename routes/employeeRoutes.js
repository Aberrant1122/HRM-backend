const express = require("express");
const {
  getAllEmployeesWithUserInfo,
} = require("../controllers/employeeController");
const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();

// Route to get all employees with user info
router.get("/all", authenticate, getAllEmployeesWithUserInfo);

module.exports = router;
