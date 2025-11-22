const jwt = require("jsonwebtoken");

// Secret key for JWT signing (store it securely in environment variables)
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || "your_secret_key";

// Middleware to authenticate the JWT token
const authenticate = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    console.error(error);
    return res.status(401).json({ message: "Invalid or expired token" });
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
  isManager: (req, res, next) => {
    if (req.user && req.user.role === "manager") {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: "Access denied: Manager privileges required",
    });
  },
  isAdminOrManager: (req, res, next) => {
    if (req.user && (req.user.role === "admin" || req.user.role === "manager")) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: "Access denied: Admin or Manager privileges required",
    });
  },
};
