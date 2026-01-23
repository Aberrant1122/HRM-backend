const { Department } = require("../models");
const { Op } = require("sequelize");

// Get all active departments
const getAllDepartments = async (req, res) => {
  try {
    const departments = await Department.findAll({
      where: { isActive: true },
      order: [["name", "ASC"]],
      attributes: ["id", "name", "description"],
    });

    return res.status(200).json({
      success: true,
      data: departments,
    });
  } catch (error) {
    console.error("Error fetching departments:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching departments",
      error: error.message,
    });
  }
};

// Create a new department
const createDepartment = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Department name is required",
      });
    }

    const trimmedName = name.trim();
    
    // Validate name length
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Department name must be between 2 and 100 characters",
      });
    }

    const allDepartments = await Department.findAll({
      attributes: ['id', 'name', 'description', 'isActive'],
    });
    const existingDepartment = allDepartments.find(
      dept => dept.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existingDepartment) {
      if (existingDepartment.isActive) {
        return res.status(409).json({
          success: false,
          message: "Department already exists",
        });
      } else {
        const department = await Department.findByPk(existingDepartment.id);
        department.name = trimmedName;
        if (description !== undefined) {
          department.description = description?.trim() || null;
        }
        department.isActive = true;
        await department.save();
        return res.status(200).json({
          success: true,
          message: "Department restored successfully",
          data: {
            id: department.id,
            name: department.name,
            description: department.description,
          },
        });
      }
    }

    const department = await Department.create({
      name: trimmedName,
      description: description?.trim() || null,
    });

    return res.status(201).json({
      success: true,
      message: "Department created successfully",
      data: {
        id: department.id,
        name: department.name,
        description: department.description,
      },
    });
  } catch (error) {
    console.error("Error creating department:", error);
    
    // Handle unique constraint violation
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Department already exists",
      });
    }

    // Handle validation errors
    if (error.name === "SequelizeValidationError") {
      const validationErrors = error.errors.map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: validationErrors,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error creating department",
      error: error.message,
    });
  }
};

// Update a department
const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const department = await Department.findByPk(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    if (name && name.trim()) {
      // Check if another department with the same name exists
      const allDepartments = await Department.findAll({
        attributes: ['id', 'name'],
        where: { 
          isActive: true,
          id: { [Op.ne]: id }
        }
      });
      
      const existingDepartment = allDepartments.find(
        dept => dept.name.toLowerCase() === name.trim().toLowerCase()
      );

      if (existingDepartment) {
        return res.status(409).json({
          success: false,
          message: "Department name already exists",
        });
      }

      department.name = name.trim();
    }

    if (description !== undefined) {
      department.description = description?.trim() || null;
    }

    await department.save();

    return res.status(200).json({
      success: true,
      message: "Department updated successfully",
      data: {
        id: department.id,
        name: department.name,
        description: department.description,
      },
    });
  } catch (error) {
    console.error("Error updating department:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating department",
      error: error.message,
    });
  }
};

// Soft delete a department (set isActive to false)
const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    const department = await Department.findByPk(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    // Soft delete by setting isActive to false
    await department.update({ isActive: false });

    return res.status(200).json({
      success: true,
      message: "Department deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting department:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting department",
      error: error.message,
    });
  }
};

// Restore a deleted department
const restoreDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    const department = await Department.findByPk(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    await department.update({ isActive: true });

    return res.status(200).json({
      success: true,
      message: "Department restored successfully",
    });
  } catch (error) {
    console.error("Error restoring department:", error);
    return res.status(500).json({
      success: false,
      message: "Error restoring department",
      error: error.message,
    });
  }
};

// Get all departments (including inactive ones) - Admin only
const getAllDepartmentsAdmin = async (req, res) => {
  try {
    const departments = await Department.findAll({
      order: [["name", "ASC"]],
      attributes: ["id", "name", "description", "isActive", "createdAt", "updatedAt"],
    });

    return res.status(200).json({
      success: true,
      data: departments,
    });
  } catch (error) {
    console.error("Error fetching all departments:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching departments",
      error: error.message,
    });
  }
};

module.exports = {
  getAllDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  restoreDepartment,
  getAllDepartmentsAdmin,
};
