const express = require("express");
const router = express.Router();

const { isAdmin } = require("../middleware/authMiddleware");
const workflow = require('../controllers/leaveWorkflow')(require('../models'));
router.use((req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
router.get('/workflow/mine', workflow.myList);
router.get('/workflow/all', isAdmin, workflow.adminList);
router.get('/workflow/:id', workflow.detail);
const {
    getMyLeaves,
    getTodaysLeaves,
    getAllLeaves,
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
router.post("/apply", workflow.apply);
router.get("/my-leaves", getMyLeaves);

// --- Admin Actions ---
router.get("/admin/today", isAdmin, getTodaysLeaves);
router.get("/admin/all", isAdmin, getAllLeaves);
router.patch("/admin/:id/approve", isAdmin, workflow.approve);
router.patch("/admin/:id/reject", isAdmin, workflow.reject);

module.exports = router;
