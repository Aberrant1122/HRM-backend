const jwt = require("jsonwebtoken");

// Secret key for JWT signing (store it securely in environment variables)
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || "your_secret_key";

// Middleware to authenticate the JWT token
const authenticate = (req, res, next) => {
  // Try to get token from Authorization header first
  const authHeader = req.headers["authorization"];
  let token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  // If no token in header, check query params (for download links)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized - Token expired or missing"
    });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    console.error(`[Auth Error] ${error.message}`);
    return res.status(401).json({
      success: false,
      message: "Unauthorized - Token expired or missing"
    });
  }
};

// Middleware to check if the user has the correct role (optional)
const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Access forbidden: Insufficient privileges" });
    }
    next();
  };
};

// Middleware to check if user is an admin or HR
const isPayrollAdmin = (req, res, next) => {
  const role = req.user?.role?.toLowerCase();
  if (role === "admin" || role === "hr") {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Access denied: Admin or HR privileges required",
  });
};

// Middleware to check if user is an admin
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Access denied: Admin privileges required",
  });
};

module.exports = {
  authenticate,
  authorizeRole,
  isAdmin,
  isPayrollAdmin,
  isManager: (req, res, next) => {
    if (req.user && req.user.role === "manager") {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: "Access denied: Manager privileges required",
    });
  },
  isAdminOrManager: async (req, res, next) => {
    // Check if user is authenticated first
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Get role and normalize to lowercase for comparison
    const userRole = req.user.role?.toLowerCase?.() || req.user.role;

    // Immediate approval for admin or manager role
    if (userRole === "admin" || userRole === "manager") {
      return next();
    }

    // Fallback: allow users assigned as project managers (managerId) even if role is 'employee'
    try {
      const { Project } = require("../models");
      const hasManagerAssignment = await Project.findOne({
        where: { managerId: req.user.id, isActive: true },
        attributes: ["id"],
      });
      if (hasManagerAssignment) {
        return next();
      }
    } catch (e) {
      console.warn("Failed to verify manager assignment:", e?.message || e);
    }

    // Log for debugging
    console.log("Access denied for user:", {
      userId: req.user.id,
      role: req.user.role,
      userRole: userRole,
    });

    return res.status(403).json({
      success: false,
      message: "Access denied: Admin or Manager privileges required",
    });
  },
};
