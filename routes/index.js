const express = require("express");
const authRoutes = require("./authRoutes");
const employeeRoutes = require("./employeeRoutes");
const attendanceRoutes = require("./attendanceRoutes");
const taskRoutes = require("./taskRoutes");
const projectRoutes = require("./projectRoutes");
const notificationRoutes = require("./notificationRoutes");
const clientRoutes = require("./clientRoutes");
const departmentRoutes = require("./departmentRoutes");
const leaveRoutes = require("./leaveRoutes");
const payrollRoutes = require("./payrollRoutes");
const projectCommunicationRoutes = require("./projectCommunicationRoutes");
const dashboardRoutes = require("./dashboardRoutes");

const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();

// Public routes
router.use("/auth", authRoutes);

// Protected routes (require valid JWT)
router.use(authenticate);

router.use("/employee", employeeRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/tasks", taskRoutes);
router.use("/projects", projectRoutes);
router.use("/notifications", notificationRoutes);
router.use("/clients", clientRoutes);
router.use("/departments", departmentRoutes);
router.use("/leaves", leaveRoutes);
router.use("/payroll", payrollRoutes);
router.use("/project-communications", projectCommunicationRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/training", require('./trainingRoutes'));
router.use("/performance", require('./performanceRoutes'));
router.use("/offboarding", require('./offboardingRoutes'));
router.use("/onboarding", require('./onboardingRoutes'));
router.use("/probation", require('./probationRoutes'));
router.use("/organization", require('./organizationRoutes'));

module.exports = router;
