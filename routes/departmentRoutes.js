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
const verifyToken = require("../middleware/verifyToken");
const { isAdmin, isAdminOrManager } = require("../middleware/authMiddleware");

// Public routes (for all authenticated users)
router.get("/", verifyToken, getAllDepartments);

// Admin/Manager routes
router.post("/", verifyToken, isAdminOrManager, createDepartment);
router.put("/:id", verifyToken, isAdminOrManager, updateDepartment);
router.delete("/:id", verifyToken, isAdminOrManager, deleteDepartment);
router.post("/:id/restore", verifyToken, isAdminOrManager, restoreDepartment);

// Admin only routes
router.get("/all", verifyToken, isAdmin, getAllDepartmentsAdmin);

module.exports = router;