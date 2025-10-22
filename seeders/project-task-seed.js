'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // First, create some sample projects
    const projects = await queryInterface.bulkInsert('projects', [
      {
        name: 'Website Redesign',
        description: 'Complete redesign of the company website with modern UI/UX',
        status: 'active',
        priority: 'high',
        startDate: new Date('2025-01-15'),
        endDate: new Date('2025-03-15'),
        budget: 15000.00,
        managerId: 1, // Assuming admin user with ID 1
        clientName: 'Internal',
        clientEmail: 'admin@company.com',
        tags: JSON.stringify(['design', 'frontend', 'ui-ux']),
        attachments: JSON.stringify([]),
        progress: 35,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Mobile App Development',
        description: 'Develop a mobile application for employee management',
        status: 'planning',
        priority: 'medium',
        startDate: new Date('2025-02-01'),
        endDate: new Date('2025-05-01'),
        budget: 25000.00,
        managerId: 1,
        clientName: 'Internal',
        clientEmail: 'admin@company.com',
        tags: JSON.stringify(['mobile', 'development', 'employee-management']),
        attachments: JSON.stringify([]),
        progress: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Database Optimization',
        description: 'Optimize database performance and implement caching',
        status: 'active',
        priority: 'urgent',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-02-28'),
        budget: 8000.00,
        managerId: 1,
        clientName: 'Internal',
        clientEmail: 'admin@company.com',
        tags: JSON.stringify(['database', 'performance', 'optimization']),
        attachments: JSON.stringify([]),
        progress: 60,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], { returning: true });

    // Get the project IDs for task creation (assuming auto-increment starts from 1)
    const projectIds = [1, 2, 3];

    // Create sample tasks for each project
    await queryInterface.bulkInsert('tasks', [
      // Website Redesign Tasks
      {
        title: 'Design Homepage Layout',
        description: 'Create wireframes and mockups for the new homepage design',
        status: 'completed',
        priority: 'high',
        dueDate: new Date('2025-01-25'),
        startDate: new Date('2025-01-15'),
        completedDate: new Date('2025-01-20'),
        estimatedHours: 16.0,
        actualHours: 14.5,
        assigneeId: null, // Assuming employee user with ID 2
        projectId: projectIds[0],
        createdBy: 1,
        tags: JSON.stringify(['design', 'wireframes', 'homepage']),
        attachments: JSON.stringify([]),
        comments: JSON.stringify([
          { userId: 1, comment: 'Great work on the layout!', timestamp: new Date() }
        ]),
        progress: 100,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'Implement Responsive Navigation',
        description: 'Build the responsive navigation menu with mobile-first approach',
        status: 'in-progress',
        priority: 'high',
        dueDate: new Date('2025-02-05'),
        startDate: new Date('2025-01-22'),
        estimatedHours: 20.0,
        actualHours: 12.0,
        assigneeId: null,
        projectId: projectIds[0],
        createdBy: 1,
        tags: JSON.stringify(['frontend', 'responsive', 'navigation']),
        attachments: JSON.stringify([]),
        comments: JSON.stringify([
          { userId: 2, comment: 'Working on mobile menu interactions', timestamp: new Date() }
        ]),
        progress: 60,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'Content Management System',
        description: 'Develop admin panel for content management',
        status: 'pending',
        priority: 'medium',
        dueDate: new Date('2025-02-20'),
        estimatedHours: 32.0,
        assigneeId: null, // Assuming another employee user
        projectId: projectIds[0],
        createdBy: 1,
        tags: JSON.stringify(['backend', 'admin-panel', 'cms']),
        attachments: JSON.stringify([]),
        comments: JSON.stringify([]),
        progress: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // Mobile App Development Tasks
      {
        title: 'Project Requirements Analysis',
        description: 'Analyze and document requirements for the mobile app',
        status: 'in-progress',
        priority: 'medium',
        dueDate: new Date('2025-02-15'),
        startDate: new Date('2025-02-01'),
        estimatedHours: 24.0,
        actualHours: 8.0,
        assigneeId: null,
        projectId: projectIds[1],
        createdBy: 1,
        tags: JSON.stringify(['planning', 'requirements', 'analysis']),
        attachments: JSON.stringify([]),
        comments: JSON.stringify([
          { userId: 1, comment: 'Starting stakeholder interviews', timestamp: new Date() }
        ]),
        progress: 33,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'UI/UX Design',
        description: 'Create user interface designs and user experience flows',
        status: 'pending',
        priority: 'high',
        dueDate: new Date('2025-02-28'),
        estimatedHours: 40.0,
        assigneeId: null,
        projectId: projectIds[1],
        createdBy: 1,
        tags: JSON.stringify(['design', 'ui-ux', 'mobile']),
        attachments: JSON.stringify([]),
        comments: JSON.stringify([]),
        progress: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // Database Optimization Tasks
      {
        title: 'Performance Analysis',
        description: 'Analyze current database performance and identify bottlenecks',
        status: 'completed',
        priority: 'urgent',
        dueDate: new Date('2025-01-15'),
        startDate: new Date('2025-01-01'),
        completedDate: new Date('2025-01-10'),
        estimatedHours: 16.0,
        actualHours: 18.0,
        assigneeId: null,
        projectId: projectIds[2],
        createdBy: 1,
        tags: JSON.stringify(['analysis', 'performance', 'database']),
        attachments: JSON.stringify([]),
        comments: JSON.stringify([
          { userId: 3, comment: 'Found several slow queries that need optimization', timestamp: new Date() }
        ]),
        progress: 100,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'Query Optimization',
        description: 'Optimize slow database queries and add proper indexing',
        status: 'in-progress',
        priority: 'urgent',
        dueDate: new Date('2025-02-15'),
        startDate: new Date('2025-01-12'),
        estimatedHours: 24.0,
        actualHours: 16.0,
        assigneeId: null,
        projectId: projectIds[2],
        createdBy: 1,
        tags: JSON.stringify(['optimization', 'queries', 'indexing']),
        attachments: JSON.stringify([]),
        comments: JSON.stringify([
          { userId: 3, comment: 'Optimized 5 slow queries, working on indexing strategy', timestamp: new Date() }
        ]),
        progress: 67,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'Implement Caching Layer',
        description: 'Add Redis caching for frequently accessed data',
        status: 'pending',
        priority: 'high',
        dueDate: new Date('2025-02-28'),
        estimatedHours: 20.0,
        assigneeId: null,
        projectId: projectIds[2],
        createdBy: 1,
        tags: JSON.stringify(['caching', 'redis', 'performance']),
        attachments: JSON.stringify([]),
        comments: JSON.stringify([]),
        progress: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    // Remove tasks first (due to foreign key constraints)
    await queryInterface.bulkDelete('tasks', null, {});
    // Remove projects
    await queryInterface.bulkDelete('projects', null, {});
  }
};
