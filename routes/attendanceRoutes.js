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
