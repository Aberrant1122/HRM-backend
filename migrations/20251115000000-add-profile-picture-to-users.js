'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'profilePicture', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'URL or path to user profile picture stored in S3'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('users', 'profilePicture');
  }
};
