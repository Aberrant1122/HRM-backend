const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Op } = require("sequelize");
const { User, UserInfo } = require("../models");
const { body, validationResult } = require("express-validator");
const nodemailer = require("nodemailer");

// Load environment variables
const EMAIL_SERVICE = process.env.EMAIL_SERVICE || "gmail";
const EMAIL_USER = process.env.EMAIL_USER || "";
const EMAIL_PASS = process.env.EMAIL_PASS || "";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

// Email transporter
const transporter = nodemailer.createTransport({
  service: EMAIL_SERVICE,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// Validation rules for adding a client
const validateAddClient = [
  body("fullName").notEmpty().withMessage("Full name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  body("contactNumber")
    .trim()
    .notEmpty()
    .matches(/^[0-9+\-()\s]{7,20}$/)
    .withMessage("Contact number must be 7–20 digits"),
  body("companyName").optional().trim(),
  body("address").optional().trim(),
];

// Controller for adding a new client (Admin only)
const addClient = async (req, res) => {
  // Check if user is admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Only admins can add clients" });
  }

  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation Error", errors: errors.array() });
  }

  const {
    fullName,
    email,
    password,
    contactNumber,
    companyName,
    address,
  } = req.body;

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

    // Create new client user
    const newClient = await User.create(
      {
        fullName,
        email,
        password, // Will be hashed by the model hook
        role: "client",
        status: "active",
      },
      { transaction }
    );

    // Create UserInfo for the new client
    await UserInfo.create(
      {
        userId: newClient.id,
        contactNumber,
        address: address || null,
        companyName: companyName || null,
        startDate: new Date(),
        salary: 0,

        // Leave department undefined so DB default applies
        employmentStatus: "permanent",
        position: "Client",
      },
      { transaction }
    );

    // Commit the transaction
    await transaction.commit();

    // Send welcome email (outside of transaction)
    try {
      const loginUrl = `${APP_URL}/login`;
      const productionLoginUrl = "https://human-resource-management-production-b7d0.up.railway.app/";
      await transporter.sendMail({
        to: email,
        subject: "Welcome to HRM System - Client Account Created",
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <p>Hello <strong>${fullName}</strong>,</p>
            <p>Your client account has been created successfully at HRM System.</p>
            <p><strong>Login Credentials:</strong></p>
            <ul>
              <li><strong>Email:</strong> ${email}</li>
              <li><strong>Password:</strong> ${password}</li>
            </ul>
            <p><strong>${fullName}</strong> can login through this link: <br />
            <a href="${productionLoginUrl}" style="color: #2563eb; font-weight: bold;">${productionLoginUrl}</a></p>
            <p style="font-size: 0.9em; color: #666; margin-top: 20px;">For security reasons, we recommend changing your password after your first login.</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send email:", emailError);
      // Don't fail the request if email fails
    }

    // Return client data without password
    const clientData = newClient.get({ plain: true });
    delete clientData.password;

    return res.status(201).json({
      message: "Client added successfully",
      client: clientData,
    });
  } catch (error) {
    // Rollback the transaction in case of error
    if (transaction && transaction.finished !== "commit") {
      await transaction.rollback();
    }

    console.error("Error in addClient:", error);

    // Handle validation errors
    if (
      error.name === "SequelizeValidationError" ||
      error.name === "SequelizeUniqueConstraintError"
    ) {
      const errors = error.errors.map((err) => ({
        field: err.path,
        message: err.message,
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
    });
  }
};

// Controller for getting all clients (Admin only)
const getAllClients = async (req, res) => {
  // Check if user is admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Only admins can view clients" });
  }

  try {
    const clients = await User.findAll({
      where: { role: "client" },
      include: [
        {
          model: UserInfo,
          as: "userInfo",
          attributes: [
            "contactNumber",
            "address",
            "companyName",
            "position",
          ],
        },
      ],
      attributes: [
        "id",
        "fullName",
        "email",
        "status",
        "createdAt",
        "lastLogin",
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      message: "Clients retrieved successfully",
      clients,
      total: clients.length,
    });
  } catch (error) {
    console.error("Error in getAllClients:", error);
    return res.status(500).json({
      message: "Error retrieving clients",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

// Controller for getting a single client by ID (Admin only)
const getClientById = async (req, res) => {
  // Check if user is admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Only admins can view clients" });
  }

  const { id } = req.params;

  try {
    const client = await User.findOne({
      where: { id, role: "client" },
      include: [
        {
          model: UserInfo,
          as: "userInfo",
        },
      ],
      attributes: { exclude: ["password", "resetToken", "resetTokenExpiry"] },
    });

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    return res.status(200).json({
      message: "Client retrieved successfully",
      client,
    });
  } catch (error) {
    console.error("Error in getClientById:", error);
    return res.status(500).json({
      message: "Error retrieving client",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

// Controller for updating a client (Admin only)
const updateClient = async (req, res) => {
  // Check if user is admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Only admins can update clients" });
  }

  const { id } = req.params;
  const {
    fullName,
    email,
    status,
    contactNumber,
    companyName,
    address,
  } = req.body;

  const transaction = await User.sequelize.transaction();

  try {
    const client = await User.findOne({
      where: { id, role: "client" },
      transaction,
    });

    if (!client) {
      await transaction.rollback();
      return res.status(404).json({ message: "Client not found" });
    }

    // Check if email is being changed and if it already exists
    if (email && email !== client.email) {
      const existingUser = await User.findOne({
        where: {
          email: email,
          id: { [Op.ne]: id } // Exclude current client
        },
        transaction,
      });

      if (existingUser) {
        await transaction.rollback();
        return res.status(400).json({
          message: "Email address is already in use by another user"
        });
      }
    }

    // Update user data
    if (fullName) client.fullName = fullName;
    if (email) client.email = email;
    if (status) client.status = status;

    await client.save({ transaction });

    // Update user info
    const userInfo = await UserInfo.findOne({
      where: { userId: id },
      transaction,
    });

    if (userInfo) {
      if (contactNumber !== undefined) userInfo.contactNumber = contactNumber;
      if (companyName !== undefined) userInfo.companyName = companyName;
      if (address !== undefined) userInfo.address = address;

      await userInfo.save({ transaction });
    }

    await transaction.commit();

    return res.status(200).json({
      message: "Client updated successfully",
      client,
    });
  } catch (error) {
    if (transaction && transaction.finished !== "commit") {
      await transaction.rollback();
    }

    console.error("Error in updateClient:", error);

    // Handle specific Sequelize errors
    if (error.name === "SequelizeUniqueConstraintError") {
      const field = error.errors[0]?.path || "field";
      const fieldName = field === "email" ? "Email address" : field;
      return res.status(400).json({
        message: `${fieldName} is already in use by another user`,
      });
    }

    if (error.name === "SequelizeValidationError") {
      const errors = error.errors.map((err) => ({
        field: err.path,
        message: err.message,
      }));
      return res.status(400).json({
        message: "Validation error",
        errors,
      });
    }

    return res.status(500).json({
      message: "Error updating client",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

// Controller for changing client password (Admin only)
const changeClientPassword = async (req, res) => {
  // Check if user is admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Only admins can change client passwords" });
  }

  const { id } = req.params;
  const { newPassword } = req.body;

  // Validate password
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      message: "Password must be at least 6 characters long"
    });
  }

  try {
    const client = await User.findOne({
      where: { id, role: "client" },
    });

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    // Update password (will be hashed by the model hook)
    client.password = newPassword;
    client.passwordChangedAt = new Date();
    await client.save();

    return res.status(200).json({
      message: "Client password updated successfully",
    });
  } catch (error) {
    console.error("Error in changeClientPassword:", error);
    return res.status(500).json({
      message: "Error changing client password",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

// Controller for deleting a client (Admin only)
const deleteClient = async (req, res) => {
  // Check if user is admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Only admins can delete clients" });
  }

  const { id } = req.params;

  try {
    const client = await User.findOne({
      where: { id, role: "client" },
    });

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    await client.destroy();

    return res.status(200).json({
      message: "Client deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteClient:", error);
    return res.status(500).json({
      message: "Error deleting client",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

module.exports = {
  addClient,
  getAllClients,
  getClientById,
  updateClient,
  deleteClient,
  changeClientPassword,
  validateAddClient,
};
