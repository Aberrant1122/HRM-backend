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
router.use(require('../middleware/hrDomainScope'));
router.use('/employee-documents', require('./employeeDocumentRoutes'));
router.use('/employment-records', require('./employmentRecordRoutes'));

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
router.use("/policies", require('./policyRoutes'));
router.use("/record-reports", require('./recordReportRoutes'));
router.use("/onboarding-record-report", require('./onboardingReportRoutes'));
router.use("/offboarding-record-report", require('./offboardingReportRoutes'));
router.use("/leave-request-report", require('./leaveRequestReportRoutes'));
router.use("/first-recorded-joiners", require('./firstRecordedJoinersRoutes'));
router.use("/recorded-birthdays", require('./recordedBirthdaysRoutes'));
router.use("/department-workforce", require('./departmentWorkforceRoutes'));
router.use("/payroll-record-report", require('./payrollRecordReportRoutes'));
router.use("/approved-leave-calendar", require('./approvedLeaveCalendarRoutes'));
router.use("/population-review", require('./legacyPopulationRoutes'));
router.use("/hr-tasks", require('./hrTaskRoutes'));
router.use("/hr-letters", require('./hrLetterRoutes'));
router.use("/performance", require('./performanceRoutes'));
router.use("/offboarding", require('./offboardingRoutes'));
router.use("/onboarding", require('./onboardingRoutes'));
router.use("/probation", require('./probationRoutes'));
router.use("/organization", require('./organizationRoutes'));
router.use("/designations", require('./designationRoutes'));

module.exports = router;
