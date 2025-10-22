'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('userInfo', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      contactNumber: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      address: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      startDate: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      department: {
        type: Sequelize.ENUM(
          'development',
          'design',
          'seo',
          'marketing',
          'content writing'
        ),
        allowNull: false,
        defaultValue: 'development',
      },
      probationEndDate: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      dob: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      reportingManager: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      cnic: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      employmentStatus: {
        type: Sequelize.ENUM(
          'permanent',
          'contract',
          'internship',
          'terminated',
          'probation'
        ),
        allowNull: false,
        defaultValue: 'permanent',
      },
      salary: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },
      position: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      team: {
        type: Sequelize.ENUM(
          'Royal Executive Limo (REL)',
          'MTM',
          'XCEL HVAC',
          'Ankadiversify',
          'ADS',
          'Team C2'
        ),
        allowNull: true,
        defaultValue: null,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('userInfo');
  },
};
