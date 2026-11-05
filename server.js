const dotenv = require("dotenv");
dotenv.config();
require("express-async-errors");
const express = require("express");
const { Sequelize } = require("sequelize");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");
const cors = require("cors");
const logger = require("./logger");
const cacheMiddleware = require("./middleware/cacheMiddleware");
const db = require("./models");
const app = express();
const PORT = process.env.PORT || 5001;
const routes = require("./routes"); // Import routes from routes/index.js
const http = require('http');
const socketIo = require('socket.io');

// Create HTTP server
const server = http.createServer(app);

// Request Logging Middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      process.env.FRONTEND_URL
    ].filter(Boolean),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  }
});

// Middleware
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  process.env.FRONTEND_URL,
  "https://human-resource-management-production-eeeb.up.railway.app",
  "https://human-resource-management-production-b7d0.up.railway.app"
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`Blocked by CORS: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  allowedHeaders: "Content-Type, Authorization, X-Requested-With"
}));

// Use Helmet for security headers, but allow images from same origin
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression()); // Gzip compression
app.use(express.json());

// Cache Control Headers for Static Assets
app.use('/uploads', require('./middleware/legacyUploads'), (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
  next();
}, express.static(path.join(__dirname, 'uploads')));

// API Routes
// Apply caching to specific GET routes if needed (e.g. dashboard summary)
// Note: Authentication middleware usually precedes this, so caching should be user-specific or carefully managed.
// For now, we apply general caching strategy in specific routes manually if improved performance is needed.

app.use("/api", routes);

// Centralized Error Handling Middleware
const errorHandler = require("./middleware/errorMiddleware");
app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack });
  errorHandler(err, req, res, next);
});

// Make io available to routes
app.set('io', io);

// Socket.IO connection handling
require('./utils/realtimeAccess').configureRealtimeAccess(io);

// Test Database Connection


// Health Check Endpoint
app.get('/', (req, res) => {
  res.status(200).send('Healthy');
});

// Start Express Server

const { ensureSchema } = require('./utils/schemaFix');
const CronJobs = require('./utils/cronJobs');
const runtimeSafety = require('./config/runtimeSafety');

(async () => {
  try {
    await db.sequelize.authenticate();
    logger.info("✅ Connected to MySQL database: hrm");

    // Run schema fix before starting server to ensure DB is ready
    if (runtimeSafety.startupSchemaRepairEnabled) await ensureSchema();

    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`✅ Server running on port ${PORT}`);

      // Initialize cron jobs after server starts
      if (runtimeSafety.backgroundJobsEnabled) CronJobs.init(io);
    });
  } catch (error) {
    logger.error("❌ Database connection failed:", error);
    process.exit(1);
  }
})();

// Graceful error handling for the entire process
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection:", { reason, promise });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});
