"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
    class EmployeePayroll extends Model {
        static associate(models) {
            EmployeePayroll.belongsTo(models.PayrollPeriod, {
                foreignKey: "payroll_period_id",
                as: "period",
                onDelete: "CASCADE",
                onUpdate: "CASCADE",
            });
            EmployeePayroll.belongsTo(models.User, {
                foreignKey: "employee_id",
                as: "employee",
                onDelete: "CASCADE",
                onUpdate: "CASCADE",
            });
            EmployeePayroll.hasMany(models.PayrollAdjustment, {
                foreignKey: "employee_payroll_id",
                as: "adjustments",
            });
        }

        /**
         * Verifies the cryptographic integrity of the calculation snapshot.
         */
        verifyIntegrity() {
            const crypto = require("crypto");
            if (!this.snapshot || !this.snapshot_hash) return false;
            const currentHash = crypto.createHash("sha256").update(JSON.stringify(this.snapshot)).digest("hex");
            return currentHash === this.snapshot_hash;
        }
    }

    EmployeePayroll.init(
        {
            payroll_period_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: "payroll_periods",
                    key: "id",
                },
            },
            employee_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: "users",
                    key: "id",
                },
            },
            gross_salary: {
                type: DataTypes.DECIMAL(12, 2),
                allowNull: false,
            },
            total_deductions: {
                type: DataTypes.DECIMAL(12, 2),
                allowNull: false,
            },
            net_salary: {
                type: DataTypes.DECIMAL(12, 2),
                allowNull: false,
            },
            snapshot: {
                type: DataTypes.JSON,
                allowNull: false,
            },
            snapshot_hash: {
                type: DataTypes.STRING(64),
                allowNull: true,
            },
            status: {
                type: DataTypes.ENUM("draft", "reviewed", "approved", "paid"),
                allowNull: false,
                defaultValue: "draft",
            },
            locked: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },
            version: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            audit_log: {
                type: DataTypes.JSON,
                allowNull: true,
                defaultValue: [],
            },
        },
        {
            sequelize,
            modelName: "EmployeePayroll",
            tableName: "employee_payrolls",
            underscored: true,
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            defaultScope: {
                attributes: { exclude: ["snapshot", "snapshot_hash", "audit_log"] }
            },
            scopes: {
                full: { attributes: {} }, // Include everything
                summary: {
                    attributes: ["id", "employee_id", "payroll_period_id", "gross_salary", "total_deductions", "net_salary", "status", "locked", "snapshot"]
                }
            },
            hooks: {
                beforeUpdate: (payroll) => {
                    const finalizedStatuses = ["approved", "paid"];
                    const wasFinalized = finalizedStatuses.includes(payroll.previous("status")) || payroll.previous("locked");

                    if (wasFinalized) {
                        // Snapshot data is ALWAYS immutable once finalized
                        if (payroll.changed("snapshot") || payroll.changed("snapshot_hash")) {
                            throw new Error("Security Violation: Calculation snapshots are immutable once payroll is finalized.");
                        }

                        // Financial totals can only change IF an audit log entry is added (indicates manual adjustment)
                        if (payroll.changed("net_salary") || payroll.changed("gross_salary") || payroll.changed("total_deductions")) {
                            if (!payroll.changed("audit_log")) {
                                throw new Error("Security Violation: Manual salary overrides must be accompanied by an audit log entry.");
                            }
                        }
                    }
                }
            },

            indexes: [
                {
                    unique: true,
                    fields: ["employee_id", "payroll_period_id"],
                    name: "unique_employee_period"
                },
                {
                    fields: ["status"],
                    name: "idx_payroll_status"
                },
                {
                    fields: ["locked"],
                    name: "idx_payroll_locked"
                }
            ]
        }

    );

    return EmployeePayroll;
};
