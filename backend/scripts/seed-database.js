const bcrypt = require('bcrypt');
const { sequelize, User, Organization, EmailWhitelist, SystemConfig } = require('../models');

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');

    // Sync database first
    await sequelize.sync({ force: false, alter: true });
    console.log('✅ Database synchronized');

    // Create default organization
    const [defaultOrg] = await Organization.findOrCreate({
      where: { name: 'default' },
      defaults: {
        name: 'default',
        display_name: 'Default Organization',
        description: 'Default organization for TykBasic users',
        status: 'active',
        settings: {
          allowSelfRegistration: true,
          requireEmailVerification: false,
          defaultUserRole: 'user'
        }
      }
    });
    console.log(`✅ Default organization: ${defaultOrg.display_name}`);

    // Create admin organization
    const [adminOrg] = await Organization.findOrCreate({
      where: { name: 'admin' },
      defaults: {
        name: 'admin',
        display_name: 'TykBasic Administrators',
        description: 'Administrative organization for TykBasic system administrators',
        status: 'active',
        settings: {
          allowSelfRegistration: false,
          requireEmailVerification: false,
          defaultUserRole: 'admin'
        }
      }
    });
    console.log(`✅ Admin organization: ${adminOrg.display_name}`);

    // Create default admin user
    const adminPassword = 'admin123!';

    const [adminUser] = await User.findOrCreate({
      where: { email: 'admin@tykbasic.local' },
      defaults: {
        email: 'admin@tykbasic.local',
        password: adminPassword, // Will be hashed by the model hook
        first_name: 'Admin',
        last_name: 'User',
        role: 'admin',
        is_active: true,
        organization_id: adminOrg.id,
        is_verified: true,
        preferences: {
          theme: 'light',
          notifications: true,
          timezone: 'UTC'
        }
      }
    });
    console.log(`✅ Admin user created: ${adminUser.email}`);

    // Create test user
    const testPassword = 'test123!';

    const [testUser] = await User.findOrCreate({
      where: { email: 'test@tykbasic.local' },
      defaults: {
        email: 'test@tykbasic.local',
        password: testPassword, // Will be hashed by the model hook
        first_name: 'Test',
        last_name: 'User',
        role: 'user',
        is_active: true,
        organization_id: defaultOrg.id,
        is_verified: true,
        preferences: {
          theme: 'light',
          notifications: true,
          timezone: 'UTC'
        }
      }
    });
    console.log(`✅ Test user created: ${testUser.email}`);

    // Create email whitelist entries
    const whitelistEntries = [
      { pattern: '*@tykbasic.local', description: 'Local development emails' },
      { pattern: '*@localhost', description: 'Localhost emails' },
      { pattern: '*@example.com', description: 'Example domain' }
    ];

    for (const entry of whitelistEntries) {
      const [whitelist] = await EmailWhitelist.findOrCreate({
        where: { pattern: entry.pattern },
        defaults: {
          pattern: entry.pattern,
          description: entry.description,
          is_active: true,
          created_by: adminUser.id
        }
      });
      console.log(`✅ Email whitelist: ${whitelist.pattern}`);
    }

    // System Configuration
    console.log('🔧 Setting up system configuration...');
    const systemConfigs = await SystemConfig.bulkCreate([
      {
        key: 'app_name',
        value: 'TykBasic',
        description: 'Application name',
        category: 'general'
      },
      {
        key: 'app_version',
        value: '1.0.0',
        description: 'Application version',
        category: 'general'
      },
      {
        key: 'max_login_attempts',
        value: '5',
        description: 'Maximum failed login attempts before account lockout',
        category: 'security'
      },
      {
        key: 'session_timeout',
        value: '24',
        description: 'Session timeout in hours',
        category: 'security'
      },
      {
        key: 'enable_registration',
        value: 'true',
        description: 'Allow new user registration',
        category: 'auth'
      },
      {
        key: 'require_email_verification',
        value: 'false',
        description: 'Require email verification for new accounts',
        category: 'auth'
      },
      {
        key: 'tyk_gateway_url',
        value: process.env.TYK_GATEWAY_URL || 'http://localhost:8080',
        description: 'Tyk Gateway base URL',
        category: 'tyk'
      },
      {
        key: 'tyk_gateway_secret',
        value: process.env.TYK_GATEWAY_SECRET || 'your-admin-secret',
        description: 'Tyk Gateway API secret key',
        category: 'tyk'
      },
      {
        key: 'tyk_auto_reload',
        value: 'true',
        description: 'Automatically reload gateway after API changes',
        category: 'tyk'
      }
    ], { ignoreDuplicates: true });

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📋 Test Credentials:');
    console.log(`👑 Admin: admin@tykbasic.local / ${adminPassword}`);
    console.log(`👤 User:  test@tykbasic.local / ${testPassword}`);
    console.log('\n🔗 Access URLs:');
    console.log('Frontend: http://localhost:3000');
    console.log('Backend:  http://localhost:3001');

  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    throw error;
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('✅ Seeding script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding script failed:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase }; 