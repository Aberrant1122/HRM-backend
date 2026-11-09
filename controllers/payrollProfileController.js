const { PayrollProfile, User, UserInfo } = require("../models");

// Get all payroll profiles (Admin only)
exports.getAllPayrollProfiles = async (req, res) => {
    try {
        const profiles = await PayrollProfile.findAll({
            include: [
                {
                    model: User,
                    as: "employee",
                    attributes: ["id", "fullName", "email", "role", "status"],
                },
            ],
            order: [["created_at", "DESC"]],
        });

        res.json({
            success: true,
            data: profiles,
        });
    } catch (error) {
        console.error("Error fetching payroll profiles:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch payroll profiles",
            error: error.message,
        });
    }
};

// Get employees without payroll profiles (Admin only)
exports.getEmployeesWithoutProfiles = async (req, res) => {
    res.setHeader('Cache-Control','private, no-store');
    try {
        const db=require('../models'),day=new Date().toISOString().slice(0,10);
        const result=await db.sequelize.transaction({isolationLevel:'REPEATABLE READ'},async transaction=>{
            const populationScope=await require('../services/legacyPopulationReview')(db).assertReconciled('profiles',{from:day,to:day,transaction,actor:req.user});
            const employees=await User.findAll({where:{...require('../utils/employeeCohort').where(),status:'active'},include:[{model:PayrollProfile,as:'payrollProfile',required:false},{model:UserInfo,as:'userInfo',attributes:['salary']}],transaction});
            return{populationScope,data:employees.filter(emp=>!emp.payrollProfile).map(emp=>({id:emp.id,fullName:emp.fullName,email:emp.email,role:emp.role,status:emp.status,salary:emp.userInfo?.salary||0}))};
        });
        return res.json({success:true,...result});
    } catch(error) {
        if(error.status)return res.status(error.status).json({success:false,message:error.message,code:error.code,review:error.review});
        return res.status(500).json({success:false,message:'Failed to fetch employees'});
    }
};
// Get payroll profile by employee ID
exports.getPayrollProfile = async (req, res) => {
    try {
        const { employeeId } = req.params;

        const profile = await PayrollProfile.findOne({
            where: { employee_id: employeeId },
            include: [
                {
                    model: User,
                    as: "employee",
                    attributes: ["id", "fullName", "email", "role"],
                },
            ],
        });

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: "Payroll profile not found",
            });
        }

        res.json({
            success: true,
            data: profile,
        });
    } catch (error) {
        console.error("Error fetching payroll profile:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch payroll profile",
            error: error.message,
        });
    }
};

// Get payroll profile by profile ID
exports.getPayrollProfileById = async (req, res) => {
    try {
        const { id } = req.params;

        const profile = await PayrollProfile.findByPk(id, {
            include: [
                {
                    model: User,
                    as: "employee",
                    attributes: ["id", "fullName", "email", "role"],
                },
            ],
        });

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: "Payroll profile not found",
            });
        }

        res.json({
            success: true,
            data: profile,
        });
    } catch (error) {
        console.error("Error fetching payroll profile:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch payroll profile",
            error: error.message,
        });
    }
};

// Create payroll profile (Admin only)
exports.createPayrollProfile = async (req, res) => {
    try {
        const {
            employee_id,
            salary_type,
            base_salary,
            standard_working_days,
            standard_working_hours,
            overtime_eligible,
            overtime_rate,
            late_penalty_rule,
            leave_deduction_rule,
            tax_percentage,
        } = req.body;

        // Check if employee exists
        const employee = await User.findByPk(employee_id);
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found",
            });
        }

        // Check if profile already exists
        const existingProfile = await PayrollProfile.findOne({
            where: { employee_id },
        });

        if (existingProfile) {
            return res.status(400).json({
                success: false,
                message: "Payroll profile already exists for this employee",
            });
        }

        // Create profile
        const profile = await PayrollProfile.create({
            employee_id,
            salary_type,
            base_salary,
            standard_working_days: standard_working_days || 22,
            standard_working_hours: standard_working_hours || 8,
            overtime_eligible: overtime_eligible || false,
            overtime_rate: overtime_rate || 0,
            late_penalty_rule: late_penalty_rule || null,
            leave_deduction_rule: leave_deduction_rule || null,
            tax_percentage: tax_percentage || 0,
        });

        const createdProfile = await PayrollProfile.findByPk(profile.id, {
            include: [
                {
                    model: User,
                    as: "employee",
                    attributes: ["id", "fullName", "email"],
                },
            ],
        });

        res.status(201).json({
            success: true,
            message: "Payroll profile created successfully",
            data: createdProfile,
        });
    } catch (error) {
        console.error("Error creating payroll profile:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create payroll profile",
            error: error.message,
        });
    }
};

// Update payroll profile (Admin only)
exports.updatePayrollProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            salary_type,
            base_salary,
            standard_working_days,
            standard_working_hours,
            overtime_eligible,
            overtime_rate,
            late_penalty_rule,
            leave_deduction_rule,
            tax_percentage,
        } = req.body;

        const profile = await PayrollProfile.findByPk(id);

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: "Payroll profile not found",
            });
        }

        await profile.update({
            salary_type,
            base_salary,
            standard_working_days,
            standard_working_hours,
            overtime_eligible,
            overtime_rate,
            late_penalty_rule,
            leave_deduction_rule,
            tax_percentage,
        });

        const updatedProfile = await PayrollProfile.findByPk(id, {
            include: [
                {
                    model: User,
                    as: "employee",
                    attributes: ["id", "fullName", "email"],
                },
            ],
        });

        res.json({
            success: true,
            message: "Payroll profile updated successfully",
            data: updatedProfile,
        });
    } catch (error) {
        console.error("Error updating payroll profile:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update payroll profile",
            error: error.message,
        });
    }
};

// Delete payroll profile (Admin only)
exports.deletePayrollProfile = async (req, res) => {
    try {
        const { id } = req.params;

        const profile = await PayrollProfile.findByPk(id);

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: "Payroll profile not found",
            });
        }

        await profile.destroy();

        res.json({
            success: true,
            message: "Payroll profile deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting payroll profile:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete payroll profile",
            error: error.message,
        });
    }
};
