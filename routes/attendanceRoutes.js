const express = require("express");
const router = express.Router();
const { clockIn, clockOut } = require("../controllers/attendanceController");
const verifyToken = require("../middleware/verifyToken"); // Add this middleware to authenticate

router.post("/clock-in", verifyToken, clockIn);
router.post("/clock-out", verifyToken, clockOut);

module.exports = router;
