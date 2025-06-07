#!/usr/bin/env node

const { sequelize } = require('../backend/models');
const { User, Organization, EmailWhitelist, SystemConfig } = require('../backend/models');

async function setupDevelopment() {
  try {
    console.log('🚀 Setting up TykBasic development environment...');
    
    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Sync all models (create tables)
    await sequelize.sync({ force: false, alter: true });
    console.log('✅ Database tables created/updated');
    
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
    
    // Add email whitelist for development
    await EmailWhitelist.findOrCreate({
      where: { pattern: '*@tykbasic.local' },
      defaults: {
        pattern: '*@tykbasic.local',
        description: 'Local development emails',
        created_by: adminUser.id
      }
    });
    
    await EmailWhitelist.findOrCreate({
      where: { pattern: '*@localhost' },
      defaults: {
        pattern: '*@localhost',
        description: 'Localhost development emails',
        created_by: adminUser.id
      }
    });
    console.log('✅ Email whitelist patterns added');
    
    // Set up system configuration
    const configs = [
      { key: 'require_email_verification', value: false, description: 'Skip email verification in development' },
      { key: 'require_admin_approval', value: false, description: 'Auto-approve users in development' },
      { key: 'require_2fa', value: false, description: 'Optional 2FA in development' },
      { key: 'max_login_attempts', value: 10, description: 'Max login attempts before lockout' },
      { key: 'account_lockout_time', value: 900000, description: 'Account lockout time in milliseconds (15 min)' },
      { key: 'session_timeout', value: 24, description: 'Session timeout in hours' },
      { key: 'tyk_gateway_url', value: process.env.TYK_GATEWAY_URL || 'http://localhost:8080', description: 'Tyk Gateway URL' },
      { key: 'tyk_secret', value: process.env.TYK_SECRET || 'your-gateway-secret', description: 'Tyk Gateway secret' }
    ];
    
    for (const config of configs) {
      await SystemConfig.setValue(config.key, config.value, adminUser.id, config.description);
    }
    console.log('✅ System configuration initialized');
    
    console.log('\n🎉 Development environment setup complete!');
    console.log('\n📋 Getting Started:');
    console.log('   1. Start the development server: npm run dev');
    console.log('   2. Open http://localhost:3000 in your browser');
    console.log('   3. Login with: admin@tykbasic.local / admin123!');
    console.log('\n📊 Database Info:');
    console.log('   📁 SQLite file: data/tykbasic.sqlite');
    console.log('   🔍 View with: sqlite3 data/tykbasic.sqlite');
    console.log('\n🔧 Tyk Gateway:');
    console.log('   🌐 Gateway URL:', process.env.TYK_GATEWAY_URL || 'http://localhost:8080');
    console.log('   🔑 Secret:', process.env.TYK_SECRET || 'your-gateway-secret');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run setup
setupDevelopment(); 