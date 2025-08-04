'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('userInfo', 'position', {
      type: Sequelize.STRING,
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    // Note: We can't perfectly revert to ENUM without the original values
    // This is a best-effort revert that may need manual adjustment
    await queryInterface.changeColumn('userInfo', 'position', {
      type: Sequelize.ENUM(
        'Developer', 'Manager', 'HR', 'Designer', 'QA', 'Support',
        'Marketing Manager', 'Marketing Coordinator', 'Digital Marketing Specialist',
        'Brand Manager', 'Social Media Manager', 'Performance Marketing Manager',
        'Growth Marketer', 'SEO Analyst', 'SEO Manager', 'Technical SEO Specialist',
        'Content Writer', 'Content Strategist', 'Technical Writer', 'Blog Writer',
        'Scriptwriter', 'Editorial Writer', 'Proofreader & Editor', 'Other'
      ),
      allowNull: false
    });
  }
};
