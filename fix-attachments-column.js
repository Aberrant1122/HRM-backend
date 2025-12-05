const { Sequelize } = require('sequelize');
const { UserInfo } = require('./models');

async function fixAttachmentsColumn() {
  try {
    console.log('🔧 Fixing attachments column...\n');
    
    const sequelize = UserInfo.sequelize;
    
    // Step 1: Check current column type
    const [columnInfo] = await sequelize.query(`
      SELECT DATA_TYPE, COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'userInfo' 
        AND COLUMN_NAME = 'attachments';
    `);
    
    console.log('Current column info:', columnInfo[0]);
    
    // Step 2: Backup current data
    console.log('\n📦 Backing up current data...');
    const records = await UserInfo.findAll({
      where: {
        attachments: { [Sequelize.Op.ne]: null }
      },
      raw: true
    });
    
    console.log(`Found ${records.length} records with attachments`);
    
    // Step 3: Drop and recreate column as proper JSON
    console.log('\n🔄 Recreating column as JSON type...');
    await sequelize.query('ALTER TABLE userInfo DROP COLUMN attachments;');
    await sequelize.query('ALTER TABLE userInfo ADD COLUMN attachments JSON NULL;');
    
    console.log('✅ Column recreated as JSON type');
    
    // Step 4: Restore data with proper parsing
    console.log('\n📝 Restoring data...');
    for (const record of records) {
      try {
        let attachmentsData = record.attachments;
        
        // Try to parse if it's a string
        if (typeof attachmentsData === 'string') {
          // Remove extra escaping and parse
          try {
            attachmentsData = JSON.parse(attachmentsData);
          } catch (e) {
            console.log(`⚠️  Could not parse attachments for userId ${record.userId}, setting to empty array`);
            attachmentsData = [];
          }
        }
        
        // Ensure it's an array
        if (!Array.isArray(attachmentsData)) {
          attachmentsData = [];
        }
        
        // Filter out invalid entries and keep only proper objects
        attachmentsData = attachmentsData.filter(item => 
          item && typeof item === 'object' && item.filename && item.originalName
        );
        
        await sequelize.query(
          'UPDATE userInfo SET attachments = ? WHERE userId = ?',
          {
            replacements: [JSON.stringify(attachmentsData), record.userId],
            type: Sequelize.QueryTypes.UPDATE
          }
        );
        
        console.log(`✅ Restored ${attachmentsData.length} attachment(s) for userId ${record.userId}`);
      } catch (error) {
        console.error(`❌ Error restoring data for userId ${record.userId}:`, error.message);
      }
    }
    
    // Step 5: Verify the fix
    console.log('\n🔍 Verifying fix...');
    const sample = await UserInfo.findOne({
      where: {
        attachments: { [Sequelize.Op.ne]: null }
      },
      raw: true
    });
    
    if (sample) {
      console.log('\nSample record after fix:');
      console.log('Attachments:', sample.attachments);
      console.log('Type:', typeof sample.attachments);
      console.log('Is Array:', Array.isArray(sample.attachments));
      
      if (typeof sample.attachments === 'object' && Array.isArray(sample.attachments)) {
        console.log('\n✅ SUCCESS! Attachments are now properly stored as JSON arrays');
      } else {
        console.log('\n⚠️  Warning: Attachments may still need manual fixing');
      }
    }
    
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

fixAttachmentsColumn();
