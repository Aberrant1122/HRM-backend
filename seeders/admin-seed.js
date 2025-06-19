"use strict";

const bcrypt = require("bcryptjs");

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if admin already exists
    const adminExists = await User.findOne({
      where: { email: "admin@company.com" },
    });

    if (results.length === 0) {
      const hashedPassword = await bcrypt.hash("Admin@123", 12);

      await User.create({
        fullName: "Admin User",
        email: "admin@company.com",
        password: hashedPassword,
        role: "admin",
        status: "active",
        emailVerified: true,
      });

      console.log("Admin user created successfully");
    } else {
      console.log("Admin user already exists");
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete("users", {
      email: "admin@company.com",
    });
  },
};
