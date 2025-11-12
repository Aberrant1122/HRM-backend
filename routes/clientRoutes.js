const express = require("express");
const {
  addClient,
  getAllClients,
  getClientById,
  updateClient,
  deleteClient,
  validateAddClient,
} = require("../controllers/clientController");
const { isAuthenticated, isAdmin } = require("../controllers/authController");

const router = express.Router();

// All routes require authentication and admin role
router.use(isAuthenticated);
router.use(isAdmin);

// Client routes
router.post("/", validateAddClient, addClient);
router.get("/", getAllClients);
router.get("/:id", getClientById);
router.put("/:id", updateClient);
router.delete("/:id", deleteClient);

module.exports = router;
