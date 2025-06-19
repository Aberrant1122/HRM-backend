require("dotenv").config();
const express = require("express");
const { Sequelize } = require("sequelize");
const cors = require("cors");
const db = require("./models");
const app = express();
const PORT = process.env.PORT || 5001;
const routes = require("./routes"); // Import routes from routes/index.js

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api", routes);

// Test Database Connection
(async () => {
  try {
    await db.sequelize.authenticate();
    console.log("Connected to MySQL database: hrm");
  } catch (error) {
    console.error("Database connection failed:", error);
  }
})();

// Simple Route for Testing
app.get("/", (req, res) => {
  res.send("API is running...");
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
