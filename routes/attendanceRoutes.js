const express = require("express");
const router = express.Router();
const {
  clockIn,
  clockOut,
  getAllAttendance,
  getAllUsersTodaysAttendance,
  getTodaysAttendance,
  getWeeklyAttendance,
} = require("../controllers/attendanceController");
const verifyToken = require("../middleware/verifyToken");

// For employees
router.get("/today", verifyToken, getTodaysAttendance);
router.get("/weekly", verifyToken, getWeeklyAttendance);
router.post("/clock-in", verifyToken, clockIn);
router.post("/clock-out", verifyToken, clockOut);

// For admin
router.get("/today-all-employees", verifyToken, getAllUsersTodaysAttendance);
router.get("/all", verifyToken, getAllAttendance);

module.exports = router;
