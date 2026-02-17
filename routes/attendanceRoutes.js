const express = require("express");
const router = express.Router();
const {
  clockIn,
  clockOut,
  getAllAttendance,
  getAllUsersTodaysAttendance,
  getTodaysAttendance,
  getWeeklyAttendance,
  getActiveTasksForCheckout,
  getDailyWorkRecords,
} = require("../controllers/attendanceController");

const { isAdminOrManager } = require("../middleware/authMiddleware");
const { uploadTaskDeliverables } = require("../middleware/upload");

// For employees
router.get("/today", getTodaysAttendance);
router.get("/weekly", getWeeklyAttendance);
router.post("/clock-in", clockIn);
router.post("/clock-out", uploadTaskDeliverables.array("deliverables", 10), clockOut);
router.get("/active-tasks", getActiveTasksForCheckout);

// For manager/admin
router.get("/daily-work-records", isAdminOrManager, getDailyWorkRecords);

// For admin
router.get("/today-all-employees", getAllUsersTodaysAttendance);
router.get("/all", getAllAttendance);

module.exports = router;
