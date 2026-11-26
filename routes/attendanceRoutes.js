const express = require("express");
const router = express.Router();
const {
  clockIn,
  clockOut,
  getAllAttendance,
  getAllUsersTodaysAttendance,
  getTodaysAttendance,
  getWeeklyAttendance,
  getUserAttendanceHistory,
  getActiveTasksForCheckout,
  getDailyWorkRecords,
} = require("../controllers/attendanceController");

const { isAdmin, isAdminOrManager } = require("../middleware/authMiddleware");
const attendanceMultipart = require("../middleware/attendanceMultipart");
const recovery = require("../services/attendanceRecovery")(require("../models"));
const facts = require("../controllers/attendanceFacts")(require("../models"));
const coverage=require("../controllers/attendanceCoverage")(require("../models"));
const schedules=require('../controllers/workScheduleDefinitions')(require('../models'));
router.get('/schedule-definitions',isAdmin,schedules.list);router.get('/schedule-definitions/:id',isAdmin,schedules.read);router.post('/schedule-definitions/commands',isAdmin,schedules.command);
const assignments=require('../controllers/workScheduleAssignments')(require('../models'));
const calculations=require('../controllers/attendanceCalculationRuns')(require('../models')),calculationPayroll=require('../controllers/attendanceCalculationPayroll')(require('../models'),calculations),clockAlerts=require('../controllers/attendanceClockAlerts')(require('../models'));
router.post('/calculation-runs/preview',isAdmin,calculations.preview);router.post('/calculation-runs/commands',isAdmin,calculations.command);router.get('/calculation-runs/employee/:employeeId',isAdmin,calculations.list);router.get('/calculation-runs/:id',isAdmin,calculations.read);router.get('/calculation-runs/:id/payroll-options',isAdmin,calculationPayroll.options);router.get('/calculation-runs/:id/payroll-posts',isAdmin,calculationPayroll.history);router.post('/calculation-runs/:id/payroll-posts',isAdmin,calculationPayroll.post);router.get('/clock-alerts/mine',clockAlerts.mine);router.post('/clock-alerts/:id/read',clockAlerts.read);
router.get('/schedule-monthly/:employeeId',isAdmin,assignments.monthly);
router.get('/schedule-assignments/employee/:employeeId',isAdmin,assignments.list);router.get('/schedule-assignments/employee/:employeeId/preview',isAdmin,assignments.preview);router.get('/schedule-assignments/:id',isAdmin,assignments.read);router.post('/schedule-assignments/commands',isAdmin,assignments.command);
router.get('/coverage/options',isAdmin,coverage.options);router.get('/coverage/records',isAdmin,coverage.records);router.get('/coverage',isAdmin,coverage.coverage);
const corrections = require('../controllers/attendanceCorrections')(require('../models'));
const correctionPermissions=require('../controllers/attendanceCorrectionPermissions')(require('../models'));
router.get('/correction-access',correctionPermissions.access);
router.get('/correction-permissions',isAdmin,correctionPermissions.accounts);
router.get('/correction-permissions/:id/history',isAdmin,correctionPermissions.history);
router.post('/correction-permissions/commands',isAdmin,correctionPermissions.command);
router.get('/corrections', correctionPermissions.read, corrections.list);
router.get('/corrections/source',correctionPermissions.read,corrections.source);
router.get('/corrections/:id', correctionPermissions.read, corrections.detail);
router.post('/corrections/commands', correctionPermissions.read, corrections.command);

// For employees
router.get("/today", facts.today);
router.get("/weekly", facts.weekly);
router.get("/history", facts.history);
router.post("/clock-in", recovery.clockIn);
router.post("/clock-out", attendanceMultipart, recovery.clockOut);
router.get("/active-tasks", getActiveTasksForCheckout);
router.get('/deliverables/:id', recovery.download);

// For manager/admin
router.get("/daily-work-records", isAdminOrManager, getDailyWorkRecords);

// For admin
router.get("/today-all-employees", isAdmin, facts.directory);
router.get("/all", isAdmin, facts.all);
router.get('/export', isAdmin, facts.monthlyExport);

module.exports = router;
