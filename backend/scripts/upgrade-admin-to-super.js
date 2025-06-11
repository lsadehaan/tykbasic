const { User } = require('../models');

async function upgradeAdminToSuper() {
  try {
    console.log('🔧 Upgrading admin user to super_admin...');
    
    // Find the admin user by email
    const adminUser = await User.findOne({
      where: { 
        email: 'admin@tykbasic.local'
      }
    });

    if (!adminUser) {
      console.log('❌ Admin user not found. Available users:');
      const allUsers = await User.findAll({
        attributes: ['email', 'role'],
        order: [['email', 'ASC']]
      });
      
      allUsers.forEach(user => {
        console.log(`   📧 ${user.email} (${user.role})`);
      });
      
      console.log('\n💡 To upgrade a different user, modify the email in the script.');
      return;
    }

    console.log(`📋 Found user: ${adminUser.email} (current role: ${adminUser.role})`);

    if (adminUser.role === 'super_admin') {
      console.log('✅ User is already a super_admin!');
      return;
    }

    // Update to super_admin
    await adminUser.update({ role: 'super_admin' });
    
    console.log('🎉 Successfully upgraded user to super_admin!');
    console.log('✅ You can now delete organizations and manage all users.');
    
    // Verify the change
    await adminUser.reload();
    console.log(`🔍 Verified: ${adminUser.email} is now ${adminUser.role}`);

  } catch (error) {
    console.error('❌ Error upgrading user:', error.message);
    throw error;
  }
}

// Run the upgrade if this script is executed directly
if (require.main === module) {
  upgradeAdminToSuper()
    .then(() => {
      console.log('\n🚀 Upgrade complete! Please refresh your browser to see the changes.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

module.exports = upgradeAdminToSuper; 