const cron = require('node-cron');
const NotificationService = require('./notificationService');

class CronJobs {
  /**
   * Initialize all cron jobs
   * @param {Object} io - Socket.IO instance
   */
  static init(io) {
    // Run overdue task check every day at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
      console.log('Running overdue task notification job...');
      try {
        const notifications = await NotificationService.notifyOverdueTasks(io);
        console.log(`Sent ${notifications.length} overdue task notifications`);
      } catch (error) {
        console.error('Error in overdue task cron job:', error);
      }
    });

    // Auto mark absents for overdue clock-ins every hour
    cron.schedule('0 * * * *', async () => {
      console.log('Running auto-mark absents job...');
      try {
        const { Attendance } = require('../models');
        const { Op } = require('sequelize');
        const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const [updatedCount] = await Attendance.update(
          { status: "absent", totalHours: 0 },
          {
            where: {
              clockOut: null,
              clockIn: { [Op.lte]: threshold },
              status: { [Op.ne]: "absent" },
            },
          }
        );
        console.log(`Auto-marked ${updatedCount} overdue clock-ins as absent`);
      } catch (error) {
        console.error('Error in auto-mark absents cron job:', error);
      }
    });

    console.log('✅ Cron jobs initialized');
  }

  /**
   * Manually trigger overdue task notifications (for testing)
   * @param {Object} io - Socket.IO instance
   */
  static async triggerOverdueNotifications(io) {
    try {
      const notifications = await NotificationService.notifyOverdueTasks(io);
      return notifications;
    } catch (error) {
      console.error('Error triggering overdue notifications:', error);
      throw error;
    }
  }
}

module.exports = CronJobs;
