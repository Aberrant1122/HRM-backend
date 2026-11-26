const { LeaveType } = require("../models");
const { Op } = require("sequelize");

// Get all leave types
const getAllLeaveTypes = async (req, res) => {
    try {
        const { status } = req.query;
        const where = {};
        if (status) {
            where.status = status;
        }

        const leaveTypes = await LeaveType.findAll({
            where,
            order: [["createdAt", "DESC"]],
        });

        return res.status(200).json({
            success: true,
            data: leaveTypes,
        });
    } catch (error) {
        console.error("Error fetching leave types:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch leave types",
            error: error.message,
        });
    }
};

// Get single leave type
const getLeaveTypeById = async (req, res) => {
    try {
        const leaveType = await LeaveType.findByPk(req.params.id);
        if (!leaveType) {
            return res.status(404).json({
                success: false,
                message: "Leave type not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: leaveType,
        });
    } catch (error) {
        console.error("Error fetching leave type:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch leave type",
            error: error.message,
        });
    }
};

// Create leave type
const createLeaveType = async (req, res) => {
    try {
        if(req.body.annual_quota!==undefined&&!require('../utils/leaveQuota')(req.body.annual_quota))return res.status(400).json({success:false,message:'Annual quota must be a nonnegative integer; zero means unlimited'});
        const {
            name,
            is_paid,
            annual_quota,
            requires_approval,
            max_consecutive_days,
            half_day_allowed,
            status,
        } = req.body;

        const leaveType = await LeaveType.create({
            name,
            is_paid,
            annual_quota,
            requires_approval,
            max_consecutive_days,
            half_day_allowed,
            status,
        });

        return res.status(201).json({
            success: true,
            message: "Leave type created successfully",
            data: leaveType,
        });
    } catch (error) {
        console.error("Error creating leave type:", error);
        if (error.name === "SequelizeUniqueConstraintError") {
            return res.status(400).json({
                success: false,
                message: "Leave type name already exists",
            });
        }
        return res.status(500).json({
            success: false,
            message: "Failed to create leave type",
            error: error.message,
        });
    }
};

// Update leave type
const updateLeaveType = async (req, res) => {
    try {
        if(req.body.annual_quota!==undefined&&!require('../utils/leaveQuota')(req.body.annual_quota))return res.status(400).json({success:false,message:'Annual quota must be a nonnegative integer; zero means unlimited'});
        const leaveType = await LeaveType.findByPk(req.params.id);
        if (!leaveType) {
            return res.status(404).json({
                success: false,
                message: "Leave type not found",
            });
        }

        const {
            name,
            is_paid,
            annual_quota,
            requires_approval,
            max_consecutive_days,
            half_day_allowed,
            status,
        } = req.body;

        await leaveType.update({
            name,
            is_paid,
            annual_quota,
            requires_approval,
            max_consecutive_days,
            half_day_allowed,
            status,
        });

        return res.status(200).json({
            success: true,
            message: "Leave type updated successfully",
            data: leaveType,
        });
    } catch (error) {
        console.error("Error updating leave type:", error);
        if (error.name === "SequelizeUniqueConstraintError") {
            return res.status(400).json({
                success: false,
                message: "Leave type name already exists",
            });
        }
        return res.status(500).json({
            success: false,
            message: "Failed to update leave type",
            error: error.message,
        });
    }
};

// Delete/Disable leave type (Soft disable by setting status to inactive)
const toggleLeaveTypeStatus = async (req, res) => {
    try {
        const leaveType = await LeaveType.findByPk(req.params.id);
        if (!leaveType) {
            return res.status(404).json({
                success: false,
                message: "Leave type not found",
            });
        }

        const newStatus = leaveType.status === "active" ? "inactive" : "active";
        await leaveType.update({ status: newStatus });

        return res.status(200).json({
            success: true,
            message: `Leave type ${newStatus === "active" ? "enabled" : "disabled"} successfully`,
            data: leaveType,
        });
    } catch (error) {
        console.error("Error toggling leave type status:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to toggle leave type status",
            error: error.message,
        });
    }
};

module.exports = {
    getAllLeaveTypes,
    getLeaveTypeById,
    createLeaveType,
    updateLeaveType,
    toggleLeaveTypeStatus,
};
