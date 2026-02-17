const express = require("express");
const router = express.Router();

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
router.get("/types", getAllLeaveTypes);
router.post("/types", isAdmin, createLeaveType);
router.put("/types/:id", isAdmin, updateLeaveType);
router.patch("/types/:id/toggle", isAdmin, toggleLeaveTypeStatus);

// --- Employee Actions ---
router.post("/apply", applyLeave);
router.get("/my-leaves", getMyLeaves);

// --- Admin Actions ---
router.get("/admin/today", isAdmin, getTodaysLeaves);
router.get("/admin/all", isAdmin, getAllLeaves);
router.patch("/admin/:id/approve", isAdmin, approveLeave);
router.patch("/admin/:id/reject", isAdmin, rejectLeave);

module.exports = router;
