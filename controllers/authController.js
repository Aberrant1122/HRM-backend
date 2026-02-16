const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Sequelize } = require("sequelize");
const { User, UserInfo } = require("../models");
const { body, validationResult } = require("express-validator");
const nodemailer = require("nodemailer");

// Load environment variables
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || "your_secret_key";
const EMAIL_SERVICE = process.env.EMAIL_SERVICE || "gmail";
const EMAIL_USER = process.env.EMAIL_USER || "";
const EMAIL_PASS = process.env.EMAIL_PASS || "";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

const getAppUrl = (req) => {
  const envUrl =
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    process.env.WEB_APP_URL ||
    APP_URL;
  if (envUrl) return String(envUrl).replace(/\/+$/, "");
  const origin = req.headers.origin;
  if (origin) return String(origin).replace(/\/+$/, "");
  const proto =
    req.headers["x-forwarded-proto"] ||
    (req.socket && req.socket.encrypted ? "https" : "http");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
};

// Email transporter
const transporter = nodemailer.createTransport({
  service: EMAIL_SERVICE,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// Middleware for validation rules
const validateInviteEmployee = [
  body("fullName").notEmpty().withMessage("Full name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("role").isIn(["employee", "manager", "client"]).withMessage("Invalid role"),
];

const validateLogin = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

const validateSetPassword = [
  body("token").notEmpty().withMessage("Token is required"),
  body("newPassword")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  body("confirmPassword")
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("Passwords do not match");
      }
      return true;
    })
    .withMessage("Passwords do not match"),
];

const validateRegister = [
  body("fullName").trim().notEmpty().withMessage("Full name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  body("role")
    .optional()
    .isIn(["admin", "employee", "client", "manager"])
    .withMessage("Invalid role"),
];

// Controller for inviting a new employee (Admin only)
const inviteEmployee = async (req, res) => {
  // Check if user is admin
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Only admins can invite employees" });
  }

  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { fullName, email, role, password, cnic, contactNumber } = req.body;

  // Start a transaction
  const transaction = await User.sequelize.transaction();

  try {
    // Check if user already exists
    const existingUser = await User.findOne({
      where: { email },
      transaction,
    });

    if (existingUser) {
      await transaction.rollback();
      return res
        .status(400)
        .json({ message: "User with this email already exists" });
    }

    // Generate a random password reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Create new user
    const tempPassword = crypto.randomBytes(8).toString("hex");
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const newUser = await User.create(
      {
        fullName,
        email,
        password: hashedPassword,
        role,
        resetToken,
        resetTokenExpiry,
        status: "inactive",
      },
      { transaction }
    );

    // Create UserInfo for the new user
    await UserInfo.create(
      {
        userId: newUser.id,
        cnic: cnic || null,
        contactNumber: contactNumber,
        address: req.body.address || null,
        department: req.body.department || "development",
        probationEndDate: req.body.probationEndDate
          ? new Date(req.body.probationEndDate)
          : null,
        employmentStatus: req.body.employmentStatus || "permanent",
        salary: req.body.salary || 0,
        position: req.body.position || req.body.designation || "Developer",
        team: req.body.team || null,
        reportingManager: req.body.reportingManager || null,
        dob: req.body.dob ? new Date(req.body.dob) : null,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
      },
      { transaction }
    );

    // If we got here, commit the transaction
    await transaction.commit();

    // Send invitation email (outside of transaction)
    try {
      const baseUrl = getAppUrl(req);
      const resetUrl = `${baseUrl}/set-password?token=${resetToken}`;
      await transporter.sendMail({
        to: email,
        subject: "You have been invited to join our HRM system",
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <p>Hello <strong>${fullName}</strong>,</p>
            <p>You have been invited to join our HRM system as a <strong>${role}</strong>.</p>
            <p>Please click the following link to set your password and activate your account:</p>
            <p style="margin: 20px 0;">
              <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; rounded: 5px; font-weight: bold;">Set Password</a>
            </p>
            <p style="font-size: 0.9em; color: #666;">This link will expire in 24 hours.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p>After setting your password, <strong>${fullName}</strong> can login anytime through this link: <br />
            <a href="https://human-resource-management-production-b7d0.up.railway.app/">https://human-resource-management-production-b7d0.up.railway.app/</a></p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send email:", emailError);
      // Don't fail the request if email fails
    }

    return res.status(201).json({
      message: "Invitation sent successfully",
      userId: newUser.id,
      resetToken, // Only for testing, remove in production
    });
  } catch (error) {
    // Rollback the transaction in case of error
    if (transaction && transaction.finished !== "commit") {
      await transaction.rollback();
    }

    console.error("Error in inviteEmployee:", error);

    // Handle validation errors
    if (
      error.name === "SequelizeValidationError" ||
      error.name === "SequelizeUniqueConstraintError"
    ) {
      const errors = error.errors.map((err) => ({
        field: err.path,
        message: err.message,
        type: err.type,
        value: err.value,
      }));

      return res.status(400).json({
        message: "Validation Error",
        errors: errors,
      });
    }

    // For other types of errors
    return res.status(500).json({
      message: "Internal Server Error",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
      ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
    });
  }
};

// Controller for user login
const login = async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    // Find user by email with password included
    const user = await User.scope("withSensitiveData").findOne({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if password is set
    if (!user.password) {
      return res.status(401).json({
        message: "No password set. Please use the password reset function.",
      });
    }

    // Check if password is correct
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if account is active
    if (user.status !== "active") {
      return res.status(403).json({
        message: "Account is not active. Please contact an administrator.",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        email: user.email,
      },
      JWT_SECRET_KEY,
      { expiresIn: "8h" }
    );

    // Update last login time
    user.lastLogin = new Date();
    await user.save();

    // Send token and user info (without sensitive data)
    const userData = user.get({ plain: true });
    delete userData.password;
    delete userData.resetToken;
    delete userData.resetTokenExpiry;

    res.json({
      token,
      user: userData,
      expiresIn: 28800, // 8 hours in seconds
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
};

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res
        .status(401)
        .json({ message: "No token, authorization denied" });
    }

    const decoded = jwt.verify(token, JWT_SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ message: "Token is not valid" });
  }
};

// Middleware to check if user has admin role
const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Access denied. Admin privileges required." });
  }
  next();
};

// Register a new user
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { fullName, email, password, role = "employee" } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Create new user
    const user = await User.create({
      fullName,
      email,
      password,
      role,
      status: "active",
      emailVerified: true,
    });

    // Remove sensitive data before sending response
    const userJson = user.toJSON();
    delete userJson.password;
    delete userJson.resetToken;
    delete userJson.resetTokenExpiry;

    res.status(201).json({
      message: "User registered successfully",
      user: userJson,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res
      .status(500)
      .json({ message: "Error registering user", error: error.message });
  }
};

const isEmployee = (req, res, next) => {
  if (req.user.role !== "employee") {
    return res
      .status(403)
      .json({ message: "Access denied. Employee privileges required." });
  }
  next();
};

const isClient = (req, res, next) => {
  if (req.user.role !== "client") {
    return res
      .status(403)
      .json({ message: "Access denied. Client privileges required." });
  }
  next();
};

// Controller for setting a new password
const setPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, newPassword } = req.body;

    // Find user by reset token and check if it's not expired
    const user = await User.findOne({
      where: {
        resetToken: token,
        resetTokenExpiry: { [Sequelize.Op.gt]: Date.now() },
      },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    if (user.status === "inactive") {
      user.status = "active";
    }

    // Hash the new password before saving
    // const salt = await bcrypt.genSalt(10);
    user.password = newPassword;
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error setting password:", error);
    return res.status(500).json({ message: "Error setting password" });
  }
};

// Controller for requesting a password reset
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Don't reveal that the email doesn't exist for security
      return res.status(200).json({
        message:
          "If your email is registered, you will receive a password reset link",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour from now

    // Save token to user
    user.resetToken = resetToken;
    user.resetTokenExpiry = new Date(resetTokenExpiry);
    await user.save();

    // Send email with reset link
    const baseUrl = getAppUrl(req);
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    await transporter.sendMail({
      from: `"HRM System" <${EMAIL_USER}>`,
      to: user.email,
      subject: "Password Reset Request",
      html: `
        <p>You requested a password reset. Click the link below to set a new password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });

    res.status(200).json({ message: "Password reset link sent to your email" });
  } catch (error) {
    console.error("Error requesting password reset:", error);
    res.status(500).json({ message: "Error processing your request" });
  }
};

// Controller for validating invite token and returning user data
const validateInviteToken = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    // Find user by reset token and check if it's not expired
    const user = await User.findOne({
      where: {
        resetToken: token,
        resetTokenExpiry: { [Sequelize.Op.gt]: Date.now() },
      },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    // Return user data needed for the set password form
    return res.status(200).json({
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      companyName: process.env.COMPANY_NAME || "HRM System", // You can add this to your .env or get from a company settings table
    });
  } catch (error) {
    console.error("Error validating invite token:", error);
    return res.status(500).json({ message: "Error validating token" });
  }
};

module.exports = {
  inviteEmployee,
  login,
  setPassword,
  requestPasswordReset,
  validateInviteToken,
  validateInviteEmployee,
  validateRegister,
  register,
  validateLogin,
  validateSetPassword,
  isAuthenticated,
  isAdmin,
  isEmployee,
  isClient,
  // For testing only
  _test: {
    transporter,
  },
};
