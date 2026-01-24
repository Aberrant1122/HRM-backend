const fs = require('fs');
const util = require('util');
const log_file = fs.createWriteStream(__dirname + '/debug.log', { flags: 'w' });
const log_stdout = process.stdout;

console.log = function (d) {
    log_file.write(util.format(d) + '\n');
    log_stdout.write(util.format(d) + '\n');
};
console.error = function (d) {
    log_file.write('ERROR: ' + util.format(d) + '\n');
    log_stdout.write('ERROR: ' + util.format(d) + '\n');
};

const { Sequelize } = require('sequelize');
const path = require('path');
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const config = require('../config/config.js')['development'];

const sequelize = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: false,
});

async function checkSchema() {
    try {
        const [results] = await sequelize.query('DESCRIBE daily_work_records;');
        console.log('Schema for daily_work_records:');

        // Custom table print for log file
        results.forEach(row => {
            console.log(JSON.stringify(row));
        });

        const taskIdColumn = results.find(col => col.Field === 'taskId');
        if (taskIdColumn) {
            console.log(`\ntaskId Nullable: ${taskIdColumn.Null}`);
            if (taskIdColumn.Null === 'NO') {
                console.error('CRITICAL: taskId is NOT NULLABLE in the database!');
            } else {
                console.log('taskId is nullable (Correct).');
            }
        } else {
            console.error('taskId column not found!');
        }

    } catch (error) {
        console.error('Error checking schema: ' + error.message);
    } finally {
        await sequelize.close();
    }
}

checkSchema();
