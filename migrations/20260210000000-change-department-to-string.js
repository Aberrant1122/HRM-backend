"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.changeColumn('userInfo', 'department', {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: "development",
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.changeColumn('userInfo', 'department', {
            type: Sequelize.ENUM(
                "development",
                "design",
                "seo",
                "marketing",
                "content writing",
                "client"
            ),
            allowNull: true,
            defaultValue: "development",
        });
    }
};
