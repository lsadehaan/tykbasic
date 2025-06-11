const { sequelize } = require('../config/database');

async function runMigration() {
  try {
    console.log('🔄 Starting policy-based access control migration...');

    // Create policies table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_by_user_id INTEGER REFERENCES users(id),
        owner_organization_id INTEGER REFERENCES organizations(id),
        target_organization_id INTEGER REFERENCES organizations(id),
        tyk_policy_id TEXT UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        rate_limit INTEGER DEFAULT 1000,
        rate_per INTEGER DEFAULT 60,
        quota_max INTEGER DEFAULT -1,
        quota_renewal_rate INTEGER DEFAULT 3600,
        
        policy_data TEXT,
        tags TEXT,
        
        UNIQUE(owner_organization_id, name)
      )
    `);
    console.log('✅ Created policies table');

    // Create policy_api_access table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS policy_api_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id INTEGER REFERENCES policies(id) ON DELETE CASCADE,
        api_id TEXT NOT NULL,
        api_name TEXT,
        api_organization_id INTEGER REFERENCES organizations(id),
        versions TEXT DEFAULT '["Default"]',
        allowed_urls TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(policy_id, api_id)
      )
    `);
    console.log('✅ Created policy_api_access table');

    // Create organization_available_policies table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS organization_available_policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER REFERENCES organizations(id),
        policy_id INTEGER REFERENCES policies(id),
        is_active BOOLEAN DEFAULT TRUE,
        assigned_by_user_id INTEGER REFERENCES users(id),
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(organization_id, policy_id)
      )
    `);
    console.log('✅ Created organization_available_policies table');

    // Update user_credentials table
    // First check if api_key_data column exists
    const [tableInfo] = await sequelize.query(`PRAGMA table_info(user_credentials)`);
    const hasApiKeyData = tableInfo.some(col => col.name === 'api_key_data');
    
    if (hasApiKeyData) {
      // SQLite doesn't support DROP COLUMN, so we'll ignore this for now
      console.log('⚠️  Note: api_key_data column still exists (SQLite limitation)');
    }

    // Add new policy columns to user_credentials
    try {
      await sequelize.query(`ALTER TABLE user_credentials ADD COLUMN tyk_policy_id TEXT`);
      console.log('✅ Added tyk_policy_id column to user_credentials');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        throw error;
      }
      console.log('⚠️  tyk_policy_id column already exists');
    }

    try {
      await sequelize.query(`ALTER TABLE user_credentials ADD COLUMN policy_id INTEGER REFERENCES policies(id)`);
      console.log('✅ Added policy_id column to user_credentials');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        throw error;
      }
      console.log('⚠️  policy_id column already exists');
    }

    // Add policy creation permission to organizations
    try {
      await sequelize.query(`ALTER TABLE organizations ADD COLUMN allow_admin_policy_creation BOOLEAN DEFAULT TRUE`);
      console.log('✅ Added allow_admin_policy_creation column to organizations');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        throw error;
      }
      console.log('⚠️  allow_admin_policy_creation column already exists');
    }

    // Create indexes
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_policies_owner_org ON policies(owner_organization_id)`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_policies_target_org ON policies(target_organization_id)`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_policies_tyk_id ON policies(tyk_policy_id)`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_policy_api_access_policy ON policy_api_access(policy_id)`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_policy_api_access_api ON policy_api_access(api_id)`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_org_policies_org ON organization_available_policies(organization_id)`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_org_policies_policy ON organization_available_policies(policy_id)`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_user_credentials_policy ON user_credentials(policy_id)`);
    console.log('✅ Created indexes');

    console.log('🎉 Policy migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration }; 