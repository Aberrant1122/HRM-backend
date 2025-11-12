'use strict';

const bcrypt = require('bcryptjs');
const { User } = require('../models');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check if admin already exists
      const admin = await User.findOne({
        where: { email: 'admin@company.com' }
      });

      if (!admin) {
        const hashedPassword = await bcrypt.hash('Admin@123', 12);

        await User.create({
          fullName: 'Admin User',
          email: 'admin@company.com',
          password: hashedPassword,
          role: 'admin',
          status: 'active',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        console.log('✅ Admin user created successfully');
      } else {
        console.log('ℹ️  Admin user already exists');
      }

      // Check if employee test user already exists
      const employee = await User.findOne({
        where: { email: 'employee@company.com' }
      });

      if (!employee) {
        const hashedPassword = await bcrypt.hash('Employee@123', 12);

        await User.create({
          fullName: 'Employee User',
          email: 'employee@company.com',
          password: hashedPassword,
          role: 'employee',
          status: 'active',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        console.log('✅ Employee user created successfully');
      } else {
        console.log('ℹ️  Employee user already exists');
      }

      // Check if client test user already exists
      const client = await User.findOne({
        where: { email: 'client@company.com' }
      });

      if (!client) {
        const hashedPassword = await bcrypt.hash('Client@123', 12);

        await User.create({
          fullName: 'Client User',
          email: 'client@company.com',
          password: hashedPassword,
          role: 'client',
          status: 'active',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        console.log('✅ Client user created successfully');
      } else {
        console.log('ℹ️  Client user already exists');
      }
    } catch (error) {
      console.error('❌ Error in seed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.bulkDelete('users', {
        email: ['admin@company.com', 'employee@company.com', 'client@company.com']
      });
      console.log('✅ Test users removed');
    } catch (error) {
      console.error('❌ Error removing test users:', error);
      throw error;
    }
  }
};
