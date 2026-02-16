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
