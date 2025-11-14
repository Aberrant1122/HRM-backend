'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'userInfo';
    const desc = await queryInterface.describeTable(table);

    if (desc.contactNumber) {
      await queryInterface.changeColumn(table, 'contactNumber', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (desc.startDate) {
      await queryInterface.changeColumn(table, 'startDate', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (desc.position) {
      await queryInterface.changeColumn(table, 'position', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (desc.salary) {
      await queryInterface.changeColumn(table, 'salary', {
        type: Sequelize.FLOAT,
        allowNull: true,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const table = 'userInfo';
    const desc = await queryInterface.describeTable(table);

    if (desc.contactNumber) {
      await queryInterface.changeColumn(table, 'contactNumber', {
        type: Sequelize.STRING,
        allowNull: false,
      });
    }

    if (desc.startDate) {
      await queryInterface.changeColumn(table, 'startDate', {
        type: Sequelize.DATE,
        allowNull: false,
      });
    }

    if (desc.position) {
      await queryInterface.changeColumn(table, 'position', {
        type: Sequelize.STRING,
        allowNull: false,
      });
    }

    if (desc.salary) {
      await queryInterface.changeColumn(table, 'salary', {
        type: Sequelize.FLOAT,
        allowNull: false,
      });
    }
  }
};