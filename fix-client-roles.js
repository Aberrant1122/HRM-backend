/**
 * Script to fix client user roles
 * This will find all users with clientEmail in projects and ensure they have role='client'
 * Run with: node fix-client-roles.js
 */

const { User, Project } = require('./models');

async function fixClientRoles() {
  try {
    console.log('🔍 Finding all projects with client emails...\n');

    // Get all projects with client emails
    const projects = await Project.findAll({
      where: {
        clientEmail: { [require('sequelize').Op.ne]: null }
      },
      attributes: ['id', 'name', 'clientName', 'clientEmail']
    });

    if (projects.length === 0) {
      console.log('ℹ️  No projects with client emails found.');
      process.exit(0);
    }

    console.log(`✅ Found ${projects.length} project(s) with client emails\n`);

    let fixedCount = 0;
    let alreadyCorrect = 0;
    let notFound = 0;

    for (const project of projects) {
      console.log(`📁 Project: ${project.name}`);
      console.log(`   Client: ${project.clientName} (${project.clientEmail})`);

      // Find user with this email
      const user = await User.findOne({
        where: { email: project.clientEmail }
      });

      if (!user) {
        console.log(`   ❌ User not found in database`);
        notFound++;
      } else if (user.role !== 'client') {
        console.log(`   🔧 Fixing role: "${user.role}" → "client"`);
        await user.update({ role: 'client' });
        fixedCount++;
        console.log(`   ✅ Role updated!`);
      } else {
        console.log(`   ✓ Role is already correct`);
        alreadyCorrect++;
      }
      console.log('');
    }

    console.log('═══════════════════════════════════════');
    console.log('Summary:');
    console.log(`  Fixed:           ${fixedCount}`);
    console.log(`  Already Correct: ${alreadyCorrect}`);
    console.log(`  Not Found:       ${notFound}`);
    console.log('═══════════════════════════════════════');

    if (fixedCount > 0) {
      console.log('\n✅ Client roles have been fixed!');
      console.log('   Try logging in again with your client credentials.');
    } else if (alreadyCorrect > 0) {
      console.log('\n✅ All client roles are correct!');
      console.log('   If login still fails, check:');
      console.log('   1. Browser console for debug logs');
      console.log('   2. Password is correct');
      console.log('   3. User status is "active"');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

fixClientRoles();
