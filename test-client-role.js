/**
 * Script to test client user creation and role verification
 * Run with: node test-client-role.js <client-email>
 */

const { User } = require('./models');
const bcrypt = require('bcryptjs');

async function testClientRole() {
  try {
    const clientEmail = process.argv[2];
    
    if (!clientEmail) {
      console.log('❌ Please provide client email as argument');
      console.log('   Usage: node test-client-role.js client@example.com');
      process.exit(1);
    }

    console.log(`🔍 Checking user with email: ${clientEmail}\n`);

    // Find user with sensitive data
    const user = await User.scope('withSensitiveData').findOne({
      where: { email: clientEmail }
    });

    if (!user) {
      console.log('❌ User not found!');
      console.log('   Make sure you created a project with this client email.');
      process.exit(1);
    }

    console.log('✅ User found!\n');
    console.log('User Details:');
    console.log('─────────────────────────────────────');
    console.log(`ID:           ${user.id}`);
    console.log(`Full Name:    ${user.fullName}`);
    console.log(`Email:        ${user.email}`);
    console.log(`Role:         ${user.role} ${user.role === 'client' ? '✓' : '✗ WRONG!'}`);
    console.log(`Status:       ${user.status}`);
    console.log(`Password Set: ${user.password ? 'Yes ✓' : 'No ✗'}`);
    console.log(`Created:      ${user.createdAt}`);
    console.log('─────────────────────────────────────\n');

    if (user.role !== 'client') {
      console.log('🚨 PROBLEM FOUND!');
      console.log(`   Expected role: "client"`);
      console.log(`   Actual role:   "${user.role}"`);
      console.log('\n💡 Fixing the role...');
      
      await user.update({ role: 'client' });
      console.log('✅ Role updated to "client"');
      console.log('   Try logging in again!');
    } else {
      console.log('✅ Role is correct!');
      console.log('   If login still redirects to employee dashboard,');
      console.log('   check the browser console for debug logs.');
    }

    // Test password if provided
    const testPassword = process.argv[3];
    if (testPassword && user.password) {
      console.log(`\n🔐 Testing password...`);
      const isMatch = await bcrypt.compare(testPassword, user.password);
      if (isMatch) {
        console.log('✅ Password is correct!');
      } else {
        console.log('❌ Password does not match!');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

testClientRole();
