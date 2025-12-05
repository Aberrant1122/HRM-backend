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

async function addAttachmentsColumn() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');

    // Check if column exists first
    const [results] = await sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
        AND TABLE_NAME = 'userInfo'
        AND COLUMN_NAME = 'attachments';
    `);

    if (results.length > 0) {
      console.log('✅ Attachments column already exists!');
    } else {
      console.log('Adding attachments column...');
      
      await sequelize.query(`
        ALTER TABLE userInfo 
        ADD COLUMN attachments JSON NULL;
      `);
      
      console.log('✅ Attachments column added successfully!');
    }

    // Initialize empty arrays for existing records
    await sequelize.query(`
      UPDATE userInfo 
      SET attachments = '[]' 
      WHERE attachments IS NULL;
    `);
    
    console.log('✅ Initialized attachments for existing records.');

    await sequelize.close();
    console.log('\n✅ Done! You can now upload attachments.');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

addAttachmentsColumn();
