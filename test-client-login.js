/**
 * Test script to verify client user exists and can login
 * Run with: node test-client-login.js
 */

const { User } = require('./models');

async function testClientUser() {
  try {
    console.log('🔍 Checking for client user...\n');

    // Find client user
    const client = await User.findOne({
      where: { email: 'client@company.com' }
    });

    if (!client) {
      console.log('❌ Client user not found!');
      console.log('📝 Please run the seeder: npx sequelize-cli db:seed:all');
      return;
    }

    console.log('✅ Client user found!');
    console.log('📧 Email:', client.email);
    console.log('👤 Name:', client.fullName);
    console.log('🎭 Role:', client.role);
    console.log('📊 Status:', client.status);
    console.log('\n🔐 Login credentials:');
    console.log('   Email: client@company.com');
    console.log('   Password: Client@123');
    console.log('\n✨ You can now login with these credentials!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

testClientUser();
