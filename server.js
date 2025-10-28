require("dotenv").config();
const express = require("express");
const { Sequelize } = require("sequelize");
const path = require("path");
const cors = require("cors");
const db = require("./models");
const app = express();
const PORT = process.env.PORT || 5001;
const routes = require("./routes"); // Import routes from routes/index.js

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000','human-resource-management-production-c64e.up.railway.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use("/api", routes);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Test Database Connection
(async () => {
  try {
    await db.sequelize.authenticate();
    console.log("✅ Connected to MySQL database: hrm");
    app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on port ${PORT}`));
  } catch (error) {
    console.error("❌ Database connection failed:", error);
  }
})();


// Health Check Endpoint
app.get('/', (req, res) => {
  res.status(200).send('Healthy');
});

// Start Express Server

