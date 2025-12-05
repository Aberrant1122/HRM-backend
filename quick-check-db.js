const { UserInfo } = require('./models');

async function checkAttachments() {
  try {
    console.log('Checking UserInfo model...');
    
    // Get a sample record
    const sample = await UserInfo.findOne({
      order: [['id', 'DESC']],
      raw: true
    });
    
    console.log('\n📊 Sample UserInfo record:');
    console.log(JSON.stringify(sample, null, 2));
    
    if (sample) {
      console.log('\n✅ Attachments field:', sample.attachments);
      console.log('Type:', typeof sample.attachments);
      console.log('Is Array:', Array.isArray(sample.attachments));
    }
    
    // Check if attachments column exists in the model
    console.log('\n📋 UserInfo model attributes:');
    console.log(Object.keys(UserInfo.rawAttributes));
    
    if (UserInfo.rawAttributes.attachments) {
      console.log('\n✅ Attachments column is defined in model');
      console.log('Type:', UserInfo.rawAttributes.attachments.type.key);
    } else {
      console.log('\n❌ Attachments column is NOT defined in model');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkAttachments();
