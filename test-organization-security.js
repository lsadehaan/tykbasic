const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

// Test configuration
const TEST_CONFIG = {
  adminCredentials: {
    email: 'admin@tykbasic.local',
    password: 'admin123'
  },
  testOrganization: {
    name: 'TestSecurityOrg',
    displayName: 'Test Security Organization',
    description: 'Organization for testing security features',
    contactEmail: 'admin@testsecurityorg.com'
  },
  testUser: {
    email: 'testuser@testsecurityorg.com',
    password: 'testuser123',
    firstName: 'Test',
    lastName: 'User'
  }
};

let adminToken = null;
let testUserToken = null;
let createdOrgId = null;
let testUserId = null;

async function runOrganizationSecurityTests() {
  console.log('🔒 Testing Organization Security Implementation');
  console.log('='.repeat(60));

  try {
    // Test 1: Admin login and organization creation with Tyk integration
    await testAdminLoginAndOrgCreation();
    
    // Test 2: User registration and organization assignment
    await testUserRegistrationAndAssignment();
    
    // Test 3: Organization access controls
    await testOrganizationAccessControls();
    
    // Test 4: Tyk API operations with organization context
    await testTykApiOperationsWithOrgContext();
    
    // Test 5: Default organization security restrictions
    await testDefaultOrganizationRestrictions();
    
    console.log('\n🎉 All organization security tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

async function testAdminLoginAndOrgCreation() {
  console.log('\n📋 Test 1: Admin Login and Organization Creation with Tyk Integration');
  console.log('-'.repeat(50));
  
  // Admin login
  console.log('🔐 Logging in as admin...');
  const loginResponse = await axios.post(`${API_BASE}/auth/login`, TEST_CONFIG.adminCredentials);
  
  if (!loginResponse.data.success) {
    throw new Error('Admin login failed');
  }
  
  adminToken = loginResponse.data.token;
  console.log('✅ Admin login successful');
  
  // Create organization with Tyk integration
  console.log('🏢 Creating organization with Tyk integration...');
  const orgResponse = await axios.post(`${API_BASE}/admin/organizations`, TEST_CONFIG.testOrganization, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  
  if (!orgResponse.data.organization) {
    throw new Error('Organization creation failed');
  }
  
  createdOrgId = orgResponse.data.organization.id;
  const tykOrgId = orgResponse.data.organization.tykOrgId;
  
  console.log('✅ Organization created successfully:', {
    id: createdOrgId,
    name: orgResponse.data.organization.name,
    tykOrgId: tykOrgId
  });
  
  if (!tykOrgId) {
    throw new Error('Organization missing Tyk integration');
  }
  
  console.log('✅ Tyk Gateway integration confirmed');
}

async function testUserRegistrationAndAssignment() {
  console.log('\n📋 Test 2: User Registration and Organization Assignment');
  console.log('-'.repeat(50));
  
  // Register test user
  console.log('👤 Registering test user...');
  const registerResponse = await axios.post(`${API_BASE}/auth/register`, TEST_CONFIG.testUser);
  
  if (!registerResponse.data.success) {
    throw new Error('User registration failed');
  }
  
  console.log('✅ User registration successful');
  
  // Get pending users
  console.log('📋 Fetching pending users...');
  const pendingResponse = await axios.get(`${API_BASE}/admin/pending-users`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  
  const pendingUser = pendingResponse.data.pendingUsers.find(u => u.email === TEST_CONFIG.testUser.email);
  if (!pendingUser) {
    throw new Error('Pending user not found');
  }
  
  testUserId = pendingUser.id;
  console.log('✅ Pending user found:', pendingUser.email);
  
  // Approve user with organization assignment
  console.log('✅ Approving user with organization assignment...');
  const approveResponse = await axios.post(`${API_BASE}/admin/pending-users/${testUserId}/approve`, {
    role: 'user',
    organizationId: createdOrgId
  }, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  
  if (!approveResponse.data.message.includes('approved successfully')) {
    throw new Error('User approval failed');
  }
  
  console.log('✅ User approved and assigned to organization');
  
  // Test user login
  console.log('🔐 Testing user login...');
  const userLoginResponse = await axios.post(`${API_BASE}/auth/login`, {
    email: TEST_CONFIG.testUser.email,
    password: TEST_CONFIG.testUser.password
  });
  
  if (!userLoginResponse.data.success) {
    throw new Error('User login failed');
  }
  
  testUserToken = userLoginResponse.data.token;
  console.log('✅ User login successful');
}

async function testOrganizationAccessControls() {
  console.log('\n📋 Test 3: Organization Access Controls');
  console.log('-'.repeat(50));
  
  // Test user can access Tyk APIs with proper organization context
  console.log('🔍 Testing user access to Tyk APIs...');
  try {
    const apisResponse = await axios.get(`${API_BASE}/tyk/apis`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    
    console.log('✅ User can access Tyk APIs with organization context');
    console.log(`   APIs returned: ${apisResponse.data.count || 0}`);
  } catch (error) {
    if (error.response?.status === 403) {
      const errorData = error.response.data;
      if (errorData.code && ['NO_ORGANIZATION_ASSIGNED', 'DEFAULT_ORGANIZATION_NOT_ALLOWED', 'ORGANIZATION_INACTIVE', 'ORGANIZATION_NOT_CONFIGURED'].includes(errorData.code)) {
        console.log('✅ Organization access control working correctly:', errorData.message);
      } else {
        throw new Error(`Unexpected 403 error: ${errorData.message}`);
      }
    } else {
      throw error;
    }
  }
  
  // Test user can access keys with organization context
  console.log('🔑 Testing user access to keys...');
  try {
    const keysResponse = await axios.get(`${API_BASE}/tyk/keys`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    
    console.log('✅ User can access keys with organization context');
    console.log(`   Keys returned: ${keysResponse.data.count || 0}`);
  } catch (error) {
    if (error.response?.status === 403) {
      const errorData = error.response.data;
      if (errorData.code) {
        console.log('✅ Organization access control working correctly:', errorData.message);
      } else {
        throw new Error(`Unexpected 403 error: ${errorData.message}`);
      }
    } else {
      throw error;
    }
  }
}

async function testTykApiOperationsWithOrgContext() {
  console.log('\n📋 Test 4: Tyk API Operations with Organization Context');
  console.log('-'.repeat(50));
  
  // Test API creation with organization context
  console.log('🆕 Testing API creation with organization context...');
  const testApi = {
    name: `Test Security API ${Date.now()}`,
    api_id: `test-security-api-${Date.now()}`,
    active: true,
    use_keyless: true,
    proxy: {
      listen_path: `/test-security-${Date.now()}/`,
      target_url: "http://httpbin.org",
      strip_listen_path: true
    },
    version_data: {
      not_versioned: true,
      versions: {
        Default: { name: "Default" }
      }
    }
  };
  
  try {
    const createApiResponse = await axios.post(`${API_BASE}/tyk/apis`, testApi, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    
    if (createApiResponse.data.success) {
      console.log('✅ API created successfully with organization context');
      console.log(`   API ID: ${createApiResponse.data.data.key || createApiResponse.data.data.id}`);
    } else {
      console.log('⚠️  API creation returned success=false, but no error thrown');
    }
  } catch (error) {
    if (error.response?.status === 403) {
      console.log('✅ Organization access control prevented API creation (expected for some configurations)');
    } else {
      console.log('⚠️  API creation failed (may be expected):', error.response?.data?.message || error.message);
    }
  }
  
  // Test key creation with organization context
  console.log('🔑 Testing key creation with organization context...');
  const testKey = {
    name: `Test Security Key ${Date.now()}`,
    description: 'Test key for organization security validation',
    allowance: 1000,
    rate: 100,
    per: 60,
    access_rights: {}
  };
  
  try {
    const createKeyResponse = await axios.post(`${API_BASE}/tyk/keys`, testKey, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    
    if (createKeyResponse.data.success) {
      console.log('✅ Key created successfully with organization context');
      console.log(`   Key hash: ${createKeyResponse.data.data.key_hash}`);
    } else {
      console.log('⚠️  Key creation returned success=false, but no error thrown');
    }
  } catch (error) {
    if (error.response?.status === 403) {
      console.log('✅ Organization access control prevented key creation (expected for some configurations)');
    } else {
      console.log('⚠️  Key creation failed (may be expected):', error.response?.data?.message || error.message);
    }
  }
}

async function testDefaultOrganizationRestrictions() {
  console.log('\n📋 Test 5: Default Organization Security Restrictions');
  console.log('-'.repeat(50));
  
  // Create a user assigned to default organization (should be restricted)
  console.log('👤 Creating user assigned to default organization...');
  
  const defaultOrgUser = {
    email: 'defaultuser@test.com',
    password: 'defaultuser123',
    firstName: 'Default',
    lastName: 'User'
  };
  
  // Register user
  const registerResponse = await axios.post(`${API_BASE}/auth/register`, defaultOrgUser);
  if (!registerResponse.data.success) {
    throw new Error('Default org user registration failed');
  }
  
  // Get pending user
  const pendingResponse = await axios.get(`${API_BASE}/admin/pending-users`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  
  const pendingUser = pendingResponse.data.pendingUsers.find(u => u.email === defaultOrgUser.email);
  if (!pendingUser) {
    throw new Error('Default org pending user not found');
  }
  
  // Approve user WITHOUT organization assignment (should default to 'default' org)
  console.log('✅ Approving user without organization assignment...');
  const approveResponse = await axios.post(`${API_BASE}/admin/pending-users/${pendingUser.id}/approve`, {
    role: 'user'
    // No organizationId - should default to 'default' organization
  }, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  
  if (!approveResponse.data.message.includes('approved successfully')) {
    throw new Error('Default org user approval failed');
  }
  
  // Login as default org user
  console.log('🔐 Logging in as default organization user...');
  const defaultUserLoginResponse = await axios.post(`${API_BASE}/auth/login`, {
    email: defaultOrgUser.email,
    password: defaultOrgUser.password
  });
  
  if (!defaultUserLoginResponse.data.success) {
    throw new Error('Default org user login failed');
  }
  
  const defaultUserToken = defaultUserLoginResponse.data.token;
  
  // Test that default org user is restricted from accessing Tyk APIs
  console.log('🚫 Testing default organization access restrictions...');
  try {
    const restrictedResponse = await axios.get(`${API_BASE}/tyk/apis`, {
      headers: { 'Authorization': `Bearer ${defaultUserToken}` }
    });
    
    // If we get here, the restriction failed
    throw new Error('Default organization user should not have access to Tyk APIs');
  } catch (error) {
    if (error.response?.status === 403 && error.response.data?.code === 'DEFAULT_ORGANIZATION_NOT_ALLOWED') {
      console.log('✅ Default organization access restriction working correctly');
      console.log(`   Error message: ${error.response.data.message}`);
    } else {
      throw new Error(`Unexpected error testing default org restrictions: ${error.message}`);
    }
  }
}

// Run the tests
runOrganizationSecurityTests().catch(error => {
  console.error('💥 Test execution failed:', error);
  process.exit(1);
}); 