const express = require("express");
const authRoutes = require("./authRoutes");
const employeeRoutes = require("./employeeRoutes");
const attendanceRoutes = require("./attendanceRoutes");
const taskRoutes = require("./taskRoutes");
const projectRoutes = require("./projectRoutes");

const router = express.Router();

router.use("/auth", authRoutes); // Routes from authRoutes.js will be prefixed with /auth
router.use("/employee", employeeRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/tasks", taskRoutes);
router.use("/projects", projectRoutes);

module.exports = router;
