const { User, UserInfo, UserBankInfo } = require("../models");
const { Op } = require("sequelize");
const { validationResult } = require("express-validator");
const path = require("path");
const { getPagination, getPagingData } = require("../utils/pagination");

const getAllEmployeesWithUserInfo = async (req, res) => {
  try {
    const { page, limit, includeUserInfo: includeUserInfoQuery, department } = req.query;
    const includeUserInfo = includeUserInfoQuery !== "false" || !!department;
    const { limit: l, offset } = getPagination(page, limit);

    const queryOptions = {
      where: {
        role: "employee"
      },
      include: [],
      attributes: ["id", "fullName", "email", "role", "status", "profilePicture", "lastLogin"],
      limit: l,
      offset,
      order: [["fullName", "ASC"]],
    };

    if (includeUserInfo) {
      queryOptions.include.push({
        model: UserInfo,
        as: "userInfo",
        attributes: ["id", "department", "position", "contactNumber", "cnic", "startDate"],
        ...(department && { where: { department } })
      });
    }

    const result = await User.findAndCountAll(queryOptions);
    const paginatedData = getPagingData(result, page, l);

    // Generate signed URLs for profile pictures if they exist
    const { getSignedUrlForObject, extractS3Key } = require('../utils/s3Helper');
    const employeesWithSignedUrls = await Promise.all(
      paginatedData.items.map(async (employee) => {
        const employeeData = employee.toJSON();

        if (employeeData.profilePicture && employeeData.profilePicture.includes('s3')) {
          try {
            const key = extractS3Key(employeeData.profilePicture);
            if (key) {
              employeeData.profilePicture = await getSignedUrlForObject(key, 86400); // 24 hours
            }
          } catch (error) {
            console.error('Error generating signed URL for employee profile picture:', error);
          }
        }

        return employeeData;
      })
    );

    return res.status(200).json({
      success: true,
      data: employeesWithSignedUrls,
      pagination: {
        totalItems: paginatedData.totalItems,
        totalPages: paginatedData.totalPages,
        currentPage: paginatedData.currentPage,
      },
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
          // Don't exclude any fields to see what's in the database
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
    const userInfoData = user.userInfo ? user.userInfo.toJSON() : null;
    // Parse attachments if it's a string (MySQL JSON column returns as string sometimes)
    let attachments = [];
    if (userInfoData?.attachments) {
      if (typeof userInfoData.attachments === 'string') {
        try {
          attachments = JSON.parse(userInfoData.attachments);
        } catch (e) {
          console.error('Failed to parse attachments:', e);
          attachments = [];
        }
      } else if (Array.isArray(userInfoData.attachments)) {
        attachments = userInfoData.attachments;
      }
    }

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
      ...(userInfoData && {
        personalInfo: {
          ...userInfoData,
          // Use parsed attachments
          attachments: Array.isArray(attachments) ? attachments : []
        }
      }),
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

    const user = await User.findByPk(userId, { transaction });

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent deleting the current user
    if (user.id === req.user.id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    // Check if user is an employee (only employees should be permanently deleted)
    if (user.role === "employee") {
      // Check if employee is assigned as manager to any projects
      const { Project, Task } = require("../models");
      const managedProjects = await Project.findAll({
        where: { managerId: userId },
        attributes: ["id", "name"],
        include: [
          {
            model: Task,
            as: "tasks",
            attributes: ["id"],
          }
        ],
        transaction,
      });

      if (managedProjects.length > 0) {
        // Count total tasks across all projects
        const totalTasks = managedProjects.reduce((sum, project) => {
          return sum + (project.tasks ? project.tasks.length : 0);
        }, 0);

        const projectNames = managedProjects.map(p => p.name).join(", ");
        
        // Delete all tasks associated with these projects first
        for (const project of managedProjects) {
          if (project.tasks && project.tasks.length > 0) {
            await Task.destroy({
              where: { projectId: project.id },
              transaction,
            });
          }
        }

        // Delete all projects managed by this employee
        await Project.destroy({
          where: { managerId: userId },
          transaction,
        });

        console.log(`Deleted ${managedProjects.length} project(s) and ${totalTasks} task(s) for employee ${userId}`);
      }

      // Now permanently delete the employee from database
      await user.destroy({ transaction });

      await transaction.commit();

      const deletionMessage = managedProjects.length > 0
        ? `Employee deleted successfully. Also deleted ${managedProjects.length} project(s) and ${managedProjects.reduce((sum, p) => sum + (p.tasks ? p.tasks.length : 0), 0)} task(s) they were managing.`
        : "Employee deleted successfully";

      return res.status(200).json({
        success: true,
        message: deletionMessage,
        deletedProjects: managedProjects.length,
        deletedTasks: managedProjects.reduce((sum, p) => sum + (p.tasks ? p.tasks.length : 0), 0),
      });
    } else {
      // For non-employees (like clients), just deactivate
      user.status = "inactive";
      await user.save({ transaction });

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: "User deactivated successfully",
      });
    }
  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting/deactivating user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete user",
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
        // Skip invalid files
        if (!file || !file.originalname) {
          console.warn('Skipping invalid file:', file);
          return;
        }

        const publicPath = file.location || (file.filename ? `/uploads/employees/${file.filename}` : null);

        if (!publicPath) {
          console.warn('Skipping file with no path:', file.originalname);
          return;
        }

        attachments.push({
          filename: file.filename || path.basename(publicPath),
          originalName: file.originalname,
          path: publicPath,
          size: file.size || 0,
          mimetype: file.mimetype || 'application/octet-stream',
          uploadedAt: new Date().toISOString(),
        });
      });
    }

    // Get existing attachments and add new ones
    let existingAttachments = userInfo.attachments || [];

    // Parse if it's a string
    if (typeof existingAttachments === 'string') {
      try {
        existingAttachments = JSON.parse(existingAttachments);
      } catch (e) {
        existingAttachments = [];
      }
    }

    if (!Array.isArray(existingAttachments)) {
      existingAttachments = [];
    }

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

    let existingAttachments = userInfo.attachments || [];
    if (typeof existingAttachments === 'string') {
      try {
        existingAttachments = JSON.parse(existingAttachments);
      } catch (_) {
        existingAttachments = [];
      }
    }
    if (!Array.isArray(existingAttachments)) {
      existingAttachments = [];
    }
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

    const removedAttachment = existingAttachments[attachmentIndex];
    const attachmentPath = removedAttachment?.path;
    try {
      if (attachmentPath && attachmentPath.startsWith('http')) {
        const { s3Client, bucket, extractS3Key } = require('../utils/s3Helper');
        const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
        const key = extractS3Key(attachmentPath);
        if (key && bucket) {
          try {
            await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
          } catch (err) {
            const code = err?.Code || err?.name;
            if (code === 'NoSuchKey') {
            } else {
              throw err;
            }
          }
        }
      } else if (attachmentPath && attachmentPath.startsWith('/uploads/')) {
        const fs = require('fs');
        const filePath = path.join(__dirname, '..', attachmentPath);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (_) { }
      }
    } catch (storageErr) {
      await transaction.rollback();
      return res.status(500).json({
        success: false,
        message: 'Failed to delete attachment from storage',
        error: process.env.NODE_ENV === 'development' ? storageErr.message : undefined,
      });
    }

    existingAttachments.splice(attachmentIndex, 1);

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

    // Parse attachments if it's a string
    let attachments = userInfo.attachments || [];
    if (typeof attachments === 'string') {
      try {
        attachments = JSON.parse(attachments);
      } catch (e) {
        console.error('Failed to parse attachments:', e);
        attachments = [];
      }
    }

    if (!Array.isArray(attachments)) {
      attachments = [];
    }

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

    const attachmentPath = attachment.path;

    // Check if it's a local file
    if (attachmentPath && attachmentPath.startsWith('/uploads/')) {
      const fs = require('fs');
      const filePath = path.join(__dirname, '..', attachmentPath);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'File not found on server'
        });
      }

      // Set headers for download
      const filename = attachment.originalName || attachment.filename;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', attachment.mimetype || 'application/octet-stream');

      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      return;
    }

    // Handle S3 files
    if (attachmentPath && attachmentPath.startsWith('http')) {
      const { getSignedUrlForObject, extractS3Key } = require('../utils/s3Helper');

      try {
        console.log('Original attachment path:', attachmentPath);
        const key = extractS3Key(attachmentPath);
        console.log('Extracted S3 key:', key);

        if (!key) {
          return res.status(400).json({
            success: false,
            message: 'Invalid S3 path'
          });
        }

        // Generate a signed URL and redirect
        const signedUrl = await getSignedUrlForObject(key, 3600); // 1 hour
        console.log('Generated signed URL (first 100 chars):', signedUrl.substring(0, 100));
        return res.redirect(signedUrl);
      } catch (error) {
        console.error('Error generating signed URL for download:', error);
        console.error('Error details:', error.stack);
        return res.status(500).json({
          success: false,
          message: 'Failed to generate download URL',
          error: process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    }

    // If we get here, the path format is unknown
    return res.status(400).json({
      success: false,
      message: 'Invalid attachment path format'
    });

  } catch (error) {
    console.error("Error downloading employee attachment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to download attachment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const viewEmployeeAttachment = async (req, res) => {
  try {
    const { userId, attachmentId } = req.params;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const userInfo = await UserInfo.findOne({ where: { userId } });
    if (!userInfo) {
      return res.status(404).json({ success: false, message: "User information not found" });
    }

    let attachments = userInfo.attachments || [];
    if (typeof attachments === 'string') {
      try { attachments = JSON.parse(attachments); } catch (_) { attachments = []; }
    }
    if (!Array.isArray(attachments)) attachments = [];

    const attachment = attachments.find((att) => att.filename === attachmentId);
    if (!attachment) {
      return res.status(404).json({ success: false, message: "Attachment not found" });
    }

    const currentUserId = req.user.id || req.user.userId;
    if (currentUserId !== parseInt(userId) && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const attachmentPath = attachment.path;

    if (attachmentPath && attachmentPath.startsWith('/uploads/')) {
      const fs = require('fs');
      const filePath = path.join(__dirname, '..', attachmentPath);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'File not found on server' });
      }

      const filename = attachment.originalName || attachment.filename;
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Content-Type', attachment.mimetype || 'application/octet-stream');
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      return;
    }

    if (attachmentPath && attachmentPath.startsWith('http')) {
      const { getSignedUrlForObject, extractS3Key } = require('../utils/s3Helper');
      try {
        const key = extractS3Key(attachmentPath);
        if (!key) {
          return res.status(400).json({ success: false, message: 'Invalid S3 path' });
        }
        const signedUrl = await getSignedUrlForObject(key, 3600, {
          contentDisposition: 'inline',
          contentType: attachment.mimetype || undefined,
        });
        return res.redirect(signedUrl);
      } catch (error) {
        console.error('Error generating signed URL for inline view:', error);
        return res.status(500).json({ success: false, message: 'Failed to generate view URL', error: process.env.NODE_ENV === "development" ? error.message : undefined });
      }
    }

    return res.status(400).json({ success: false, message: 'Invalid attachment path format' });
  } catch (error) {
    console.error("Error viewing employee attachment:", error);
    res.status(500).json({ success: false, message: "Failed to view attachment", error: process.env.NODE_ENV === "development" ? error.message : undefined });
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
      email,
      status,
      contactNumber,
      address,
      dob,
      department,
      position,
      reportingManager,
    } = req.body;

    // Log the incoming data for debugging
    console.log('=== UPDATE PROFILE REQUEST ===');
    console.log('User ID:', userId);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Body keys:', Object.keys(req.body));

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

    // Check if email is being changed and if it already exists (admin only)
    if (isAdmin && email && email !== user.email) {
      const existingUser = await User.findOne({
        where: {
          email: email,
          id: { [Op.ne]: userId } // Exclude current user
        },
        transaction,
      });

      if (existingUser) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Email address is already in use by another user"
        });
      }
    }

    // Update user's basic info
    const userUpdateData = {};
    if (fullName) userUpdateData.fullName = fullName;
    if (isAdmin && email) userUpdateData.email = email;
    if (isAdmin && status) userUpdateData.status = status;

    if (Object.keys(userUpdateData).length > 0) {
      await user.update(userUpdateData, { transaction });
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

    // Handle Sequelize validation errors
    if (error.name === 'SequelizeValidationError') {
      const validationErrors = error.errors.map(err => ({
        field: err.path,
        message: err.message,
        value: err.value
      }));

      return res.status(400).json({
        success: false,
        message: "Validation Error",
        errors: validationErrors
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Controller for changing employee password (Admin only)
const changeEmployeePassword = async (req, res) => {
  // Check if user is admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Only admins can change employee passwords" });
  }

  const { userId } = req.params;
  const { newPassword } = req.body;

  // Validate password
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      message: "Password must be at least 6 characters long"
    });
  }

  try {
    const employee = await User.findOne({
      where: { id: userId, role: "employee" },
    });

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Update password (will be hashed by the model hook)
    employee.password = newPassword;
    employee.passwordChangedAt = new Date();
    await employee.save();

    return res.status(200).json({
      message: "Employee password updated successfully",
    });
  } catch (error) {
    console.error("Error in changeEmployeePassword:", error);
    return res.status(500).json({
      message: "Error changing employee password",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

// Controller for updating employee role (Admin only)
const updateEmployeeRole = async (req, res) => {
  // Check if user is admin
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Only admins can change employee roles"
    });
  }

  const { userId } = req.params;
  const { role } = req.body;

  // Validate role
  const validRoles = ["admin", "employee", "client", "manager"];
  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      message: "Invalid role. Must be one of: admin, employee, client, manager"
    });
  }

  try {
    const employee = await User.findOne({
      where: { id: userId },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    // Prevent changing own role
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own role"
      });
    }

    const oldRole = employee.role;

    // Update role
    await employee.update({ role });

    // TODO: Send notification if role changed to manager
    if (role === "manager" && oldRole !== "manager") {
      // You can add notification logic here
      console.log(`User ${employee.fullName} (ID: ${userId}) promoted to manager`);
    }

    return res.status(200).json({
      success: true,
      message: `Employee role updated successfully to ${role}`,
      data: {
        id: employee.id,
        fullName: employee.fullName,
        email: employee.email,
        role: employee.role,
        oldRole: oldRole,
      }
    });
  } catch (error) {
    console.error("Error in updateEmployeeRole:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating employee role",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
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
  viewEmployeeAttachment,
  updateUserProfile,
  uploadProfilePicture,
  deleteProfilePicture,
  changeEmployeePassword,
  updateEmployeeRole,
};
