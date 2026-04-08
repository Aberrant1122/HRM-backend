'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const safeAddIndex = async (tableName, columns, options = {}) => {
      try {
        const indexes = await queryInterface.showIndex(tableName);
        const indexName = options.name || `${tableName}_${columns.join('_')}`;
        const exists = indexes.some(idx => idx.name === indexName);

        if (!exists) {
          await queryInterface.addIndex(tableName, columns, options);
          console.log(`Index ${indexName} added to ${tableName}`);
        } else {
          console.log(`Index ${indexName} already exists on ${tableName}, skipping.`);
        }
      } catch (error) {
        console.warn(`Could not check/add index for ${tableName}:`, error.message);
      }
    };

    // Composite index for faster attendance lookups
    await safeAddIndex('attendances', ['userId', 'date'], {
      name: 'attendances_userId_date_idx'
    });

    // Composite index for finding active clock-ins (used in check-out)
    await safeAddIndex('attendances', ['userId', 'date', 'clockOut'], {
      name: 'attendances_active_session_idx'
    });

    // Index for auto-marking absents
    await safeAddIndex('attendances', ['clockOut', 'clockIn', 'status'], {
      name: 'attendances_automark_idx'
    });

    // Indexes for DailyWorkRecord
    await safeAddIndex('daily_work_records', ['userId', 'date'], {
      name: 'daily_work_records_user_date_idx'
    });
    await safeAddIndex('daily_work_records', ['attendanceId'], {
      name: 'daily_work_records_attendance_idx'
    });
  },

  async down(queryInterface, Sequelize) {
    const safeRemoveIndex = async (tableName, indexName) => {
      try {
        const indexes = await queryInterface.showIndex(tableName);
        const exists = indexes.some(idx => idx.name === indexName);

        if (exists) {
          await queryInterface.removeIndex(tableName, indexName);
          console.log(`Index ${indexName} removed from ${tableName}`);
        }
      } catch (error) {
        console.warn(`Could not check/remove index for ${tableName}:`, error.message);
      }
    };

    await safeRemoveIndex('attendances', 'attendances_userId_date_idx');
    await safeRemoveIndex('attendances', 'attendances_active_session_idx');
    await safeRemoveIndex('attendances', 'attendances_automark_idx');
    await safeRemoveIndex('daily_work_records', 'daily_work_records_user_date_idx');
    await safeRemoveIndex('daily_work_records', 'daily_work_records_attendance_idx');
  }
};
