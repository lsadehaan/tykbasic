const { sequelize, Organization } = require('../models');

async function migrateOrganizations() {
  try {
    console.log('🔄 Starting organization migration...');

    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Check if the column already exists
    const [results] = await sequelize.query("PRAGMA table_info(organizations)");
    const hasAutoAssignDomains = results.some(col => col.name === 'auto_assign_domains');

    if (!hasAutoAssignDomains) {
      console.log('📝 Adding auto_assign_domains column...');
      // Add the column manually
      await sequelize.query(`
        ALTER TABLE organizations 
        ADD COLUMN auto_assign_domains JSON DEFAULT '[]'
      `);
      console.log('✅ Column added successfully');
    } else {
      console.log('✅ Column already exists');
    }

    // Update existing organizations to have empty auto_assign_domains array if null
    const organizations = await Organization.findAll();
    console.log(`📋 Found ${organizations.length} organizations`);

    let updatedCount = 0;
    for (const org of organizations) {
      if (!org.auto_assign_domains || org.auto_assign_domains === null) {
        await sequelize.query(`
          UPDATE organizations 
          SET auto_assign_domains = '[]' 
          WHERE id = ?
        `, {
          replacements: [org.id],
          type: sequelize.QueryTypes.UPDATE
        });
        console.log(`   ✅ Updated organization: ${org.name}`);
        updatedCount++;
      } else {
        console.log(`   ⏭️  Organization already updated: ${org.name}`);
      }
    }

    console.log('🎉 Organization migration completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - Organizations processed: ${organizations.length}`);
    console.log(`   - Organizations updated: ${updatedCount}`);
    console.log('   - Added auto_assign_domains field to organizations table');
    console.log('   - Organizations can now auto-assign users based on email domains');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

migrateOrganizations(); 