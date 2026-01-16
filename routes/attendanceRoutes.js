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
const verifyToken = require("../middleware/verifyToken");
const { isAdminOrManager } = require("../middleware/authMiddleware");
const { uploadTaskDeliverables } = require("../middleware/upload");

// For employees
router.get("/today", verifyToken, getTodaysAttendance);
router.get("/weekly", verifyToken, getWeeklyAttendance);
router.post("/clock-in", verifyToken, clockIn);
router.post("/clock-out", verifyToken, uploadTaskDeliverables.array("deliverables", 10), clockOut);
router.get("/active-tasks", verifyToken, getActiveTasksForCheckout);

// For manager/admin
router.get("/daily-work-records", verifyToken, isAdminOrManager, getDailyWorkRecords);

// For admin
router.get("/today-all-employees", verifyToken, getAllUsersTodaysAttendance);
router.get("/all", verifyToken, getAllAttendance);

module.exports = router;
