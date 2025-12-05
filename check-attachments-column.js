const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: console.log,
  }
);

async function checkAttachmentsColumn() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');

    // Check if attachments column exists
    const [results] = await sequelize.query(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
        AND TABLE_NAME = 'userInfo'
        AND COLUMN_NAME = 'attachments';
    `);

    if (results.length > 0) {
      console.log('✅ Attachments column exists in userInfo table:');
      console.log(results[0]);
    } else {
      console.log('❌ Attachments column does NOT exist in userInfo table!');
      console.log('Run this SQL to add it:');
      console.log(`
ALTER TABLE userInfo 
ADD COLUMN attachments JSON NULL DEFAULT NULL;
      `);
    }

    // Check sample data
    const [sampleData] = await sequelize.query(`
      SELECT id, userId, attachments 
      FROM userInfo 
      LIMIT 5;
    `);
    
    console.log('\n📊 Sample userInfo data:');
    console.log(JSON.stringify(sampleData, null, 2));

    await sequelize.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAttachmentsColumn();
