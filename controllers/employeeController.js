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

    // Generate signed URLs for profile pictures if they exist
    const { getSignedUrlForObject, extractS3Key } = require('../utils/s3Helper');
    const employeesWithSignedUrls = await Promise.all(
      employees.map(async (employee) => {
        const employeeData = employee.toJSON();
        
        if (employeeData.profilePicture && employeeData.profilePicture.includes('s3')) {
          try {
            const key = extractS3Key(employeeData.profilePicture);
            if (key) {
              employeeData.profilePicture = await getSignedUrlForObject(key, 86400); // 24 hours
            }
          } catch (error) {
            console.error('Error generating signed URL for employee profile picture:', error);
            // Keep the original URL if signed URL generation fails
          }
        }
        
        return employeeData;
      })
    );

    return res.status(200).json({
      success: true,
      data: employeesWithSignedUrls,
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

    // Generate signed URL for profile picture if it exists and is an S3 URL
    let profilePictureUrl = user.profilePicture;
    if (profilePictureUrl && profilePictureUrl.includes('s3')) {
      try {
        const { getSignedUrlForObject, extractS3Key } = require('../utils/s3Helper');
        const key = extractS3Key(profilePictureUrl);
        if (key) {
          profilePictureUrl = await getSignedUrlForObject(key, 86400); // 24 hours
        }
      } catch (error) {
        console.error('Error generating signed URL for profile picture:', error);
        // Keep the original URL if signed URL generation fails
      }
    }

    // Format the response with user and personal info
    const responseData = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLogin: user.lastLogin,
      profilePicture: profilePictureUrl,
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
        const publicPath = file.location || (file.filename ? `/uploads/employees/${file.filename}` : null);
        attachments.push({
          filename: file.filename || path.basename(publicPath || ''),
          originalName: file.originalname,
          path: publicPath,
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

const downloadEmployeeAttachment = async (req, res) => {
  try {
    const { userId, attachmentId } = req.params;

    // Check if user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find user info
    const userInfo = await UserInfo.findOne({
      where: { userId },
    });

    if (!userInfo) {
      return res.status(404).json({
        success: false,
        message: "User information not found",
      });
    }

    const attachments = userInfo.attachments || [];
    const attachment = attachments.find((att) => att.filename === attachmentId);

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found",
      });
    }

    // Check if current user has access (admin or the user themselves)
    const currentUserId = req.user.id || req.user.userId;
    if (currentUserId !== parseInt(userId) && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Extract S3 key from attachment path
    let key = attachment.path;
    if (key.startsWith('/uploads/')) {
      // Local file - not supported for download
      return res.status(400).json({
        success: false,
        message: 'Local file download not supported'
      });
    }

  // If it's a URL, extract the key
  if (key.startsWith('http')) {
    const { URL } = require('url');
    try {
      const u = new URL(key);
      const hostParts = u.hostname.split('.');
      const S3_BUCKET = process.env.AWS_S3_BUCKET;
      if (S3_BUCKET && (hostParts[0] === S3_BUCKET || u.pathname.startsWith(`/${S3_BUCKET}/`))) {
        if (u.pathname.startsWith(`/${S3_BUCKET}/`)) {
          key = u.pathname.substring(S3_BUCKET.length + 2);
        } else {
          key = u.pathname.replace(/^\//, '');
        }
      }
    } catch (_) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attachment URL'
      });
    }
  }

  if (!key) {
    return res.status(400).json({
      success: false,
      message: 'Invalid attachment path'
    });
  }

  // Get S3 client
  const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    } : undefined,
    endpoint: process.env.AWS_S3_ENDPOINT || undefined,
    forcePathStyle: String(process.env.AWS_S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true'
  });

  const S3_BUCKET = process.env.AWS_S3_BUCKET;
  if (!S3_BUCKET) {
    return res.status(500).json({
      success: false,
      message: 'S3 bucket not configured'
    });
  }

  // Get object from S3
  const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  const response = await s3.send(command);

  // Set headers for download
  const filename = attachment.originalName || attachment.filename;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', response.ContentType || attachment.mimetype || 'application/octet-stream');

  // Stream the file
  response.Body.pipe(res);

  } catch (error) {
    console.error("Error downloading employee attachment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to download attachment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const uploadProfilePicture = async (req, res) => {
  const transaction = await User.sequelize.transaction();

  try {
    const { userId } = req.params;
    const file = req.file;

    if (!file) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // Check if user exists
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if current user has permission (admin or the user themselves)
    const currentUserId = req.user.id || req.user.userId;
    if (currentUserId !== parseInt(userId) && req.user.role !== "admin") {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get the S3 URL
    const profilePictureUrl = file.location || (file.filename ? `/uploads/profile-pictures/${file.filename}` : null);

    // Update user's profile picture
    await user.update({ profilePicture: profilePictureUrl }, { transaction });

    await transaction.commit();

    // Generate signed URL for the response if it's an S3 URL
    let responseUrl = profilePictureUrl;
    if (profilePictureUrl && profilePictureUrl.includes('s3')) {
      try {
        const { getSignedUrlForObject, extractS3Key } = require('../utils/s3Helper');
        const key = extractS3Key(profilePictureUrl);
        if (key) {
          responseUrl = await getSignedUrlForObject(key, 86400); // 24 hours
        }
      } catch (error) {
        console.error('Error generating signed URL:', error);
        // Keep the original URL if signed URL generation fails
      }
    }

    return res.status(200).json({
      success: true,
      message: "Profile picture uploaded successfully",
      data: {
        profilePicture: responseUrl,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error uploading profile picture:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to upload profile picture",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const deleteProfilePicture = async (req, res) => {
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

    // Check if current user has permission (admin or the user themselves)
    const currentUserId = req.user.id || req.user.userId;
    if (currentUserId !== parseInt(userId) && req.user.role !== "admin") {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Remove profile picture
    await user.update({ profilePicture: null }, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Profile picture removed successfully",
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error removing profile picture:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove profile picture",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const updateUserProfile = async (req, res) => {
  const transaction = await User.sequelize.transaction();

  try {
    const { userId } = req.params;
    const {
      fullName,
      contactNumber,
      address,
      dob,
      department,
      position,
      reportingManager,
    } = req.body;

    const parsedDob = dob ? new Date(dob) : undefined;

    // Check if user exists
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if current user has permission (admin or the user themselves)
    const currentUserId = req.user.id || req.user.userId;
    const isAdmin = req.user.role === "admin";
    
    if (currentUserId !== parseInt(userId) && !isAdmin) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Update user's full name if provided
    if (fullName) {
      await user.update({ fullName }, { transaction });
    }

    // Find or create user info
    let userInfo = await UserInfo.findOne({
      where: { userId },
      transaction,
    });

    if (!userInfo) {
      // Create new user info - only allow personal info for non-admins
      const createData = {
        userId,
        contactNumber,
        address,
        dob: parsedDob,
      };
      
      // Admins can set work information
      if (isAdmin) {
        if (department !== undefined) createData.department = department;
        if (position !== undefined) createData.position = position;
        if (reportingManager !== undefined) createData.reportingManager = reportingManager;
      }
      
      userInfo = await UserInfo.create(createData, { transaction });
    } else {
      // Update only provided fields
      const updateData = {};
      
      // Personal information - all users can update
      if (contactNumber !== undefined) updateData.contactNumber = contactNumber;
      if (address !== undefined) updateData.address = address;
      if (parsedDob !== undefined) updateData.dob = parsedDob;
      
      // Work information - only admins can update
      if (isAdmin) {
        if (department !== undefined) updateData.department = department;
        if (position !== undefined) updateData.position = position;
        if (reportingManager !== undefined) updateData.reportingManager = reportingManager;
      }

      await userInfo.update(updateData, { transaction });
    }

    await transaction.commit();

    // Fetch updated user data
    const updatedUser = await User.findOne({
      where: { id: userId },
      attributes: {
        exclude: ["password", "resetPasswordToken", "resetPasswordExpires"],
      },
      include: [
        {
          model: UserInfo,
          as: "userInfo",
          attributes: { exclude: ["id", "userId", "createdAt", "updatedAt"] },
        },
      ],
    });

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        id: updatedUser.id,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        role: updatedUser.role,
        status: updatedUser.status,
        lastLogin: updatedUser.lastLogin,
        profilePicture: updatedUser.profilePicture,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
        ...(updatedUser.userInfo && { personalInfo: updatedUser.userInfo }),
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating user profile:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
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
  downloadEmployeeAttachment,
  updateUserProfile,
  uploadProfilePicture,
  deleteProfilePicture,
};
