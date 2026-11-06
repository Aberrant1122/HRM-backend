const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Op } = require("sequelize");
const { User, UserInfo, EmployeePayroll } = require("../models");
const { body, validationResult } = require("express-validator");
const nodemailer = require("nodemailer");
const { getPagination, getPagingData } = require("../utils/pagination");

// Load environment variables
const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3000";

// Email transporter
const transporter = nodemailer.createTransport(require("../config/runtimeSafety").mailOptions());

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
            <a href="${loginUrl}" style="color: #2563eb; font-weight: bold;">${loginUrl}</a></p>
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
    const { page, limit } = req.query;
    const { limit: l, offset } = getPagination(page, limit);

    const result = await User.findAndCountAll({
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
      limit: l,
      offset,
    });

    const paginatedData = getPagingData(result, page, l);

    return res.status(200).json({
      message: "Clients retrieved successfully",
      clients: paginatedData.items,
      total: paginatedData.totalItems,
      pagination: {
        totalItems: paginatedData.totalItems,
        totalPages: paginatedData.totalPages,
        currentPage: paginatedData.currentPage,
      }
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
          attributes: ["id", "userId", "contactNumber", "address", "companyName", "position"]
        },
      ],
      attributes: ["id", "fullName", "email", "role", "status", "createdAt", "lastLogin"],
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
    const result = await User.sequelize.transaction(async (transaction) => {
      const client = await User.findOne({
        where: { id, role: "client" }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!client) return { status: 404, body: { message: "Client not found" } };
      if (client.hasEmployeeHistory) {
        return { status: 409, body: { message: 'Employee history must be retained. Deactivate this account instead.' } };
      }
      // Locking the parent serializes conversion/deletion and FK-backed child inserts.
      // UserInfo alone is not employee provenance: genuine clients also have profiles.
      const [[history]] = await User.sequelize.query(`SELECT
        EXISTS(SELECT 1 FROM attendances WHERE userId = :id) OR
        EXISTS(SELECT 1 FROM leave_requests WHERE userId = :id) OR
        EXISTS(SELECT 1 FROM payroll_profiles WHERE employee_id = :id) OR
        EXISTS(SELECT 1 FROM employee_payrolls WHERE employee_id = :id) OR
        EXISTS(SELECT 1 FROM daily_work_records WHERE userId = :id) OR
        EXISTS(SELECT 1 FROM userBankInfo WHERE userId = :id) AS retained`,
      { replacements: { id }, transaction });
      if (Number(history.retained)) {
        return { status: 409, body: { message: 'Employment or financial history must be retained. Deactivate this account instead.' } };
      }
      // Login role changes must never provide a route around payroll retention.
      // Any payroll history blocks parent deletion; account deactivation remains available.
      const payroll = await EmployeePayroll.findOne({
        where: { employee_id: id }, attributes: ["id"],
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (payroll) {
        return { status: 409, body: { message: "Payroll history must be retained. Deactivate this account instead." } };
      }
      await client.destroy({ transaction });
      return { status: 200, body: { message: "Client deleted successfully" } };
    });
    return res.status(result.status).json(result.body);
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
