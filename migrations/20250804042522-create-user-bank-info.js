'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('userBankInfo', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      bankName: {
        type: Sequelize.STRING,
        allowNull: false
      },
      accountTitle: {
        type: Sequelize.STRING,
        allowNull: false
      },
      accountNumber: {
        type: Sequelize.STRING,
        allowNull: false
      },
      IBAN: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      branchCode: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      branchAddress: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    // Add indexes
    await queryInterface.addIndex('userBankInfo', ['userId'], { unique: true });
    await queryInterface.addIndex('userBankInfo', ['accountNumber']);
    await queryInterface.addIndex('userBankInfo', ['IBAN']);
  },

  async down(queryInterface, Sequelize) {
    // Drop indexes first
    await queryInterface.removeIndex('userBankInfo', ['userId']);
    await queryInterface.removeIndex('userBankInfo', ['accountNumber']);
    await queryInterface.removeIndex('userBankInfo', ['IBAN']);
    
    // Then drop the table
    await queryInterface.dropTable('userBankInfo');
  }
};
