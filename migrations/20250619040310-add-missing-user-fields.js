'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Add status column if it doesn't exist
      const statusColumn = await queryInterface.describeTable('users').status;
      if (!statusColumn) {
        await queryInterface.addColumn(
          'users',
          'status',
          {
            type: Sequelize.ENUM('active', 'inactive', 'suspended'),
            allowNull: false,
            defaultValue: 'inactive'
          },
          { transaction }
        );
        console.log('✅ Added status column to users table');
      }

      // Add resetToken column if it doesn't exist
      const resetTokenColumn = await queryInterface.describeTable('users').resetToken;
      if (!resetTokenColumn) {
        await queryInterface.addColumn(
          'users',
          'resetToken',
          {
            type: Sequelize.STRING,
            allowNull: true
          },
          { transaction }
        );
        console.log('✅ Added resetToken column to users table');
      }

      // Add resetTokenExpiry column if it doesn't exist
      const resetTokenExpiryColumn = await queryInterface.describeTable('users').resetTokenExpiry;
      if (!resetTokenExpiryColumn) {
        await queryInterface.addColumn(
          'users',
          'resetTokenExpiry',
          {
            type: Sequelize.DATE,
            allowNull: true
          },
          { transaction }
        );
        console.log('✅ Added resetTokenExpiry column to users table');
      }

      // Add lastLogin column if it doesn't exist
      const lastLoginColumn = await queryInterface.describeTable('users').lastLogin;
      if (!lastLoginColumn) {
        await queryInterface.addColumn(
          'users',
          'lastLogin',
          {
            type: Sequelize.DATE,
            allowNull: true
          },
          { transaction }
        );
        console.log('✅ Added lastLogin column to users table');
      }

      // Add passwordChangedAt column if it doesn't exist
      const passwordChangedAtColumn = await queryInterface.describeTable('users').passwordChangedAt;
      if (!passwordChangedAtColumn) {
        await queryInterface.addColumn(
          'users',
          'passwordChangedAt',
          {
            type: Sequelize.DATE,
            allowNull: true
          },
          { transaction }
        );
        console.log('✅ Added passwordChangedAt column to users table');
      }

      await transaction.commit();
      console.log('✅ Migration completed successfully');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Remove all added columns if they exist
      const columnsToRemove = [
        'status',
        'resetToken',
        'resetTokenExpiry',
        'lastLogin',
        'passwordChangedAt'
      ];

      for (const column of columnsToRemove) {
        const columnExists = await queryInterface.describeTable('users').then(columns => 
          columns.hasOwnProperty(column)
        );
        
        if (columnExists) {
          await queryInterface.removeColumn('users', column, { transaction });
          console.log(`✅ Removed ${column} column from users table`);
        }
      }

      await transaction.commit();
      console.log('✅ Rollback completed successfully');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};
