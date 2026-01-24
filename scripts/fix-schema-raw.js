const { Sequelize } = require('sequelize');
const path = require('path');
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const config = require('../config/config.js')['development'];

const sequelize = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: console.log,
});

async function fix() {
    try {
        console.log('Attempting to ALTER TABLE via raw SQL...');
        // Using MODIFY to change the column definition to allow NULL
        // Note: In MySQL, if you don't specify NOT NULL, it defaults to NULL
        await sequelize.query("ALTER TABLE daily_work_records MODIFY COLUMN taskId INT NULL;");
        console.log('Success: ALTER TABLE executed.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await sequelize.close();
    }
}

fix();
