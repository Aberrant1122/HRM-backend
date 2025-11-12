/**
 * Script to check all users in the database
 * Run with: node check-users.js
 */

const { User } = require('./models');

async function checkUsers() {
  try {
    console.log('🔍 Checking all users in database...\n');

    const users = await User.scope('withSensitiveData').findAll({
      attributes: ['id', 'fullName', 'email', 'role', 'status', 'password'],
      order: [['createdAt', 'ASC']]
    });

    if (users.length === 0) {
      console.log('❌ No users found in database!');
      console.log('📝 Run: npx sequelize-cli db:seed:all');
      return;
    }

    console.log(`✅ Found ${users.length} user(s):\n`);
    
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.fullName}`);
      console.log(`   📧 Email: ${user.email}`);
      console.log(`   🎭 Role: ${user.role}`);
      console.log(`   📊 Status: ${user.status}`);
      console.log(`   🔐 Password Hash: ${user.password ? 'Set ✓' : 'Not Set ✗'}`);
      console.log('');
    });

    // Check for clients specifically
    const clients = users.filter(u => u.role === 'client');
    if (clients.length > 0) {
      console.log(`\n🎯 Found ${clients.length} client user(s):`);
      clients.forEach(client => {
        console.log(`   - ${client.fullName} (${client.email})`);
      });
    } else {
      console.log('\n⚠️  No client users found!');
      console.log('   Create a client by adding a project with client details.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkUsers();
