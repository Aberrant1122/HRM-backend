'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('userInfo', 'companyName', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'address'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('userInfo', 'companyName');
  }
};
