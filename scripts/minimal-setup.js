#!/usr/bin/env node

const { sequelize, User, Organization, SystemConfig } = require('../backend/models');

async function setupMinimal() {
  try {
    console.log('🚀 Setting up minimal TykBasic data...');
    
    // Connect to database  
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Create default organization
    const [defaultOrg] = await Organization.findOrCreate({
      where: { name: 'default' },
      defaults: {
        name: 'default',
        display_name: 'Default Organization',
        description: 'Default organization for TykBasic',
        tyk_org_id: 'default'
      }
    });
    console.log('✅ Default organization created/found');
    
    // Create admin user
    const [adminUser] = await User.findOrCreate({
      where: { email: 'admin@tykbasic.local' },
      defaults: {
        email: 'admin@tykbasic.local',
        password: 'admin123!', // Will be hashed automatically
        first_name: 'Admin',
        last_name: 'User',
        role: 'admin',
        organization_id: defaultOrg.id,
        is_verified: true,
        is_active: true
      }
    });
    console.log('✅ Admin user created/found (admin@tykbasic.local / admin123!)');
    
    console.log('\n🎉 Minimal setup complete!');
    console.log('\n📋 Getting Started:');
    console.log('   1. Login with: admin@tykbasic.local / admin123!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run setup
setupMinimal(); 