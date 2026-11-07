const express = require("express");
const router = express.Router();
const payrollController = require("../controllers/payrollController");
const { authenticate, isAdmin, isPayrollAdmin } = require("../middleware/authMiddleware");

// POST /api/payroll/periods - Admin/HR
router.post(
    "/periods",
    authenticate,
    isPayrollAdmin,
    payrollController.createPayrollPeriod
);

// POST /api/payroll/calculate/:id - Admin/HR
router.post(
    "/calculate/:id",
    authenticate,
    isPayrollAdmin,
    payrollController.calculatePayroll
);

// POST /api/payroll/calculate-bulk/:periodId - Admin/HR
router.post(
    "/calculate-bulk/:periodId",
    authenticate,
    isPayrollAdmin,
    payrollController.bulkCalculatePayroll
);


// Adjustment Routes
router.post("/adjustment", authenticate, isPayrollAdmin, payrollController.addAdjustment);

// Workflow Routes
router.put("/period/:id/review", authenticate, isPayrollAdmin, payrollController.reviewPayrollPeriod);
router.put("/period/:id/approve", authenticate, isPayrollAdmin, payrollController.approvePayrollPeriod);
router.put("/period/:id/pay", authenticate, isPayrollAdmin, payrollController.payPayrollPeriod);

// Retrieval Routes
router.get("/periods", authenticate, isPayrollAdmin, payrollController.getPayrollPeriods);
router.get("/period/:id", authenticate, isPayrollAdmin, payrollController.getPayrollPeriodDetails);
router.delete("/period/:id", authenticate, isAdmin, payrollController.deletePayrollPeriod);
router.get("/history", authenticate, payrollController.getEmployeePayrollHistory);


// Payroll Profile Routes
const payrollProfileController = require("../controllers/payrollProfileController");
const revisions = require('../controllers/compensationRevisions')(require('../models'));
router.get('/profile/:id/revisions', authenticate, isAdmin, (req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();}, revisions.read);
router.post('/profile/:id/revisions/commands', authenticate, isAdmin, revisions.command);
router.get("/profiles", authenticate, isAdmin, payrollProfileController.getAllPayrollProfiles);
router.get("/profiles/missing", authenticate, isAdmin, payrollProfileController.getEmployeesWithoutProfiles);
router.get("/profile/by-id/:id", authenticate, isAdmin, payrollProfileController.getPayrollProfileById);
router.get("/profile/:employeeId", authenticate, isAdmin, payrollProfileController.getPayrollProfile);
router.post("/profile", authenticate, isAdmin, payrollProfileController.createPayrollProfile);
router.put("/profile/:id", authenticate, isAdmin, revisions.protectLegacyUpdate, payrollProfileController.updatePayrollProfile);
router.delete("/profile/:id", authenticate, isAdmin, revisions.retain);

module.exports = router;
