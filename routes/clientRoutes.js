const express = require("express");
const {
  addClient,
  getAllClients,
  getClientById,
  updateClient,
  deleteClient,
  changeClientPassword,
  validateAddClient,
} = require("../controllers/clientController");
const { isAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

// All routes require authentication (handled globally) and admin role
router.use(isAdmin);

// Client routes
router.post("/", validateAddClient, addClient);
router.get("/", getAllClients);
router.get("/:id", getClientById);
router.put("/:id", updateClient);
router.delete("/:id", deleteClient);
router.patch("/:id/password", changeClientPassword);

module.exports = router;
