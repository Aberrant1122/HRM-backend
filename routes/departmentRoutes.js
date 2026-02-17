const express = require("express");
const router = express.Router();
const {
  getAllDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  restoreDepartment,
  getAllDepartmentsAdmin,
} = require("../controllers/departmentController");

const { isAdmin, isAdminOrManager } = require("../middleware/authMiddleware");

// Public routes (for all authenticated users)
router.get("/", getAllDepartments);

// Admin/Manager routes
router.post("/", isAdminOrManager, createDepartment);
router.put("/:id", isAdminOrManager, updateDepartment);
router.delete("/:id", isAdminOrManager, deleteDepartment);
router.post("/:id/restore", isAdminOrManager, restoreDepartment);

// Admin only routes
router.get("/all", isAdmin, getAllDepartmentsAdmin);

module.exports = router;