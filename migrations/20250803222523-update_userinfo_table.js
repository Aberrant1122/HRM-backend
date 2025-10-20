"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Rename designation column to position if it exists
    const tableDescription = await queryInterface.describeTable("Users");
    if (tableDescription.designation) {
      await queryInterface.renameColumn("Users", "designation", "position");
    }

    // Add reportingManager column if it doesn't exist
    if (!tableDescription.reportingManager) {
      await queryInterface.addColumn("Users", "reportingManager", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    // Add startDate column if it doesn't exist
    if (!tableDescription.startDate) {
      await queryInterface.addColumn("Users", "startDate", {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }

    // Make fields optional if they exist
    const updatePromises = [];

    if (tableDescription.address) {
      updatePromises.push(
        queryInterface.changeColumn('Users', 'address', {
          type: Sequelize.STRING,
          allowNull: true
        })
      );
    }

    if (tableDescription.probationEndDate) {
      updatePromises.push(
        queryInterface.changeColumn('Users', 'probationEndDate', {
          type: Sequelize.DATE,
          allowNull: true
        })
      );
    }

    if (tableDescription.dob) {
      updatePromises.push(
        queryInterface.changeColumn('Users', 'dob', {
          type: Sequelize.DATE,
          allowNull: true
        })
      );
    }

    if (tableDescription.team) {
      updatePromises.push(
        queryInterface.changeColumn('Users', 'team', {
          type: Sequelize.ENUM(
            "Royal Executive Limo (REL)",
            "MTM",
            "XCEL HVAC",
            "Ankadiversify",
            "ADS",
            "Team C2"
          ),
          allowNull: true
        })
      );
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    if (tableDescription.bankAccount) {
      await queryInterface.removeColumn("Users", "bankAccount");
    }
  },

  async down(queryInterface, Sequelize) {
    // Revert position back to designation
    const tableDescription = await queryInterface.describeTable("Users");
    if (tableDescription.position) {
      await queryInterface.renameColumn("Users", "position", "designation");
    }

    // Revert reportingManager changes
    if (tableDescription.reportingManager) {
      await queryInterface.changeColumn("Users", "reportingManager", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    // Add back bankAccount column if it was removed
    if (!tableDescription.bankAccount) {
      await queryInterface.addColumn("Users", "bankAccount", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    // Remove startDate column if it was added
    if (tableDescription.startDate) {
      await queryInterface.removeColumn("Users", "startDate");
    }
  },
};
