"use strict";
const {
    EmployeePayroll,
    PayrollPeriod,
    PayrollProfile,
    User,
    Attendance,
    LeaveRequest,
    LeaveType,
    PayrollAdjustment,
    sequelize,
} = require("../models");
const { Op } = require("sequelize");

const { Decimal } = require("decimal.js");
const crypto = require("crypto");

/**
 * Audit & Hashing Utilities
 */
const _generateSnapshotHash = (snapshot) => {
    return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
};

const _deepFreeze = (obj) => {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach((prop) => {
        if (obj.hasOwnProperty(prop) &&
            obj[prop] !== null &&
            (typeof obj[prop] === "object" || typeof obj[prop] === "function") &&
            !Object.isFrozen(obj[prop])) {
            _deepFreeze(obj[prop]);
        }
    });
    return obj;
};

const _validateSnapshotSchema = (snapshot) => {
    const required = ["baseSalary", "salaryType", "net_salary", "gross_salary", "total_deductions"];
    required.forEach(field => {
        if (snapshot[field] === undefined) throw new Error(`Audit Failure: Snapshot missing required field [${field}]`);
    });
};


/**
 * Core Payroll Calculation Logic
 * Performs the math using pre-fetched data and Decimal.js for financial safety.
 */
const _calculateCore = (employeePayroll, profile, attendances, leaves, adjustments, period) => {
    // 0. Validation Guards
    const baseVal = new Decimal(profile.base_salary || 0);
    const stdDays = new Decimal(profile.standard_working_days || 22);
    const stdHours = new Decimal(profile.standard_working_hours || 8);
    const otRate = new Decimal(profile.overtime_rate || 0);
    const taxPerc = new Decimal(profile.tax_percentage || 0);

    if (baseVal.isNegative()) throw new Error("Base salary cannot be negative.");
    if (stdDays.lte(0)) throw new Error("Standard working days must be greater than 0.");
    if (otRate.isNegative()) throw new Error("Overtime rate cannot be negative.");

    const { start_date, end_date } = period;

    // 1. Process Adjustments (High Precision)
    let totalBonuses = new Decimal(0);
    let totalAdjustmentPenalties = new Decimal(0);
    let totalCorrections = new Decimal(0);

    adjustments.forEach(adj => {
        const amount = new Decimal(adj.amount || 0);
        if (adj.type === 'bonus') totalBonuses = totalBonuses.plus(amount);
        else if (adj.type === 'penalty') totalAdjustmentPenalties = totalAdjustmentPenalties.plus(amount);
        else if (adj.type === 'correction') totalCorrections = totalCorrections.plus(amount);
    });

    // 2. Summarize Attendance
    let totalAttendanceDays = new Decimal(0);
    let totalWorkedHours = new Decimal(0);
    let overtimeHours = new Decimal(0);
    let lateCounts = new Decimal(0);
    let earlyCheckouts = new Decimal(0);
    let absentDays = new Decimal(0);

    const lateRule = profile.late_penalty_rule || {};
    const officeStartTime = lateRule.startTime || "09:00";
    const officeEndTime = lateRule.endTime || "18:00";
    const lateGracePeriod = new Decimal(lateRule.gracePeriodMinutes || 15);
    const earlyGracePeriod = new Decimal(lateRule.earlyGracePeriodMinutes || 15);

    attendances.forEach((att) => {
        if (att.status === "present" || att.status === "half-day") {
            const attDayVal = att.status === "half-day" ? new Decimal(0.5) : new Decimal(1);
            totalAttendanceDays = totalAttendanceDays.plus(attDayVal);

            const hoursAttended = new Decimal(att.totalHours || 0);
            totalWorkedHours = totalWorkedHours.plus(hoursAttended);

            if (profile.overtime_eligible && hoursAttended.gt(stdHours)) {
                overtimeHours = overtimeHours.plus(hoursAttended.minus(stdHours));
            }

            if (att.clockIn) {
                const clockInTime = new Date(att.clockIn);
                const [startHour, startMin] = officeStartTime.split(":").map(Number);
                const expectedStart = new Date(clockInTime);
                expectedStart.setHours(startHour, startMin, 0, 0);
                const diffMins = new Decimal((clockInTime - expectedStart) / (1000 * 60));
                if (diffMins.gt(lateGracePeriod)) lateCounts = lateCounts.plus(1);
            }

            if (att.clockOut) {
                const clockOutTime = new Date(att.clockOut);
                const [endHour, endMin] = officeEndTime.split(":").map(Number);
                const expectedEnd = new Date(clockOutTime);
                expectedEnd.setHours(endHour, endMin, 0, 0);
                const diffMins = new Decimal((expectedEnd - clockOutTime) / (1000 * 60));
                if (diffMins.gt(earlyGracePeriod)) earlyCheckouts = earlyCheckouts.plus(1);
            }
        } else if (att.status === "absent") {
            absentDays = absentDays.plus(1);
        }
    });

    // 3. Summarize Leaves
    let paidLeaveDays = new Decimal(0);
    let unpaidLeaveDays = new Decimal(0);

    leaves.forEach((leave) => {
        const lStart = new Date(leave.startDate > start_date ? leave.startDate : start_date);
        const lEnd = new Date(leave.endDate < end_date ? leave.endDate : end_date);
        const diffTime = Math.abs(lEnd - lStart);
        const diffDays = new Decimal(Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);

        if (leave.leaveTypePaid) paidLeaveDays = paidLeaveDays.plus(diffDays);
        else unpaidLeaveDays = unpaidLeaveDays.plus(diffDays);
    });

    // 4. Mathematical Layers
    let grossSalary = new Decimal(0), totalDeductions = new Decimal(0), netSalary = new Decimal(0);
    let overtimePay = new Decimal(0), latePenalty = new Decimal(0), unpaidDeduction = new Decimal(0), taxAmount = new Decimal(0);

    const perDaySalary = baseVal.dividedBy(stdDays);

    let formula = "";
    if (profile.salary_type === "monthly") {
        const totalAccountedDays = totalAttendanceDays.plus(paidLeaveDays).plus(unpaidLeaveDays).plus(absentDays);
        const unaccountedDays = Decimal.max(0, stdDays.minus(totalAccountedDays));

        unpaidDeduction = (unpaidLeaveDays.plus(absentDays).plus(unaccountedDays)).times(perDaySalary);
        overtimePay = overtimeHours.times(otRate);
        latePenalty = lateCounts.times(new Decimal(lateRule.penalty_per_late || 0));
        taxAmount = baseVal.times(taxPerc).dividedBy(100);

        grossSalary = baseVal.plus(overtimePay).plus(totalBonuses).plus(totalCorrections.gt(0) ? totalCorrections : 0);
        totalDeductions = unpaidDeduction.plus(latePenalty).plus(taxAmount).plus(totalAdjustmentPenalties).plus(totalCorrections.lt(0) ? totalCorrections.abs() : 0);
        netSalary = grossSalary.minus(totalDeductions);
        formula = `Gross(${grossSalary}) = Base(${baseVal}) + OT(${overtimePay}) + Bonus(${totalBonuses}) + PosCorr(${totalCorrections.gt(0) ? totalCorrections : 0}); Deductions(${totalDeductions}) = Unpaid(${unpaidDeduction}) + Late(${latePenalty}) + Tax(${taxAmount}) + AdjPen(${totalAdjustmentPenalties}) + NegCorr(${totalCorrections.lt(0) ? totalCorrections.abs() : 0})`;
    } else if (profile.salary_type === "hourly") {
        const basicEarnings = totalWorkedHours.times(baseVal);
        overtimePay = overtimeHours.times(otRate);
        latePenalty = lateCounts.times(new Decimal(lateRule.penalty_per_late || 0));
        taxAmount = basicEarnings.times(taxPerc).dividedBy(100);

        grossSalary = basicEarnings.plus(overtimePay).plus(totalBonuses).plus(totalCorrections.gt(0) ? totalCorrections : 0);
        totalDeductions = latePenalty.plus(taxAmount).plus(totalAdjustmentPenalties).plus(totalCorrections.lt(0) ? totalCorrections.abs() : 0);
        netSalary = grossSalary.minus(totalDeductions);
        formula = `Hourly: Gross(${grossSalary}) = (Hours(${totalWorkedHours}) * Rate(${baseVal})) + OT(${overtimePay}) + Bonus(${totalBonuses})`;
    } else if (profile.salary_type === "daily") {
        const basicEarnings = totalAttendanceDays.times(baseVal);
        overtimePay = overtimeHours.times(otRate);
        latePenalty = lateCounts.times(new Decimal(lateRule.penalty_per_late || 0));
        taxAmount = basicEarnings.times(taxPerc).dividedBy(100);

        grossSalary = basicEarnings.plus(overtimePay).plus(totalBonuses).plus(totalCorrections.gt(0) ? totalCorrections : 0);
        totalDeductions = latePenalty.plus(taxAmount).plus(totalAdjustmentPenalties).plus(totalCorrections.lt(0) ? totalCorrections.abs() : 0);
        netSalary = grossSalary.minus(totalDeductions);
        formula = `Daily: Gross(${grossSalary}) = (Days(${totalAttendanceDays}) * Rate(${baseVal})) + OT(${overtimePay}) + Bonus(${totalBonuses})`;
    }


    // Final Guard: Salary cannot be negative
    if (netSalary.isNegative()) netSalary = new Decimal(0);

    const snapshot = {
        baseSalary: baseVal.toNumber(),
        salaryType: profile.salary_type,
        totalAttendanceDays: totalAttendanceDays.toNumber(),
        totalWorkedHours: totalWorkedHours.toNumber(),
        overtimeHours: overtimeHours.toNumber(),
        overtimePay: overtimePay.toFixed(2),
        lateCounts: lateCounts.toNumber(),
        earlyCheckouts: earlyCheckouts.toNumber(),
        latePenalty: latePenalty.toFixed(2),
        paidLeaveDays: paidLeaveDays.toNumber(),
        unpaidLeaveDays: unpaidLeaveDays.toNumber(),
        absentDays: absentDays.toNumber(),
        unaccountedDays: Decimal.max(0, stdDays.minus(totalAttendanceDays.plus(paidLeaveDays).plus(unpaidLeaveDays).plus(absentDays))).toNumber(),
        unpaidDeduction: unpaidDeduction.toFixed(2),
        totalBonuses: totalBonuses.toFixed(2),
        totalAdjustmentPenalties: totalAdjustmentPenalties.toFixed(2),
        totalCorrections: totalCorrections.toFixed(2),
        adjustments: adjustments.map(adj => ({ type: adj.type, amount: new Decimal(adj.amount).toFixed(2), reason: adj.reason })),
        taxPercentage: taxPerc.toNumber(),
        taxAmount: taxAmount.toFixed(2),
        standardWorkingDays: stdDays.toNumber(),
        standardWorkingHours: stdHours.toNumber(),
        net_salary: netSalary.toFixed(2),
        gross_salary: grossSalary.toFixed(2),
        total_deductions: totalDeductions.toFixed(2),
        calculationFormula: formula || "Logic inside _calculateCore",
        calculatedAt: new Date().toISOString(),
    };

    _validateSnapshotSchema(snapshot);
    const frozenSnapshot = _deepFreeze(snapshot);
    const hash = _generateSnapshotHash(frozenSnapshot);

    return {
        gross_salary: grossSalary.toFixed(2),
        total_deductions: totalDeductions.toFixed(2),
        net_salary: netSalary.toFixed(2),
        snapshot: frozenSnapshot,
        snapshot_hash: hash
    };
};



/**
 * Optimized Individual Payroll Calculation with Transaction and Locking
 */
const calculateEmployeePayroll = async (employeePayrollId, performedBy = null) => {
    return await sequelize.transaction(async (t) => {
        // 1. Fetch with Row-Level Locking (FOR UPDATE)
        const payroll = await EmployeePayroll.findByPk(employeePayrollId, {
            include: [
                { model: PayrollPeriod, as: "period" },
                { model: User, as: "employee", include: [{ model: PayrollProfile, as: "payrollProfile" }] },
            ],
            lock: t.LOCK.UPDATE,
            transaction: t
        });

        if (!payroll) throw new Error("Payroll record not found.");

        // 2. Status Safeguards
        const nonDraftStatuses = ["reviewed", "approved", "paid"];
        if (payroll.locked || nonDraftStatuses.includes(payroll.status)) {
            throw new Error(`Cannot recalculate payroll in [${payroll.status}] status.`);
        }

        const profile = payroll.employee.payrollProfile;
        if (!profile) throw new Error("Employee has no payroll profile.");

        const { start_date, end_date } = payroll.period;

        // 3. Prefetch supporting data
        const [attendances, leaves, adjustments] = await Promise.all([
            Attendance.findAll({ where: { userId: payroll.employee_id, date: { [Op.between]: [start_date, end_date] } }, raw: true, transaction: t }),
            LeaveRequest.findAll({
                where: {
                    userId: payroll.employee_id, status: "approved",
                    [Op.or]: [
                        { startDate: { [Op.between]: [start_date, end_date] } },
                        { endDate: { [Op.between]: [start_date, end_date] } },
                    ]
                },
                include: [{ model: LeaveType, as: "leaveType", attributes: ["is_paid"] }],
                transaction: t
            }),
            PayrollAdjustment.findAll({ where: { employee_payroll_id: employeePayrollId }, raw: true, transaction: t }),
        ]);

        const flattenedLeaves = leaves.map(l => ({ ...l.get({ plain: true }), leaveTypePaid: l.leaveType.is_paid }));

        // 4. Run Calculation
        const results = _calculateCore(payroll, profile, attendances, flattenedLeaves, adjustments, payroll.period);

        // 5. Atomic Update with Optimistic Locking (manual version increment)
        const currentVersion = payroll.version || 0;
        const [updatedRows] = await EmployeePayroll.update(
            {
                ...results,
                version: currentVersion + 1,
                audit_log: [
                    ...(payroll.audit_log || []),
                    {
                        action: "recalculated",
                        timestamp: new Date(),
                        version: currentVersion + 1,
                        performedBy: performedBy ? performedBy.id : "system"
                    }
                ]
            },
            {
                where: { id: payroll.id, version: currentVersion },
                transaction: t
            }
        );


        if (updatedRows === 0) {
            throw new Error("Concurrency Conflict: Payroll was updated by another process. Please refresh.");
        }

        return await EmployeePayroll.findByPk(payroll.id, { transaction: t });
    });
};


/**
 * High-Performance Bulk Calculation for an entire Payroll Period with Locking
 */
const calculatePeriodPayroll = async (periodId, performedBy = null) => {
    return await sequelize.transaction(async (t) => {
        // 1. Lock the Period to prevent concurrent bulk jobs
        const period = await PayrollPeriod.findByPk(periodId, {
            lock: t.LOCK.UPDATE,
            transaction: t
        });
        if (!period) throw new Error("Period not found");
        if (["reviewed", "approved", "paid"].includes(period.status)) {
            throw new Error(`Cannot bulk calculate a period in [${period.status}] status.`);
        }

        // 2. Fetch all eligible payroll records
        const payrolls = await EmployeePayroll.findAll({
            where: {
                payroll_period_id: periodId,
                status: "draft",
                locked: false
            },
            include: [{
                model: User, as: "employee",
                include: [{ model: PayrollProfile, as: "payrollProfile" }]
            }],
            transaction: t
        });

        if (payrolls.length === 0) return { processed: 0 };

        const employeeIds = payrolls.map(p => p.employee_id);
        const payrollIds = payrolls.map(p => p.id);
        const { start_date, end_date } = period;

        // 3. Batch fetch all supporting data
        const [allAttendances, allLeaves, allAdjustments] = await Promise.all([
            Attendance.findAll({ where: { userId: employeeIds, date: { [Op.between]: [start_date, end_date] } }, raw: true, transaction: t }),
            LeaveRequest.findAll({
                where: {
                    userId: employeeIds, status: "approved",
                    [Op.or]: [
                        { startDate: { [Op.between]: [start_date, end_date] } },
                        { endDate: { [Op.between]: [start_date, end_date] } },
                    ]
                },
                include: [{ model: LeaveType, as: "leaveType", attributes: ["is_paid"] }],
                transaction: t
            }),
            PayrollAdjustment.findAll({ where: { employee_payroll_id: payrollIds }, raw: true, transaction: t })
        ]);

        // 4. Map & Group Data
        const attendanceMap = allAttendances.reduce((acc, curr) => {
            (acc[curr.userId] = acc[curr.userId] || []).push(curr);
            return acc;
        }, {});

        const leaveMap = allLeaves.reduce((acc, curr) => {
            const userId = curr.userId;
            const flattened = { ...curr.get({ plain: true }), leaveTypePaid: curr.leaveType.is_paid };
            (acc[userId] = acc[userId] || []).push(flattened);
            return acc;
        }, {});

        const adjustmentMap = allAdjustments.reduce((acc, curr) => {
            (acc[curr.employee_payroll_id] = acc[curr.employee_payroll_id] || []).push(curr);
            return acc;
        }, {});

        // 5. Build Updates with Versioning
        const updatePromises = [];
        for (const payroll of payrolls) {
            const profile = payroll.employee.payrollProfile;
            if (!profile) continue;

            const attendances = attendanceMap[payroll.employee_id] || [];
            const leaves = leaveMap[payroll.employee_id] || [];
            const adjustments = adjustmentMap[payroll.id] || [];

            const results = _calculateCore(payroll, profile, attendances, leaves, adjustments, period);

            const currentVersion = payroll.version || 0;
            updatePromises.push(
                EmployeePayroll.update(
                    {
                        ...results,
                        version: currentVersion + 1,
                        audit_log: [
                            ...(payroll.audit_log || []),
                            {
                                action: "bulk_recalculated",
                                timestamp: new Date(),
                                version: currentVersion + 1,
                                performedBy: performedBy ? performedBy.id : "system"
                            }
                        ]
                    },
                    {
                        where: { id: payroll.id, version: currentVersion, status: "draft" },
                        transaction: t
                    }
                )
            );
        }

        const results = await Promise.all(updatePromises);
        const processedCount = results.filter(([rows]) => rows > 0).length;

        console.log(`[Distributed] Bulk calculation finished. Processed: ${processedCount}/${payrolls.length}`);
        return { processed: processedCount };
    });
};


module.exports = {
    calculateEmployeePayroll,
    calculatePeriodPayroll,
    _calculateCore
};

