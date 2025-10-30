require("dotenv").config();
const express = require("express");
const { Sequelize } = require("sequelize");
const path = require("path");
// const cors = require("cors");
const db = require("./models");
const app = express();
const PORT = process.env.PORT || 5001;
const routes = require("./routes"); // Import routes from routes/index.js

// Middleware
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://human-resource-management-production-eeeb.up.railway.app"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
  }
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());
app.use("/api", routes);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Test Database Connection


// Health Check Endpoint
app.get('/', (req, res) => {
  res.status(200).send('Healthy');
});

// Start Express Server

(async () => {
  try {
    await db.sequelize.authenticate();
    console.log("✅ Connected to MySQL database: hrm");
    app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on port ${PORT}`));
  } catch (error) {
    console.error("❌ Database connection failed:", error);
  }
})();