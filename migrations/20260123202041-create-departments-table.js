'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('departments', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    // Insert default departments
    await queryInterface.bulkInsert('departments', [
      { name: 'Development', description: 'Software development and engineering', isActive: true },
      { name: 'Design', description: 'UI/UX design and creative services', isActive: true },
      { name: 'Marketing', description: 'Marketing and promotional activities', isActive: true },
      { name: 'Human Resources', description: 'HR management and employee relations', isActive: true },
      { name: 'Sales', description: 'Sales and business development', isActive: true },
      { name: 'Finance', description: 'Financial management and accounting', isActive: true },
      { name: 'Operations', description: 'Operations and process management', isActive: true },
      { name: 'Customer Support', description: 'Customer service and support', isActive: true },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('departments');
  },
};
