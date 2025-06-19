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
    } catch (error) {
      console.error('❌ Error in admin seed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.bulkDelete('users', {
        email: 'admin@company.com'
      });
      console.log('✅ Admin user removed');
    } catch (error) {
      console.error('❌ Error removing admin user:', error);
      throw error;
    }
  }
};
