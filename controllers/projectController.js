const { Project, User, Task } = require('../models');
const { Op } = require('sequelize');
const { getPagination, getPagingData } = require('../utils/pagination');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { URL } = require('url');
const NotificationService = require('../utils/notificationService');

// S3 client for generating read URLs
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

function extractS3KeyFromUrl(maybeUrl) {
  try {
    const u = new URL(maybeUrl);
    // Virtual-hosted-style: https://bucket.s3.region.amazonaws.com/key
    // Path-style or custom endpoint: https://endpoint/bucket/key
    const hostParts = u.hostname.split('.');
    if (S3_BUCKET && (hostParts[0] === S3_BUCKET || u.pathname.startsWith(`/${S3_BUCKET}/`))) {
      if (u.pathname.startsWith(`/${S3_BUCKET}/`)) {
        return u.pathname.substring(S3_BUCKET.length + 2);
      }
      return u.pathname.replace(/^\//, '');
    }
    // Fallback: if endpoint is provided and path contains bucket
    if (process.env.AWS_S3_ENDPOINT) {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === S3_BUCKET) {
        return parts.slice(1).join('/');
      }
    }
  } catch (_) { }
  return null;
}

async function toReadableAttachmentUrl(stored) {
  if (!stored) return null;

  const storedStr = String(stored);

  // Local file storage (legacy support for local uploads)
  if (storedStr.startsWith('/uploads/')) {
    return storedStr;
  }

  // Normalize malformed URLs (e.g., https// -> https://)
  let normalized = storedStr.replace(/^(https?)\/\//i, '$1://');

  // If it's already a full S3 URL (legacy data), extract the key
  let s3Key = null;
  if (/^https?:\/\//i.test(normalized)) {
    // Try to extract S3 key from the URL
    s3Key = extractS3KeyFromUrl(normalized);
  } else {
    // It's already a key (new format)
    s3Key = normalized;
  }

  // Generate pre-signed URL for the S3 key
  if (s3Key && S3_BUCKET) {
    try {
      const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key });
      // Generate URL valid for 5 minutes
      return await getSignedUrl(s3, cmd, { expiresIn: 300 });
    } catch (error) {
      console.error('Error generating pre-signed URL:', error);
      return null;
    }
  }

  // Fallback: return as-is
  return normalized;
}

class ProjectController {
  // Create a new project
  async createProject(req, res) {
    try {
      const {
        name,
        description,
        status = 'planning',
        priority = 'medium',
        startDate,
        endDate,
        budget,
        managerId,
        clientId,
        tags = [],
        attachments = []
      } = req.body;

      // When using multipart/form-data, fields come as strings; coerce as needed
      let normalizedTags = tags;
      if (typeof normalizedTags === 'string') {
        try {
          normalizedTags = JSON.parse(normalizedTags);
        } catch (_) {
          normalizedTags = [];
        }
      }

      // Parse attachments if they arrive as JSON string via multipart
      let normalizedAttachments = attachments;
      if (typeof normalizedAttachments === 'string') {
        try {
          normalizedAttachments = JSON.parse(normalizedAttachments);
        } catch (_) {
          normalizedAttachments = [];
        }
      }

      // Handle file upload (single attachment)
      let attachmentPath = null;
      if (req.file) {
        // Prefer S3 location when available; fall back to local uploads path
        if (req.file.location) {
          attachmentPath = req.file.location;
        } else if (req.file.filename) {
          attachmentPath = `/uploads/projects/${req.file.filename}`;
        }
      }

      // Validate required fields
      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Project name is required'
        });
      }

      // if (!managerId) {
      //   return res.status(400).json({
      //     success: false,
      //     message: 'Project manager is required'
      //   });
      // }

      // Check if manager exists
      // const manager = await User.findByPk(managerId);
      // if (!manager) {
      //   return res.status(400).json({
      //     success: false,
      //     message: 'Project manager not found'
      //   });
      // }

      // Handle client assignment
      let clientName = null;
      let clientEmail = null;

      if (clientId) {
        // Verify client exists and get their information
        const client = await User.findOne({
          where: { id: clientId, role: 'client' }
        });

        if (!client) {
          return res.status(400).json({
            success: false,
            message: 'Client not found'
          });
        }

        clientName = client.fullName;
        clientEmail = client.email;
      }

      // Resolve managerId: use provided value or fall back to authenticated user
      let resolvedManagerId = managerId;
      const invalidManagerTokens = [undefined, null, '', 'null', 'undefined', 'NaN'];
      if (invalidManagerTokens.includes(resolvedManagerId)) {
        resolvedManagerId = undefined;
      }
      // Fall back to authenticated user id if available
      if (!resolvedManagerId && req.user && (req.user.id || req.user.userId)) {
        resolvedManagerId = req.user.id || req.user.userId;
      }
      // Coerce to integer if it's a string number
      if (typeof resolvedManagerId === 'string' && resolvedManagerId.trim() !== '') {
        const parsedId = parseInt(resolvedManagerId, 10);
        resolvedManagerId = Number.isFinite(parsedId) ? parsedId : undefined;
      }
      // Ensure we never pass NaN to the DB
      if (typeof resolvedManagerId === 'number' && !Number.isFinite(resolvedManagerId)) {
        resolvedManagerId = undefined;
      }

      // As projects table has a foreign key on managerId, ensure we have a valid manager
      if (!resolvedManagerId) {
        return res.status(400).json({
          success: false,
          message: 'Unable to resolve project manager. Please select a manager or sign in again.'
        });
      }

      // Verify manager exists to avoid FK errors
      const managerExists = await User.findByPk(resolvedManagerId);
      if (!managerExists) {
        return res.status(400).json({
          success: false,
          message: 'Project manager not found'
        });
      }

      const project = await Project.create({
        name,
        description,
        status,
        priority,
        startDate,
        endDate,
        budget,
        managerId: resolvedManagerId,
        clientName: clientName,
        clientEmail: clientEmail,
        tags: normalizedTags,
        attachment: attachmentPath,
        attachments: normalizedAttachments
      });

      // Fetch the created project with associations
      const createdProject = await Project.findByPk(project.id, {
        include: [
          {
            model: User,
            as: 'manager',
            attributes: ['id', 'fullName', 'email']
          }
        ]
      });

      const attachmentUrl = await toReadableAttachmentUrl(createdProject.attachment);

      // Notify the assigned manager about their new project
      if (resolvedManagerId) {
        try {
          const io = req.app.get('io');
          await NotificationService.notifyManagerAssignment(
            resolvedManagerId,
            project.id,
            project.name,
            io
          );
        } catch (notifError) {
          console.error('Error notifying manager assignment:', notifError);
          // Don't fail the project creation if notification fails
        }
      }

      // Notify client about file upload if attachment was added
      if (attachmentPath && clientEmail) {
        const io = req.app.get('io');
        const uploaderName = req.user?.fullName || 'Admin';
        await NotificationService.notifyFileUpload(project.id, req.file?.originalname || 'attachment', uploaderName, io);
      }

      res.status(201).json({
        success: true,
        message: 'Project created successfully',
        data: { ...createdProject.get({ plain: true }), attachmentUrl }
      });
    } catch (error) {
      console.error('Error creating project:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create project',
        error: error.message
      });
    }
  }

  // Get all projects with filtering and pagination
  async getAllProjects(req, res) {
    try {
      const {
        page,
        limit,
        status,
        priority,
        managerId,
        search,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = req.query;

      const { limit: l, offset } = getPagination(page, limit);
      const where = { isActive: true };

      // Apply filters
      if (status) where.status = status;
      if (priority) where.priority = priority;
      if (managerId) where.managerId = managerId;

      // Search functionality
      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } },
          { clientName: { [Op.like]: `%${search}%` } }
        ];
      }

      // Restrict non-admins to only their managed projects
      if (req.user.role !== 'admin') {
        where.managerId = req.user.id;
      }

      const result = await Project.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'manager',
            attributes: ['id', 'fullName', 'email']
          },
          {
            model: Task,
            as: 'tasks',
            where: { isActive: true },
            required: false,
            attributes: ['id', 'status', 'progress']
          }
        ],
        attributes: ['id', 'name', 'description', 'status', 'priority', 'startDate', 'endDate', 'budget', 'managerId', 'clientName', 'progress', 'attachment', 'createdAt'],
        order: [[sortBy, sortOrder.toUpperCase()]],
        limit: l,
        offset,
        distinct: true,
      });

      const paginatedData = getPagingData(result, page, l);

      // Map attachment to readable URLs
      const projectsWithUrls = await Promise.all(paginatedData.items.map(async (p) => ({
        ...p.get({ plain: true }),
        attachmentUrl: await toReadableAttachmentUrl(p.attachment)
      })));

      res.json({
        success: true,
        data: projectsWithUrls,
        pagination: {
          currentPage: paginatedData.currentPage,
          totalPages: paginatedData.totalPages,
          totalItems: paginatedData.totalItems,
        }
      });
    } catch (error) {
      console.error('Error fetching projects:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch projects',
        error: error.message
      });
    }
  }

  // Get a single project by ID
  async getProjectById(req, res) {
    try {
      const { id } = req.params;

      const project = await Project.findOne({
        where: { id, isActive: true },
        include: [
          {
            model: User,
            as: 'manager',
            attributes: ['id', 'fullName', 'email']
          },
          {
            model: Task,
            as: 'tasks',
            where: { isActive: true },
            required: false,
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'fullName', 'email']
              }
            ]
          }
        ]
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      const attachmentUrl = await toReadableAttachmentUrl(project.attachment);

      res.json({
        success: true,
        data: { ...project.get({ plain: true }), attachmentUrl }
      });
    } catch (error) {
      console.error('Error fetching project:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch project',
        error: error.message
      });
    }
  }

  // Update a project
  async updateProject(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const project = await Project.findOne({
        where: { id, isActive: true }
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      // Check if manager exists
      if (updateData.managerId) {
        const manager = await User.findByPk(updateData.managerId);
        if (!manager) {
          return res.status(400).json({
            success: false,
            message: 'Project manager not found'
          });
        }
      }

      const previousManagerId = project.managerId;
      await project.update(updateData);

      // Notify new manager if managerId changed
      if (updateData.managerId && updateData.managerId !== previousManagerId) {
        try {
          const io = req.app.get('io');
          await NotificationService.notifyManagerAssignment(
            updateData.managerId,
            project.id,
            project.name,
            io
          );
        } catch (notifError) {
          console.error('Error notifying new manager:', notifError);
          // Don't fail the update if notification fails
        }
      }

      // Fetch updated project with associations
      const updatedProject = await Project.findByPk(id, {
        include: [
          {
            model: User,
            as: 'manager',
            attributes: ['id', 'fullName', 'email']
          }
        ]
      });

      res.json({
        success: true,
        message: 'Project updated successfully',
        data: updatedProject
      });
    } catch (error) {
      console.error('Error updating project:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update project',
        error: error.message
      });
    }
  }

  // Delete a project (soft delete)
  async deleteProject(req, res) {
    try {
      const { id } = req.params;

      const project = await Project.findOne({
        where: { id, isActive: true }
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      // Soft-delete associated tasks
      await Task.update(
        { isActive: false },
        { where: { projectId: id, isActive: true } }
      );

      // Soft delete by setting isActive to false
      await project.update({ isActive: false });

      res.json({
        success: true,
        message: 'Project deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting project:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete project',
        error: error.message
      });
    }
  }

  // Get projects by manager
  async getProjectsByManager(req, res) {
    try {
      const { managerId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const offset = (page - 1) * limit;

      const { count, rows: projects } = await Project.findAndCountAll({
        where: { managerId, isActive: true },
        include: [
          {
            model: Task,
            as: 'tasks',
            where: { isActive: true },
            required: false,
            attributes: ['id', 'status']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const totalPages = Math.ceil(count / limit);

      res.json({
        success: true,
        data: projects,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching projects by manager:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch projects by manager',
        error: error.message
      });
    }
  }

  // Get projects by client email
  async getProjectsByClient(req, res) {
    try {
      // Resolve authenticated client info robustly
      const jwtUser = req.user || {};
      const { page = 1, limit = 10 } = req.query;

      // Fetch full user from DB to get reliable email/fullName
      let clientRecord = null;
      try {
        if (jwtUser.id) {
          clientRecord = await User.findByPk(jwtUser.id);
        }
        // Fallback to email lookup if id not present
        if (!clientRecord && jwtUser.email) {
          clientRecord = await User.findOne({ where: { email: jwtUser.email } });
        }
      } catch (e) {
        // non-fatal; continue with whatever we have
        console.warn('Unable to resolve client record from token:', e?.message || e);
      }

      const clientEmail = (clientRecord?.email || jwtUser.email || '').trim();
      const clientName = (clientRecord?.fullName || '').trim();

      const offset = (page - 1) * limit;

      // Build a resilient where clause: match by email, or by name if email missing
      const whereClause = { isActive: true };
      const orConditions = [];
      if (clientEmail) {
        orConditions.push({ clientEmail: clientEmail });
      }
      if (clientName) {
        orConditions.push({ clientName: clientName });
      }
      if (orConditions.length > 0) {
        whereClause[Op.or] = orConditions;
      } else {
        // No identifiable info; return empty result to avoid leaking data
        return res.json({
          success: true,
          data: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: parseInt(limit)
          }
        });
      }

      const { count, rows: projects } = await Project.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: 'manager',
            attributes: ['id', 'fullName', 'email']
          },
          {
            model: Task,
            as: 'tasks',
            where: { isActive: true },
            required: false,
            // Align with Task model: 'title' field, alias to 'name' for frontend
            attributes: [
              'id',
              ['title', 'name'],
              'status',
              'progress'
            ]
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const totalPages = Math.ceil(count / limit);

      // Map attachment to readable URLs
      const projectsWithUrls = await Promise.all(projects.map(async (p) => ({
        ...p.get({ plain: true }),
        attachmentUrl: await toReadableAttachmentUrl(p.attachment)
      })));

      res.json({
        success: true,
        data: projectsWithUrls,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching projects by client:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch projects by client',
        error: error.message
      });
    }
  }

  // Update project progress
  async updateProjectProgress(req, res) {
    try {
      const { id } = req.params;
      const { progress } = req.body;

      if (progress < 0 || progress > 100) {
        return res.status(400).json({
          success: false,
          message: 'Progress must be between 0 and 100'
        });
      }

      const project = await Project.findOne({
        where: { id, isActive: true }
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      await project.updateProgress(progress);

      res.json({
        success: true,
        message: 'Project progress updated successfully',
        data: project
      });
    } catch (error) {
      console.error('Error updating project progress:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update project progress',
        error: error.message
      });
    }
  }

  // Change project status
  async changeProjectStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      console.log(`Changing project status - ID: ${id}, Status: ${status}`);

      const project = await Project.findOne({
        where: { id, isActive: true }
      });

      if (!project) {
        console.log(`Project not found with ID: ${id}`);
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      console.log(`Found project: ${project.name}, current status: ${project.status}`);
      const oldStatus = project.status;
      await project.changeStatus(status);
      console.log(`Status changed successfully to: ${status}`);

      // Notify client about status change
      const io = req.app.get('io');
      await NotificationService.notifyProjectStatusChange(id, oldStatus, status, io);

      res.json({
        success: true,
        message: 'Project status changed successfully',
        data: project
      });
    } catch (error) {
      console.error('Error changing project status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to change project status',
        error: error.message
      });
    }
  }

  // Get project statistics
  async getProjectStatistics(req, res) {
    try {
      const totalProjects = await Project.count({ where: { isActive: true } });
      const planningProjects = await Project.count({ where: { status: 'planning', isActive: true } });
      const activeProjects = await Project.count({ where: { status: 'active', isActive: true } });
      const onHoldProjects = await Project.count({ where: { status: 'on-hold', isActive: true } });
      const completedProjects = await Project.count({ where: { status: 'completed', isActive: true } });
      const cancelledProjects = await Project.count({ where: { status: 'cancelled', isActive: true } });

      res.json({
        success: true,
        data: {
          total: totalProjects,
          planning: planningProjects,
          active: activeProjects,
          onHold: onHoldProjects,
          completed: completedProjects,
          cancelled: cancelledProjects
        }
      });
    } catch (error) {
      console.error('Error fetching project statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch project statistics',
        error: error.message
      });
    }
  }

  // Download project attachment
  async downloadProjectAttachment(req, res) {
    try {
      const { id } = req.params;

      const project = await Project.findOne({
        where: { id, isActive: true }
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      if (!project.attachment) {
        return res.status(404).json({
          success: false,
          message: 'No attachment found for this project'
        });
      }

      // Check if user has access to this project (e.g., is manager or admin)
      const userId = req.user.id || req.user.userId;
      if (project.managerId !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Extract S3 key from attachment path
      let key = project.attachment;
      if (key.startsWith('/uploads/')) {
        // Local file - not supported for download
        return res.status(400).json({
          success: false,
          message: 'Local file download not supported'
        });
      }

      // If it's a URL, extract the key
      if (key.startsWith('http')) {
        key = extractS3KeyFromUrl(key);
      }

      if (!key || !S3_BUCKET) {
        return res.status(400).json({
          success: false,
          message: 'Invalid attachment path'
        });
      }

      // Get object from S3
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
      const response = await s3.send(command);

      // Set headers for download
      const filename = key.split('/').pop() || 'attachment';
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', response.ContentType || 'application/octet-stream');

      // Stream the file
      response.Body.pipe(res);

    } catch (error) {
      console.error('Error downloading project attachment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to download attachment',
        error: error.message
      });
    }
  }
}

module.exports = new ProjectController();
