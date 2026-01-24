const { Sequelize } = require('sequelize');
const path = require('path');
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const env = process.env.NODE_ENV || 'development';
console.log(`Current NODE_ENV: ${env}`);

const allConfigs = require('../config/config.js');
const config = allConfigs[env];

if (!config) {
    console.error(`No configuration found for environment: ${env}`);
    process.exit(1);
}

console.log(`Connecting to database to check schema...`);

let sequelize;
if (config.use_env_variable) {
    const dbUrl = process.env[config.use_env_variable];
    if (!dbUrl) {
        console.error(`Environment variable ${config.use_env_variable} is not defined.`);
        process.exit(1);
    }
    sequelize = new Sequelize(dbUrl, {
        ...config,
        dialect: 'mysql',
        logging: false
    });
} else {
    sequelize = new Sequelize(config.database, config.username, config.password, { ...config, logging: false });
}

async function checkSchema() {
    try {
        await sequelize.authenticate();
        console.log('Connection established.');

        const [results, metadata] = await sequelize.query("DESCRIBE daily_work_records;");
        console.log('\nSchema for daily_work_records:');
        console.table(results);

        const taskIdColumn = results.find(r => r.Field === 'taskId');
        if (taskIdColumn) {
            console.log(`\n\nCHECK RESULT: taskId Allow Null? -> ${taskIdColumn.Null}`);
            if (taskIdColumn.Null === 'YES') {
                console.log("STATUS: OK (Column is nullable)");
            } else {
                console.log("STATUS: FAIL (Column is NOT nullable)");
            }
        } else {
            console.log("STATUS: ERROR (Column taskId not found)");
        }

    } catch (error) {
        console.error('Error checking schema:', error);
    } finally {
        await sequelize.close();
    }
}

checkSchema();
