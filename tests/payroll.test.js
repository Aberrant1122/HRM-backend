const { _calculateCore } = require("../utils/payrollService");
const { Decimal } = require("decimal.js");

/**
 * Minimal Test Harness
 */
const describe = (name, fn) => {
    console.log(`\nTesting: ${name}`);
    fn();
};

const assert = (condition, message) => {
    if (!condition) {
        console.error(`  ❌ FAILED: ${message}`);
        process.exit(1);
    } else {
        console.log(`  ✅ PASSED: ${message}`);
    }
};

const mockPeriod = {
    start_date: "2024-03-01",
    end_date: "2024-03-31"
};

const mockProfile = {
    salary_type: "monthly",
    base_salary: 50000,
    standard_working_days: 22,
    standard_working_hours: 8,
    overtime_eligible: true,
    overtime_rate: 500,
    late_penalty_rule: { penalty_per_late: 100 },
    tax_percentage: 5
};

describe("Payroll Logic - Monthly Salary", () => {

    describe("Scenario: Zero Attendance (Total Loss)", () => {
        const results = _calculateCore(null, mockProfile, [], [], [], mockPeriod);
        assert(new Decimal(results.net_salary).eq(0), "Net salary should be 0 when no days are worked or accounted for.");
        assert(new Decimal(results.total_deductions).gt(0), "Deductions should reflect missing days and tax.");
    });

    describe("Scenario: Working All Days (Perfect Attendance)", () => {
        const attendances = Array.from({ length: 22 }, (_, i) => ({
            status: "present",
            date: `2024-03-${i + 1}`,
            totalHours: 8
        }));
        const results = _calculateCore(null, mockProfile, attendances, [], [], mockPeriod);

        // Base 50000 - (50000 * 0.05 tax = 2500) = 47500
        assert(new Decimal(results.net_salary).eq(47500), "Perfect attendance should return base minus tax.");
    });

    describe("Scenario: All Unpaid Leaves", () => {
        const leaves = [{
            startDate: "2024-03-01",
            endDate: "2024-03-31",
            leaveTypePaid: false
        }];
        const results = _calculateCore(null, mockProfile, [], leaves, [], mockPeriod);
        assert(new Decimal(results.net_salary).eq(0), "Net salary should be 0 for full unpaid leave.");
    });

    describe("Scenario: Overtime Power User", () => {
        const attendances = [{
            status: "present",
            date: "2024-03-01",
            totalHours: 12 // 4 hours OT
        }];
        // Prorate logic for 1 day work + 4 hrs OT
        // Daily rate = 50000 / 22 = 2272.727...
        // Unpaid deduction = 21 days * 2272.727... = 47727.27...
        // OT Pay = 4 * 500 = 2000
        // Gross = 50000 + 2000 = 52000
        // Deductions = 47727.27 + 2500 (tax) = 50227.27
        // Net = 52000 - 50227.27 = 1772.73
        const results = _calculateCore(null, mockProfile, attendances, [], [], mockPeriod);
        assert(new Decimal(results.snapshot.overtimePay).eq(2000), "Overtime pay should be correctly calculated.");
        assert(new Decimal(results.net_salary).gt(0), "Salary should be positive with OT.");
    });

    describe("Scenario: Missing Records (Implicit Absence)", () => {
        // Only 10 days of attendance, no leaves
        const attendances = Array.from({ length: 10 }, (_, i) => ({
            status: "present",
            date: `2024-03-${i + 1}`,
            totalHours: 8
        }));
        const results = _calculateCore(null, mockProfile, attendances, [], [], mockPeriod);
        assert(new Decimal(results.snapshot.unaccountedDays).eq(12), "Should detect 12 unaccounted days.");
        assert(new Decimal(results.net_salary).lt(47500), "Salary should be reduced for missing days.");
    });

    describe("Validation Guards", () => {
        const invalidProfile = { ...mockProfile, base_salary: -100 };
        try {
            _calculateCore(null, invalidProfile, [], [], [], mockPeriod);
            assert(false, "Should have thrown error for negative salary.");
        } catch (e) {
            assert(e.message === "Base salary cannot be negative.", "Guard caught negative salary.");
        }
    });

});

describe("Payroll Logic - Hourly Salary", () => {
    const hourlyProfile = { ...mockProfile, salary_type: "hourly", base_salary: 1000 }; // 1000 per hour

    const attendances = [{
        status: "present",
        date: "2024-03-01",
        totalHours: 10 // 8 standard + 2 OT
    }];

    const results = _calculateCore(null, hourlyProfile, attendances, [], [], mockPeriod);
    // Gross = 10 * 1000 = 10000
    // OT = 2 * 500 = 1000
    // Net = 11000
    assert(new Decimal(results.net_salary).eq(11000), "Hourly calculation should sum worked hours correctly.");
});

console.log("\nAll financial system logic tests passed.");
