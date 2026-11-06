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
const { uploadTaskDeliverables } = require("../middleware/upload");

// For employees
router.get("/today", getTodaysAttendance);
router.get("/weekly", getWeeklyAttendance);
router.get("/history", getUserAttendanceHistory);
router.post("/clock-in", clockIn);
router.post("/clock-out", uploadTaskDeliverables.array("deliverables", 10), clockOut);
router.get("/active-tasks", getActiveTasksForCheckout);

// For manager/admin
router.get("/daily-work-records", isAdminOrManager, getDailyWorkRecords);

// For admin
router.get("/today-all-employees", isAdmin, getAllUsersTodaysAttendance);
router.get("/all", isAdmin, getAllAttendance);

module.exports = router;
