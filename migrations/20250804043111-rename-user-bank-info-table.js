'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First check if the table exists with plural name
    const [results] = await queryInterface.sequelize.query(
      "SHOW TABLES LIKE 'userBankInfos'"
    );
    
    // If the plural table exists, rename it to singular
    if (results.length > 0) {
      await queryInterface.renameTable('userBankInfos', 'userBankInfo');
    }
  },

  async down(queryInterface, Sequelize) {
    // Revert the rename if needed
    await queryInterface.renameTable('userBankInfo', 'userBankInfos');
  }
};
