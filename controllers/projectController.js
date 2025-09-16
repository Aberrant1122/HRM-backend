const { Project, User, Task } = require('../models');
const { Op } = require('sequelize');

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
        clientName,
        clientEmail,
        tags = [],
        attachments = []
      } = req.body;

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

      const project = await Project.create({
        name,
        description,
        status,
        priority,
        startDate,
        endDate,
        budget,
        managerId,
        clientName,
        clientEmail,
        tags,
        attachments
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

      res.status(201).json({
        success: true,
        message: 'Project created successfully',
        data: createdProject
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
        page = 1,
        limit = 10,
        status,
        priority,
        managerId,
        search,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;
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

      const { count, rows: projects } = await Project.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'manager',
            attributes: ['id', 'fullName', 'email']
          }
        ],
        order: [[sortBy, sortOrder.toUpperCase()]],
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

      res.json({
        success: true,
        data: project
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

      // Update the project
      await project.update(updateData);

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

      // Check if project has active tasks
      const activeTasks = await Task.count({
        where: { projectId: id, isActive: true }
      });

      if (activeTasks > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete project with active tasks. Please complete or reassign tasks first.'
        });
      }

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

      const project = await Project.findOne({
        where: { id, isActive: true }
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      await project.changeStatus(status);

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
}

module.exports = new ProjectController();
