const cron = require('node-cron');
const NotificationService = require('./notificationService');

class CronJobs {
  /**
   * Initialize all cron jobs
   * @param {Object} io - Socket.IO instance
   */
  static init(io) {
    let probationReminderRunning=false;
    cron.schedule('*/5 * * * *', async () => {
      if(probationReminderRunning)return; probationReminderRunning=true;
      try{await require('./probationReminderProducer').run(require('../models'));}
      catch{console.error('Probation expiry reminder generation failed');}
      finally{probationReminderRunning=false;}
    });
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

    // Clock expectations come only from explicit dated run settings and pinned schedules.
    // Never turn an unresolved/open punch into an absence or salary input.
    let clockRunning=false,clockCursor=0;
    const clockNotices=require('../services/attendanceClockNotices')(require('../models'));
    cron.schedule('*/5 * * * *',async()=>{
      if(clockRunning)return;clockRunning=true;
      try{const result=await clockNotices.produce({after:clockCursor});clockCursor=result.hasMore?result.lastId:0;if(result.issues.length)console.error('Some configured clock-alert sources require review');}
      catch{console.error('Configured clock-alert generation failed');}
      finally{clockRunning=false;}
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
