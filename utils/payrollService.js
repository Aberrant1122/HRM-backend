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
// Live recalculation verifies retained, explicitly reviewed inputs. Legacy inferred-day math
// above remains only for historical pure calculation inspection; it cannot write live payroll.
const calculateEmployeePayroll = async (id, performedBy = null) =>
    require('./reviewedPayrollGuard').verifySingle(require('../models'),id,performedBy);
const calculatePeriodPayroll = async (id, performedBy = null) =>
    require('./reviewedPayrollGuard').verifyPeriod(require('../models'),id,performedBy);

module.exports = {
    calculateEmployeePayroll,
    calculatePeriodPayroll,
    _calculateCore
};

