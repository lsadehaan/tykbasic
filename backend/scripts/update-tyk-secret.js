const { SystemConfig } = require('../models');

async function updateTykSecret() {
  try {
    console.log('🔧 Updating Tyk Gateway secret...');

    // Update or create the tyk_gateway_secret configuration
    const [config, created] = await SystemConfig.findOrCreate({
      where: { key: 'tyk_gateway_secret' },
      defaults: {
        key: 'tyk_gateway_secret',
        value: 'your-admin-secret',
        description: 'Tyk Gateway API secret key',
        category: 'tyk'
      }
    });

    if (!created) {
      // Update existing config
      await config.update({ value: 'your-admin-secret' });
      console.log('✅ Updated existing Tyk Gateway secret configuration');
    } else {
      console.log('✅ Created new Tyk Gateway secret configuration');
    }

    // Also ensure gateway URL is set
    const [urlConfig, urlCreated] = await SystemConfig.findOrCreate({
      where: { key: 'tyk_gateway_url' },
      defaults: {
        key: 'tyk_gateway_url',
        value: 'http://localhost:8080',
        description: 'Tyk Gateway base URL',
        category: 'tyk'
      }
    });

    if (urlCreated) {
      console.log('✅ Created Tyk Gateway URL configuration');
    } else {
      console.log('✅ Tyk Gateway URL configuration already exists');
    }

    console.log('\n🎉 Tyk configuration updated successfully!');
    console.log('🔄 Please restart the backend server to pick up the new configuration.');

  } catch (error) {
    console.error('❌ Failed to update Tyk configuration:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  updateTykSecret()
    .then(() => {
      console.log('✅ Update script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Update script failed:', error);
      process.exit(1);
    });
}

module.exports = { updateTykSecret }; 