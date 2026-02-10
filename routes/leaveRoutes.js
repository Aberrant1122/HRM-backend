const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { isAdmin } = require("../middleware/authMiddleware");
const {
    applyLeave,
    getMyLeaves,
    getTodaysLeaves,
    getAllLeaves,
    approveLeave,
    rejectLeave,
} = require("../controllers/leaveController");
const {
    getAllLeaveTypes,
    createLeaveType,
    updateLeaveType,
    toggleLeaveTypeStatus,
} = require("../controllers/leaveTypeController");

// --- Leave Types (Admin Config) ---
router.get("/types", verifyToken, getAllLeaveTypes);
router.post("/types", verifyToken, isAdmin, createLeaveType);
router.put("/types/:id", verifyToken, isAdmin, updateLeaveType);
router.patch("/types/:id/toggle", verifyToken, isAdmin, toggleLeaveTypeStatus);

// --- Employee Actions ---
router.post("/apply", verifyToken, applyLeave);
router.get("/my-leaves", verifyToken, getMyLeaves);

// --- Admin Actions ---
router.get("/admin/today", verifyToken, isAdmin, getTodaysLeaves);
router.get("/admin/all", verifyToken, isAdmin, getAllLeaves);
router.patch("/admin/:id/approve", verifyToken, isAdmin, approveLeave);
router.patch("/admin/:id/reject", verifyToken, isAdmin, rejectLeave);

module.exports = router;
