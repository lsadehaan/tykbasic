const tykGatewayService = require('../services/TykGatewayService');

async function testTykConnection() {
  try {
    console.log('🔍 Testing Tyk Gateway connection...');
    
    const tykService = tykGatewayService;
    
    // Initialize the service
    await tykService.initialize();
    console.log('✅ TykGatewayService initialized');
    
    // Test health check
    console.log('🏥 Testing health check...');
    const healthResult = await tykService.healthCheck();
    console.log('Health check result:', healthResult);
    
    if (healthResult.status === 'healthy') {
      console.log('✅ Tyk Gateway is healthy and accessible');
      
      // Test listing APIs
      console.log('📋 Testing API listing...');
      try {
        const apis = await tykService.getApis();
        console.log(`✅ Successfully retrieved APIs: ${apis?.apis?.length || 0} APIs found`);
      } catch (error) {
        console.log('❌ Failed to list APIs:', error.message);
      }
      
      // Test listing keys
      console.log('🔑 Testing key listing...');
      try {
        const keys = await tykService.getKeys();
        console.log(`✅ Successfully retrieved keys: ${keys?.keys?.length || 0} keys found`);
      } catch (error) {
        console.log('❌ Failed to list keys:', error.message);
      }
      
    } else {
      console.log('❌ Tyk Gateway health check failed');
    }
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  testTykConnection()
    .then(() => {
      console.log('🎉 Connection test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Connection test failed:', error);
      process.exit(1);
    });
}

module.exports = { testTykConnection }; 