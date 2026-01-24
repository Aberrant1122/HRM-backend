const { sequelize } = require('../models');

/**
 * Ensures that the daily_work_records.taskId column is nullable.
 * This is a runtime fix to address persistent schema drift issues in production.
 */
const ensureSchema = async () => {
    try {
        console.log('🔧 Running startup schema check: Ensuring taskId is nullable...');

        // Execute raw ALTER TABLE command
        // Note: usage of MODIFY column is MySQL specific
        await sequelize.query('ALTER TABLE daily_work_records MODIFY COLUMN taskId INT NULL;');

        console.log('✅ Schema check passed: taskId is forced to be nullable.');
    } catch (error) {
        // Log error but don't crash the server - it might be that the column is already correct 
        // or there's a different DB issue. We want the server to start anyway.
        console.error('⚠️ Schema check warning: Could not force taskId nullability.', error.message);
    }
};

module.exports = { ensureSchema };
