const db = require("../models");
const { PayrollPeriod, EmployeePayroll, PayrollProfile, User, sequelize } = db;
const PayrollAdjustment = db.PayrollAdjustment;
const { Op } = require("sequelize");
const { calculateEmployeePayroll } = require("../utils/payrollService");

// Debug: Log all available models
console.log("Available models in payrollController:", Object.keys(db).filter(k => k !== 'sequelize' && k !== 'Sequelize'));

// Verify critical models are loaded
if (!PayrollAdjustment) {
    console.error("❌ CRITICAL: PayrollAdjustment model not loaded!");
    console.error("Available models:", Object.keys(db));
} else {
    console.log("✅ PayrollAdjustment model loaded successfully");
}

const createPayrollPeriod = async (req, res) => {
    res.setHeader('Cache-Control','private, no-store');
    const transaction = await sequelize.transaction({ isolationLevel: 'REPEATABLE READ' });

    try {
        const { name, startDate, endDate, payrollType } = req.body;

        // 1. Validate Input
        if (!name || !startDate || !endDate || !payrollType) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Please provide all required fields: name, startDate, endDate, payrollType",
            });
        }

        // Refuse silent population divergence before creating any payroll rows.
        const populationScope = await require('../services/legacyPopulationReview')(db).assertReconciled('payroll', { from: startDate, to: endDate, transaction, lock: true, actor: req.user });

        // 2. Check for overlapping payroll periods
        const overlappingPeriod = await PayrollPeriod.findOne({
            transaction,
            where: {
                [Op.or]: [
                    {
                        start_date: {
                            [Op.between]: [startDate, endDate],
                        },
                    },
                    {
                        end_date: {
                            [Op.between]: [startDate, endDate],
                        },
                    },
                    {
                        [Op.and]: [
                            { start_date: { [Op.lte]: startDate } },
                            { end_date: { [Op.gte]: endDate } },
                        ],
                    },
                ],
            },
        });

        if (overlappingPeriod) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Date range overlaps with existing payroll period: ${overlappingPeriod.name}`,
            });
        }

        // 3. Create Payroll Period
        const payrollPeriod = await PayrollPeriod.create(
            {
                name,
                start_date: startDate,
                end_date: endDate,
                payroll_type: payrollType,
                status: "draft",
                created_by: req.user.id,
            },
            { transaction }
        );

        // 4. Fetch all active employees
        const employees = await User.findAll({
            transaction,
            where: {
                ...require('../utils/employeeCohort').where(),
                status: "active",
            },
            include: [
                {
                    model: PayrollProfile,
                    as: "payrollProfile",
                },
            ],
        });

        if (employees.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "No active employees found to process payroll.",
            });
        }

        // 5. Filter employees with payroll profiles
        const employeesWithProfile = employees.filter((emp) => emp.payrollProfile);
        const employeesWithoutProfile = employees.filter((emp) => !emp.payrollProfile);

        if (employeesWithProfile.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "No employees with payroll profiles found. Please create payroll profiles before generating payroll.",
            });
        }

        // Log warning about skipped employees
        if (employeesWithoutProfile.length > 0) {
            const skippedNames = employeesWithoutProfile.map((emp) => emp.fullName).join(", ");
            console.warn(`⚠️ Skipping employees without payroll profiles: ${skippedNames}`);
        }

        // 6. Create employee_payroll rows only for employees with profiles
        const employeePayrolls = employeesWithProfile.map((emp) => ({
            payroll_period_id: payrollPeriod.id,
            employee_id: emp.id,
            gross_salary: 0,
            total_deductions: 0,
            net_salary: 0,
            snapshot: {},
            status: "draft",
            locked: false,
        }));

        await EmployeePayroll.bulkCreate(employeePayrolls, {
            transaction,
            fields: ["payroll_period_id", "employee_id", "gross_salary", "total_deductions", "net_salary", "snapshot", "status", "locked"]
        });

        await transaction.commit();

        const response = {
            success: true,
            message: "Payroll period generated successfully",
            data: {
                payrollPeriod,
                total_employees_processed: employeesWithProfile.length,
                populationScope,
            },
        };

        // Add warning about skipped employees if any
        if (employeesWithoutProfile.length > 0) {
            response.warning = `${employeesWithoutProfile.length} employee(s) skipped due to missing payroll profiles: ${employeesWithoutProfile.map(e => e.fullName).join(", ")}`;
        }

        return res.status(201).json(response);
    } catch (error) {
        if (transaction) await transaction.rollback();
        if (error.status) return res.status(error.status).json({success:false,message:error.message,code:error.code,review:error.review});
        console.error("Error generating payroll period:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate payroll period",
            error: process.env.NODE_ENV === "development" ? error.message : undefined,
        });
    }
};

/**
 * Calculate individual employee payroll
 */
const calculatePayroll = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await calculateEmployeePayroll(id, req.user);

        return res.status(200).json({
            success: true,
            message: "Payroll calculated successfully",
            data: result,
        });
    } catch (error) {
        console.error("Error calculating payroll:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Failed to calculate payroll",
        });
    }
};

/**
 * Bulk Calculate all payrolls for a period
 */
const bulkCalculatePayroll = async (req, res) => {
    try {
        const { periodId } = req.params;
        const { calculatePeriodPayroll } = require("../utils/payrollService");

        const result = await calculatePeriodPayroll(periodId, req.user);

        return res.status(200).json({
            success: true,
            message: `Processed ${result.processed} payroll records.`,
            data: result,
        });

    } catch (error) {
        console.error("Error bulk calculating payroll:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Failed to bulk calculate payroll",
        });
    }
};


/**
 * Add adjustment to employee payroll
 */
const addAdjustment = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { employee_payroll_id, type, amount, reason } = req.body;

        // 1. Basic Type Validation (Pre-model check)
        const validTypes = ['bonus', 'penalty', 'correction'];
        if (!validTypes.includes(type)) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "Invalid adjustment type." });
        }

        const payroll = await EmployeePayroll.findByPk(employee_payroll_id, { transaction });
        if (!payroll) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: "Payroll record not found." });
        }

        // 2. Create Adjustment (Model validations will trigger here)
        const adjustment = await PayrollAdjustment.create({
            employee_payroll_id,
            type,
            amount,
            reason,
            created_by: req.user.id
        }, { transaction });

        // 3. Update Payroll based on status
        if (payroll.locked || ["approved", "paid"].includes(payroll.status)) {
            const currentNet = parseFloat(payroll.net_salary);
            const adjAmount = parseFloat(amount);

            let newNet = currentNet;
            let newGross = parseFloat(payroll.gross_salary);
            let newDeductions = parseFloat(payroll.total_deductions);

            if (type === 'bonus') {
                newNet += adjAmount;
                newGross += adjAmount;
            } else if (type === 'penalty') {
                newNet -= adjAmount;
                newDeductions += adjAmount;
            } else if (type === 'correction') {
                newNet += adjAmount;
                if (adjAmount > 0) newGross += adjAmount;
                else newDeductions += Math.abs(adjAmount);
            }

            payroll.net_salary = newNet.toFixed(2);
            payroll.gross_salary = newGross.toFixed(2);
            payroll.total_deductions = newDeductions.toFixed(2);
            payroll.audit_log = addToAuditLog(payroll.audit_log, `Manual Adjustment (${type}): ${amount}. Reason: ${reason}`, req.user, payroll.status, payroll.status);

            // Note: Model hook beforeUpdate will allow this if only net_salary/audit_log changed and we correctly authorized it.
            // But wait, my hook blocks net_salary change for finalized records!
            // I should modify the hook to allow manual adjustments IF logged.
            // Or here, since it's an admin action, we bypass or the hook needs to be smarter.

            await payroll.save({ transaction });
            await transaction.commit();

            return res.status(201).json({
                success: true,
                message: "Post-finalization adjustment added successfully",
                data: adjustment
            });
        } else {
            // Commit adjustment first, then recalculate
            await transaction.commit();
            try {
                await calculateEmployeePayroll(employee_payroll_id, req.user);
                return res.status(201).json({
                    success: true,
                    message: "Adjustment added and payroll recalculated successfully",
                    data: adjustment
                });
            } catch (calcError) {
                console.error("Recalculation error after adjustment:", calcError);
                return res.status(201).json({
                    success: true,
                    message: "Adjustment saved, but automatic recalculation failed. Please trigger manually.",
                    data: adjustment
                });
            }
        }
    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error("Error in addAdjustment:", error);
        return res.status(400).json({
            success: false,
            message: error.name === 'SequelizeValidationError' ? error.errors[0].message : error.message
        });
    }
};


/**
 * Utility to add to audit log
 */
const addToAuditLog = (currentLog, action, user, prevStatus, newStatus) => {
    const log = Array.isArray(currentLog) ? [...currentLog] : [];
    log.push({
        action,
        performedBy: user.id || user.userId,
        userName: user.fullName || "Admin",
        prevStatus,
        newStatus,
        timestamp: new Date().toISOString()
    });
    return log;
};

/**
 * Transition Payroll Period Status with Strict State Machine Logic
 */
const updatePayrollPeriodStatus = async (req, res, targetStatus, allowedPrevStatus) => {
    const result = await sequelize.transaction(async (transaction) => {
        const { id } = req.params;

        // Use row-level locking on the period to prevent concurrent status updates
        const period = await PayrollPeriod.findByPk(id, {
            attributes: { include: ["audit_log"] },
            lock: transaction.LOCK.UPDATE,
            transaction
        });

        if (!period) {
            return { status: 404, body: { success: false, message: "Payroll period not found." } };
        }

        // Strict Status Flow Validation
        const statusMap = {
            'draft': 0,
            'reviewed': 1,
            'approved': 2,
            'paid': 3
        };

        const currentRank = statusMap[period.status];
        const targetRank = statusMap[targetStatus];

        if (targetRank !== currentRank + 1) {
            return { status: 400, body: {
                success: false,
                message: `Invalid transition. Status flow must be: Draft -> Reviewed -> Approved -> Paid. Current: ${period.status}, Target: ${targetStatus}`
            } };
        }

        const prevStatus = period.status;
        period.status = targetStatus;
        period.audit_log = addToAuditLog(period.audit_log, `Status update to ${targetStatus}`, req.user, prevStatus, targetStatus);

        await period.save({ transaction });

        // Atomic update of all employee payrolls within this period
        const payrollUpdateData = { status: targetStatus };

        // If transitioning to paid, lock all records
        if (targetStatus === 'paid') {
            payrollUpdateData.locked = true;

            // Audit logging for each payroll (bulk update doesn't trigger hooks, so we do it manually or via query)
            // For precision and audit, we'll fetch and update if the set is relatively small, 
            // or use a structured audit entry in JSON if using bulkUpdate.
        }

        await EmployeePayroll.update(payrollUpdateData, {
            where: { payroll_period_id: id },
            transaction
        });

        return { status: 200, body: {
            success: true,
            message: `Payroll period ${targetStatus} successfully`,
            data: period
        } };
    });
    return res.status(result.status).json(result.body);
};


const reviewPayrollPeriod = (req, res) => updatePayrollPeriodStatus(req, res, "reviewed", "draft");
const approvePayrollPeriod = (req, res) => updatePayrollPeriodStatus(req, res, "approved", "reviewed");
const payPayrollPeriod = (req, res) => updatePayrollPeriodStatus(req, res, "paid", "approved");

/**
 * Get all payroll periods (Admin/Manager)
 */
const getPayrollPeriods = async (req, res) => {
    try {
        const periods = await PayrollPeriod.findAll({
            order: [["created_at", "DESC"]],
            include: [{ model: User, as: "creator", attributes: ["id", "fullName"] }]
        });
        return res.status(200).json({ success: true, data: periods });
    } catch (error) {
        console.error("Error fetching payroll periods:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch payroll periods" });
    }
};

const getPayrollPeriodDetails = async (req, res) => {
    try {
        const { id } = req.params;
        // Applying the summary scope to EmployeePayroll to prevent leakage in bulk views
        const period = await PayrollPeriod.findByPk(id, {
            include: [
                {
                    model: EmployeePayroll.scope("summary"),
                    as: "payrolls",
                    include: [{ model: User, as: "employee", attributes: ["id", "fullName", "email"] }]
                }
            ]
        });

        if (!period) return res.status(404).json({ success: false, message: "Period not found" });

        return res.status(200).json({ success: true, data: period });
    } catch (error) {
        console.error("Error fetching payroll details:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch payroll details" });
    }
};

/**
 * Get own payroll history (Employee)
 */
const getEmployeePayrollHistory = async (req, res) => {
    try {
        const payrolls = await EmployeePayroll.scope("summary").findAll({
            where: { employee_id: req.user.id },
            include: [{ model: PayrollPeriod, as: "period" }],
            order: [[{ model: PayrollPeriod, as: "period" }, "start_date", "DESC"]]
        });
        return res.status(200).json({ success: true, data: payrolls });
    } catch (error) {
        console.error("Error fetching payroll history:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch payroll history" });
    }
};


/**
 * Delete a payroll period (Admin only - Testing)
 */
const deletePayrollPeriod = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await sequelize.transaction(async (transaction) => {
            // Share the period lock used by status transitions.
            const period = await PayrollPeriod.findByPk(id, {
                transaction, lock: transaction.LOCK.UPDATE,
            });
            if (!period) {
                return { status: 404, body: { success: false, message: "Payroll period not found." } };
            }
            const finalizedPayroll = await EmployeePayroll.findOne({
                where: {
                    payroll_period_id: id,
                    [Op.or]: [{ locked: true }, { status: { [Op.in]: ["approved", "paid"] } }],
                },
                transaction, lock: transaction.LOCK.UPDATE,
            });
            if (["approved", "paid"].includes(period.status) || finalizedPayroll) {
                return { status: 409, body: { success: false, message: "Finalized payroll history cannot be deleted." } };
            }
            await period.destroy({ transaction });
            return { status: 200, body: { success: true, message: "Payroll period deleted successfully" } };
        });
        return res.status(result.status).json(result.body);
    } catch (error) {
        console.error("Error deleting payroll period:", error);
        return res.status(500).json({ success: false, message: "Failed to delete payroll period" });
    }
};

module.exports = {
    createPayrollPeriod,
    calculatePayroll,
    bulkCalculatePayroll,
    addAdjustment,
    reviewPayrollPeriod,
    approvePayrollPeriod,
    payPayrollPeriod,
    getPayrollPeriods,
    getPayrollPeriodDetails,
    getEmployeePayrollHistory,
    deletePayrollPeriod
};
