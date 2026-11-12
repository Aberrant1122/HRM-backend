const express = require("express");
const router = express.Router();

const { isAdmin } = require("../middleware/authMiddleware");
const workflow = require('../controllers/leaveWorkflow')(require('../models'));
const policies=require('../controllers/leavePolicies')(require('../models'));
router.use((req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
const balances=require('../controllers/leaveBalanceController')(require('../models'));
router.get('/balances/access',balances.access);router.get('/balances/types',balances.typeCatalog);router.get('/balances/options',balances.options);router.get('/balances/permissions/:userId/:employeeId',isAdmin,balances.grantRead);router.post('/balances/permissions/commands',isAdmin,balances.grantCommand);router.post('/balances/commands',balances.command);router.get('/balances/:employeeId',balances.read);
router.get('/policies',isAdmin,policies.list);router.post('/policies',isAdmin,policies.create);
router.get('/policy-profile/:employeeId',policies.profile);router.post('/policy-profile/:employeeId',isAdmin,policies.assign);
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
const liveTypes=require('../controllers/liveLeaveTypeController')(require('../models'));
router.get('/type-catalog',isAdmin,liveTypes.list);router.get('/type-catalog/:typeId',isAdmin,liveTypes.read);router.post('/type-catalog/commands',isAdmin,liveTypes.command);
router.post("/types", isAdmin, liveTypes.legacyWrite);
router.put("/types/:id", isAdmin, liveTypes.legacyWrite);
router.patch("/types/:id/toggle", isAdmin, liveTypes.legacyWrite);

// --- Employee Actions ---
router.post("/apply", workflow.apply);
router.get("/my-leaves", getMyLeaves);

// --- Admin Actions ---
router.get("/admin/today", isAdmin, getTodaysLeaves);
router.get("/admin/all", isAdmin, getAllLeaves);
router.patch("/admin/:id/approve", isAdmin, workflow.approve);
router.patch("/admin/:id/reject", isAdmin, workflow.reject);

module.exports = router;
