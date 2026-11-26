// TEST ONLY. Exact createPayrollPeriod function from local commit c8de51b9c1ae92f2a0ce44682f77c56295beb354.
// Original complete controller SHA256 bf221746226914465915e6b2c55ea0610477517cfea199efb01f5028b8036c61; no current guard/cohort substituted.
module.exports=m=>{const {PayrollPeriod,EmployeePayroll,PayrollProfile,User,sequelize}=m,{Op}=require("sequelize");
const createPayrollPeriod = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { name, startDate, endDate, payrollType } = req.body;

        // 1. Validate Input
        if (!name || !startDate || !endDate || !payrollType) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required fields: name, startDate, endDate, payrollType",
            });
        }

        // 2. Check for overlapping payroll periods
        const overlappingPeriod = await PayrollPeriod.findOne({
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
            where: {
                role: "employee",
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
            },
        };

        // Add warning about skipped employees if any
        if (employeesWithoutProfile.length > 0) {
            response.warning = `${employeesWithoutProfile.length} employee(s) skipped due to missing payroll profiles: ${employeesWithoutProfile.map(e => e.fullName).join(", ")}`;
        }

        return res.status(201).json(response);
    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error("Error generating payroll period:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate payroll period",
            error: process.env.NODE_ENV === "development" ? error.message : undefined,
        });
    }
};

return{createPayrollPeriod};};
