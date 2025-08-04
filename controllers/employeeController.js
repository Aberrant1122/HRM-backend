const { User, UserInfo, UserBankInfo } = require("../models");
const { validationResult } = require("express-validator");

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

module.exports = {
  getAllEmployeesWithUserInfo,
  addUserBankInfo,
  updateUserBankInfo,
  getUserBankDetails,
};
