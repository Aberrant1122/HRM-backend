const { User, UserInfo, UserBankInfo } = require("../models");
const { Op } = require("sequelize");
const { validationResult } = require("express-validator");
const path = require("path");

const getAllEmployeesWithUserInfo = async (req, res) => {
  try {
    const includeUserInfo = req.body.includeUserInfo !== Boolean(false);

    const queryOptions = {
      where: { role: "employee" },
      ...(includeUserInfo && {
        include: [
          {
            model: UserInfo,
            as: "userInfo",
            attributes: { exclude: ["id", "userId", "createdAt", "updatedAt"] },
          },
        ],
      }),
      attributes: { exclude: ["password", "resetToken", "resetTokenExpiry"] },
    };

    const employees = await User.findAll(queryOptions);

    return res.status(200).json({
      success: true,
      data: employees,
      meta: { includeUserInfo },
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch employees",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const addUserBankInfo = async (req, res) => {
  const transaction = await UserBankInfo.sequelize.transaction();

  try {
    const { userId } = req.params;
    const {
      bankName,
      accountTitle,
      accountNumber,
      IBAN,
      branchCode,
      branchAddress,
    } = req.body;

    // Check if user exists
    const user = await User.findByPk(userId);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if bank info already exists for this user
    const existingBankInfo = await UserBankInfo.findOne({
      where: { userId },
      transaction,
    });

    let bankInfo;

    if (existingBankInfo) {
      // Update existing bank info
      bankInfo = await existingBankInfo.update(
        {
          bankName,
          accountTitle,
          accountNumber,
          IBAN,
          branchCode,
          branchAddress,
        },
        { transaction }
      );
    } else {
      // Create new bank info
      bankInfo = await UserBankInfo.create(
        {
          userId,
          bankName,
          accountTitle,
          accountNumber,
          IBAN,
          branchCode,
          branchAddress,
        },
        { transaction }
      );
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Bank information saved successfully",
      data: bankInfo,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error saving bank information:", error);

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
        success: false,
        message: "Validation Error",
        errors,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to save bank information",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const updateUserBankInfo = async (req, res) => {
  const transaction = await UserBankInfo.sequelize.transaction();

  try {
    const { userId } = req.params;
    const {
      bankName,
      accountTitle,
      accountNumber,
      IBAN,
      branchCode,
      branchAddress,
    } = req.body;

    // Check if user exists
    const user = await User.findByPk(userId);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find the existing bank info
    const bankInfo = await UserBankInfo.findOne({
      where: { userId },
      transaction,
    });

    if (!bankInfo) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Bank information not found for this user",
      });
    }

    // Update the bank info
    const updatedBankInfo = await bankInfo.update(
      {
        bankName,
        accountTitle,
        accountNumber,
        IBAN,
        branchCode,
        branchAddress,
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Bank information updated successfully",
      data: updatedBankInfo,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating bank information:", error);

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
        success: false,
        message: "Validation Error",
        errors,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update bank information",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const getUserBankDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find the bank info
    const bankInfo = await UserBankInfo.findOne({
      where: { userId },
      attributes: {
        exclude: ["id", "userId", "createdAt", "updatedAt"],
      },
    });

    if (!bankInfo) {
      return res.status(404).json({
        success: false,
        message: "Bank information not found for this user",
      });
    }

    return res.status(200).json({
      success: true,
      data: bankInfo,
    });
  } catch (error) {
    console.error("Error fetching bank information:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch bank information",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find the user with related info
    const user = await User.findOne({
      where: { id: userId },
      attributes: {
        exclude: ["password", "resetPasswordToken", "resetPasswordExpires"],
      },
      include: [
        {
          model: UserInfo,
          as: "userInfo",
          attributes: { exclude: ["id", "userId", "createdAt", "updatedAt"] },
          required: false,
        },
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Format the response with user and personal info
    const responseData = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      ...(user.userInfo && { personalInfo: user.userInfo }),
    };

    return res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user information",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const deactivateUser = async (req, res) => {
  const transaction = await User.sequelize.transaction();

  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await User.findByPk(userId, { transaction });

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent deactivating the current user
    if (user.id === req.user.id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own account",
      });
    }

    // Update user status to inactive
    user.status = "inactive";
    await user.save({ transaction });

    await transaction.commit();

    res.status(200).json({
      success: true,
      message: "User deactivated successfully",
      data: {
        userId: user.id,
        status: user.status,
        deactivatedAt: new Date(),
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error deactivating user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to deactivate user",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const addEmployeeAttachments = async (req, res) => {
  const transaction = await UserInfo.sequelize.transaction();

  try {
    const { userId } = req.params;
    const files = req.files;

    // Check if user exists
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find user info
    let userInfo = await UserInfo.findOne({
      where: { userId },
      transaction,
    });

    if (!userInfo) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User information not found",
      });
    }

    // Process uploaded files
    const attachments = [];
    if (files && files.length > 0) {
      files.forEach((file) => {
        attachments.push({
          filename: file.filename,
          originalName: file.originalname,
          path: `/uploads/employees/${file.filename}`,
          size: file.size,
          mimetype: file.mimetype,
          uploadedAt: new Date().toISOString(),
        });
      });
    }

    // Get existing attachments and add new ones
    const existingAttachments = userInfo.attachments || [];
    const updatedAttachments = [...existingAttachments, ...attachments];

    // Update user info with new attachments
    await userInfo.update(
      { attachments: updatedAttachments },
      { transaction }
    );

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Attachments uploaded successfully",
      data: {
        attachments: updatedAttachments,
        newAttachments: attachments,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error uploading attachments:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to upload attachments",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const removeEmployeeAttachment = async (req, res) => {
  const transaction = await UserInfo.sequelize.transaction();

  try {
    const { userId, attachmentId } = req.params;

    // Check if user exists
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find user info
    const userInfo = await UserInfo.findOne({
      where: { userId },
      transaction,
    });

    if (!userInfo) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User information not found",
      });
    }

    const existingAttachments = userInfo.attachments || [];
    const attachmentIndex = existingAttachments.findIndex(
      (att) => att.filename === attachmentId
    );

    if (attachmentIndex === -1) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Attachment not found",
      });
    }

    // Remove attachment from array
    const removedAttachment = existingAttachments[attachmentIndex];
    existingAttachments.splice(attachmentIndex, 1);

    // Update user info
    await userInfo.update(
      { attachments: existingAttachments },
      { transaction }
    );

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Attachment removed successfully",
      data: {
        removedAttachment,
        remainingAttachments: existingAttachments,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error removing attachment:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove attachment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  getAllEmployeesWithUserInfo,
  addUserBankInfo,
  updateUserBankInfo,
  getUserBankDetails,
  getUserById,
  deactivateUser,
  addEmployeeAttachments,
  removeEmployeeAttachment,
};
