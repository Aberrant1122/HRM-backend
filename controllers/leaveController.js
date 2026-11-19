const { LeaveRequest, LeaveType, User, UserInfo, Department } = require("../models");
const { Op, Sequelize } = require("sequelize");
const { getPagination, getPagingData } = require("../utils/pagination");

// Helper to calculate business days (optional, but let's stick to total calendar days for simplicity unless specified)
const calculateTotalDays = (start, end, mode) => {
    if (mode === "half-day") return 0.5;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
};

// --- Employee Actions ---

// Apply for leave
const applyLeave = async (req, res) => {
    try {
        const { leaveTypeId, startDate, endDate, leaveMode, reason } = req.body;
        const userId = req.user.id;

        // Basic validation
        if (!leaveTypeId || !startDate || !endDate || !reason) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        if (new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({ success: false, message: "Start date cannot be after end date" });
        }

        // Check if leave type exists and is active
        const leaveType = await LeaveType.findByPk(leaveTypeId);
        if (!leaveType || leaveType.status !== "active") {
            return res.status(404).json({ success: false, message: "Invalid or inactive leave type" });
        }

        // Half-day validation
        if (leaveMode === "half-day" && startDate !== endDate) {
            return res.status(400).json({ success: false, message: "Half-day leave must be for a single day" });
        }
        if (leaveMode === "half-day" && !leaveType.half_day_allowed) {
            return res.status(400).json({ success: false, message: "Half-day not allowed for this leave type" });
        }

        const totalDays = calculateTotalDays(startDate, endDate, leaveMode);

        // Max consecutive days validation
        if (leaveType.max_consecutive_days && totalDays > leaveType.max_consecutive_days) {
            return res.status(400).json({
                success: false,
                message: `Maximum consecutive days for ${leaveType.name} is ${leaveType.max_consecutive_days}`,
            });
        }

        // Overlapping leave validation
        const overlapping = await LeaveRequest.findOne({
            where: {
                userId,
                status: { [Op.ne]: "rejected" },
                [Op.or]: [
                    {
                        startDate: { [Op.between]: [startDate, endDate] },
                    },
                    {
                        endDate: { [Op.between]: [startDate, endDate] },
                    },
                    {
                        [Op.and]: [
                            { startDate: { [Op.lte]: startDate } },
                            { endDate: { [Op.gte]: endDate } },
                        ],
                    },
                ],
            },
        });

        if (overlapping) {
            return res.status(400).json({
                success: false,
                message: "You already have a leave application for these dates",
            });
        }

        // Leave balance check (Annual quota)
        if (leaveType.annual_quota > 0) {
            // Calculate used leaves for this type in the current year
            const currentYear = new Date().getFullYear();
            const usedLeaves = await LeaveRequest.sum("totalDays", {
                where: {
                    userId,
                    leaveTypeId,
                    status: "approved",
                    startDate: {
                        [Op.gte]: `${currentYear}-01-01`,
                        [Op.lte]: `${currentYear}-12-31`,
                    },
                },
            }) || 0;

            if (usedLeaves + totalDays > leaveType.annual_quota) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient leave balance. You have ${leaveType.annual_quota - usedLeaves} days remaining.`,
                });
            }
        }

        const leaveRequest = await LeaveRequest.create({
            userId,
            leaveTypeId,
            startDate,
            endDate,
            totalDays,
            leaveMode,
            reason,
            status: "pending",
        });

        return res.status(201).json({
            success: true,
            message: "Leave application submitted successfully",
            data: leaveRequest,
        });
    } catch (error) {
        console.error("Error applying for leave:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to submit leave application",
            error: error.message,
        });
    }
};

// Get my leaves
const getMyLeaves = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page, limit } = req.query;
        const { limit: l, offset } = getPagination(page, limit);

        const result = await LeaveRequest.findAndCountAll({
            where: { userId },
            include: [
                {
                    model: LeaveType,
                    as: "leaveType",
                    attributes: ["id", "name", "is_paid"],
                },
            ],
            attributes: ["id", "userId", "leaveTypeId", "startDate", "endDate", "totalDays", "leaveMode", "reason", "status", "createdAt"],
            order: [["createdAt", "DESC"]],
            limit: l,
            offset,
        });

        const paginatedData = getPagingData(result, page, l);

        return res.status(200).json({
            success: true,
            data: paginatedData.items,
            pagination: {
                totalItems: paginatedData.totalItems,
                totalPages: paginatedData.totalPages,
                currentPage: paginatedData.currentPage,
            }
        });
    } catch (error) {
        console.error("Error fetching my leaves:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch leaves",
            error: error.message,
        });
    }
};

// --- Admin Actions ---

// Get today's leaves
const getTodaysLeaves = async (req, res) => {
    try {
        const today = new Date().toISOString().split("T")[0];
        const { status, leaveTypeId, department, page, limit } = req.query;
        const { limit: l, offset } = getPagination(page, limit);

        const where = {
            startDate: { [Op.lte]: today },
            endDate: { [Op.gte]: today },
        };

        if (status) where.status = status;
        if (leaveTypeId) where.leaveTypeId = leaveTypeId;

        const include = [
            {
                model: User,
                as: "user",
                attributes: ["id", "fullName", "email"],
                include: [
                    {
                        model: UserInfo,
                        as: "userInfo",
                        attributes: ["department", "position"],
                        ...(department && { where: { department } })
                    },
                ],
                required: !!department
            },
            {
                model: LeaveType,
                as: "leaveType",
                attributes: ["id", "name"],
            },
        ];

        const result = await LeaveRequest.findAndCountAll({
            where,
            include,
            attributes: ["id", "userId", "leaveTypeId", "startDate", "endDate", "totalDays", "leaveMode", "reason", "status", "createdAt"],
            order: [["createdAt", "DESC"]],
            limit: l,
            offset,
            distinct: true,
        });

        const paginatedData = getPagingData(result, page, l);

        return res.status(200).json({
            success: true,
            data: paginatedData.items,
            pagination: {
                totalItems: paginatedData.totalItems,
                totalPages: paginatedData.totalPages,
                currentPage: paginatedData.currentPage,
            }
        });
    } catch (error) {
        console.error("Error fetching today's leaves:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch today's leaves",
            error: error.message,
        });
    }
};

// Get all leaves (Admin)
const getAllLeaves = async (req, res) => {
    try {
        const { status, leaveTypeId, userId, page, limit } = req.query;
        const { limit: l, offset } = getPagination(page, limit);

        const where = {};
        if (status) where.status = status;
        if (leaveTypeId) where.leaveTypeId = leaveTypeId;
        if (userId) where.userId = userId;

        const result = await LeaveRequest.findAndCountAll({
            where,
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ["id", "fullName", "email"],
                },
                {
                    model: LeaveType,
                    as: "leaveType",
                    attributes: ["id", "name", "is_paid"],
                },
            ],
            attributes: ["id", "userId", "leaveTypeId", "startDate", "endDate", "totalDays", "leaveMode", "reason", "status", "createdAt"],
            order: [["createdAt", "DESC"]],
            limit: l,
            offset,
        });

        const paginatedData = getPagingData(result, page, l);

        return res.status(200).json({
            success: true,
            data: paginatedData.items,
            pagination: {
                totalItems: paginatedData.totalItems,
                totalPages: paginatedData.totalPages,
                currentPage: paginatedData.currentPage,
            }
        });
    } catch (error) {
        console.error("Error fetching all leaves:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch leaves",
            error: error.message,
        });
    }
};

// Approve leave
const approveLeave = async (req, res) => {
    try {
        const { id } = req.params;
        const leaveRequest = await LeaveRequest.findByPk(id);

        if (!leaveRequest) {
            return res.status(404).json({ success: false, message: "Leave request not found" });
        }

        const result = await LeaveRequest.sequelize.transaction(async (transaction) => {
            // Serialize approvals for this employee, including different pending requests.
            await User.findByPk(leaveRequest.userId, { transaction, lock: transaction.LOCK.UPDATE });
            const current = await LeaveRequest.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!current) return { status: 404, body: { success: false, message: "Leave request not found" } };
            if (current.status !== "pending") {
                return { status: 400, body: { success: false, message: "Leave request is already " + current.status } };
            }
            const leaveType = await LeaveType.findByPk(current.leaveTypeId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!leaveType || leaveType.status !== "active") {
                return { status: 400, body: { success: false, message: "Invalid or inactive leave type" } };
            }
            // Reapply the existing submission quota rule. Leave-year policy remains a product decision.
            if (leaveType.annual_quota > 0) {
                const currentYear = new Date().getFullYear();
                const used = Number(await LeaveRequest.sum("totalDays", {
                    where: {
                        userId: current.userId, leaveTypeId: current.leaveTypeId, status: "approved",
                        startDate: { [Op.gte]: currentYear + "-01-01", [Op.lte]: currentYear + "-12-31" },
                    }, transaction,
                }) || 0);
                if (used + Number(current.totalDays) > Number(leaveType.annual_quota)) {
                    return { status: 409, body: { success: false, message: "Insufficient leave balance at approval" } };
                }
            }
            await current.update({ status: "approved", approvedBy: req.user.id }, { transaction });
            return { status: 200, body: { success: true, message: "Leave request approved successfully", data: current } };
        });
        return res.status(result.status).json(result.body);
    } catch (error) {
        console.error("Error approving leave:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to approve leave request",
            error: error.message,
        });
    }
};

// Reject leave
const rejectLeave = async (req, res) => {
    try {
        const { id } = req.params;
        const { rejectionReason } = req.body;

        const leaveRequest = await LeaveRequest.findByPk(id);

        if (!leaveRequest) {
            return res.status(404).json({ success: false, message: "Leave request not found" });
        }

        const result = await LeaveRequest.sequelize.transaction(async (transaction) => {
            // Keep the same lock order as approval, including different requests for one employee.
            await User.findByPk(leaveRequest.userId, { transaction, lock: transaction.LOCK.UPDATE });
            const current = await LeaveRequest.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!current) return { status: 404, body: { success: false, message: "Leave request not found" } };
            if (current.status !== "pending") {
                return { status: 400, body: { success: false, message: "Leave request is already " + current.status } };
            }
            await current.update({
                status: "rejected", approvedBy: req.user.id,
                rejectionReason: rejectionReason || "No reason provided",
            }, { transaction });
            return { status: 200, body: { success: true, message: "Leave request rejected successfully", data: current } };
        });
        return res.status(result.status).json(result.body);
    } catch (error) {
        console.error("Error rejecting leave:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to reject leave request",
            error: error.message,
        });
    }
};

module.exports = {
    applyLeave,
    getMyLeaves,
    getTodaysLeaves,
    getAllLeaves,
    approveLeave,
    rejectLeave,
};
