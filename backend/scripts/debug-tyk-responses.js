const tykGatewayService = require('../services/TykGatewayService');

async function debugTykResponses() {
  try {
    console.log('🔍 Debugging Tyk API responses...');
    
    // Initialize the service
    await tykGatewayService.initialize();
    console.log('✅ TykGatewayService initialized');
    
    // Test APIs response
    console.log('\n📋 Testing APIs response structure...');
    try {
      const apisResponse = await tykGatewayService.getApis();
      console.log('APIs Response Type:', typeof apisResponse);
      console.log('APIs Response Keys:', Object.keys(apisResponse || {}));
      console.log('APIs Response Sample:', JSON.stringify(apisResponse, null, 2));
      
      if (apisResponse && apisResponse.apis) {
        console.log(`📊 Found ${apisResponse.apis.length} APIs in response.apis`);
      }
      if (Array.isArray(apisResponse)) {
        console.log(`📊 Found ${apisResponse.length} APIs as direct array`);
      }
    } catch (error) {
      console.log('❌ APIs test failed:', error.message);
    }
    
    // Test Keys response
    console.log('\n🔑 Testing Keys response structure...');
    try {
      const keysResponse = await tykGatewayService.getKeys();
      console.log('Keys Response Type:', typeof keysResponse);
      console.log('Keys Response Keys:', Object.keys(keysResponse || {}));
      console.log('Keys Response Sample:', JSON.stringify(keysResponse, null, 2));
      
      if (keysResponse && keysResponse.keys) {
        console.log(`📊 Found ${keysResponse.keys.length} keys in response.keys`);
      }
      if (Array.isArray(keysResponse)) {
        console.log(`📊 Found ${keysResponse.length} keys as direct array`);
      }
    } catch (error) {
      console.log('❌ Keys test failed:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
  }
}

// Run if executed directly
if (require.main === module) {
  debugTykResponses()
    .then(() => {
      console.log('🎉 Debug test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Debug test failed:', error);
      process.exit(1);
    });
}

module.exports = { debugTykResponses }; 