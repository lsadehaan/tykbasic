const fetch = require('node-fetch');
const { SystemConfig } = require('../models');

/**
 * Service class for interacting with the Tyk Gateway API.
 * Handles all communication with the Tyk Gateway, including API management,
 * key management, organization management, and policy management.
 */
class TykGatewayService {
  /**
   * Creates a new instance of TykGatewayService.
   * Initializes with null values that will be set during initialization.
   */
  constructor() {
    this.baseUrl = null;
    this.secret = null;
    this.initialized = false;
  }

  /**
   * Initializes the TykGatewayService by loading configuration from database or environment.
   * Sets up the base URL and secret for Tyk Gateway communication.
   * @returns {Promise<boolean>} True if initialization was successful, false otherwise
   */
  async initialize() {
    try {
      // Get configuration from database or environment
      const gatewayUrlConfig = await SystemConfig.findOne({ where: { key: 'tyk_gateway_url' } });
      const gatewaySecretConfig = await SystemConfig.findOne({ where: { key: 'tyk_gateway_secret' } });

      this.baseUrl = gatewayUrlConfig?.value || process.env.TYK_GATEWAY_URL || 'http://localhost:8080';
      this.secret = gatewaySecretConfig?.value || process.env.TYK_GATEWAY_SECRET || 'your-admin-secret';

      // Ensure baseUrl doesn't end with slash
      this.baseUrl = this.baseUrl.replace(/\/$/, '');
      
      this.initialized = true;
      
      console.log(`🔗 Tyk Gateway Service initialized:`, {
        baseUrl: this.baseUrl,
        hasSecret: !!this.secret,
        timestamp: new Date().toISOString()
      });

      return true;
    } catch (error) {
      console.error('Failed to initialize Tyk Gateway Service:', error);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Ensures the service is initialized before making any requests.
   * Throws an error if initialization fails.
   * @throws {Error} If service is not properly initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!this.initialized) {
      throw new Error('Tyk Gateway Service not properly initialized');
    }
  }

  /**
   * Generates headers for Tyk Gateway API requests.
   * @param {string} [contentType='application/json'] - The content type for the request
   * @returns {Object} Headers object with authorization and content type
   */
  getHeaders(contentType = 'application/json') {
    return {
      'x-tyk-authorization': this.secret,
      'Content-Type': contentType,
      'User-Agent': 'TykBasic/1.0'
    };
  }

  /**
   * Makes a request to the Tyk Gateway API.
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
   * @param {string} endpoint - API endpoint path
   * @param {Object} [data] - Request body data
   * @param {string} [contentType] - Content type for the request
   * @returns {Promise<Object>} Response data from the API
   * @throws {Error} If the request fails
   */
  async makeRequest(method, endpoint, data = null, contentType = 'application/json') {
    await this.ensureInitialized();

    const url = `${this.baseUrl}${endpoint}`;
    const headers = this.getHeaders(contentType);
    const options = {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined
    };

    try {
      const response = await fetch(url, options);
      let responseData;
      
      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        // For non-JSON responses, get the text
        const text = await response.text();
        responseData = { data: text };
      }

      if (!response.ok) {
        throw new Error(`Tyk Gateway API error: ${responseData.error || response.statusText}`);
      }

      // Return the response data directly if it's not wrapped in a data property
      return responseData.data || responseData;
    } catch (error) {
      console.error('Tyk Gateway API request failed:', {
        method,
        endpoint,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Retrieves an API definition from Tyk Gateway.
   * @param {string} apiId - The ID of the API to retrieve
   * @returns {Promise<Object>} API definition data
   */
  async getApi(apiId) {
    const result = await this.makeRequest('GET', `/tyk/apis/${apiId}`);
    return result.data;
  }

  /**
   * Retrieves all APIs from Tyk Gateway.
   * @param {string} [orgId] - Optional organization ID to filter APIs
   * @returns {Promise<Array>} List of APIs
   */
  async getApis(orgId = null) {
    let endpoint = '/tyk/apis';
    if (orgId) {
      endpoint += `?org_id=${orgId}`;
    }
    const result = await this.makeRequest('GET', endpoint);
    return result;
  }

  /**
   * Retrieves API keys from Tyk Gateway.
   * @param {string} [orgId] - Optional organization ID to filter keys
   * @returns {Promise<Array>} List of API keys
   */
  async getKeys(orgId = null) {
    const endpoint = orgId ? `/tyk/keys?orgID=${orgId}` : '/tyk/keys';
    const result = await this.makeRequest('GET', endpoint);
    return result.data;
  }

  /**
   * Retrieves a specific API key from Tyk Gateway.
   * @param {string} keyId - The ID of the key to retrieve
   * @param {boolean} [hashed=true] - Whether the key ID is hashed
   * @param {string} [orgId] - Optional organization ID
   * @returns {Promise<Object>} Key data
   */
  async getKey(keyId, hashed = true, orgId = null) {
    let endpoint = `/tyk/keys/${keyId}?hashed=${hashed}`;
    if (orgId) {
      endpoint += `&orgID=${orgId}`;
    }
    const result = await this.makeRequest('GET', endpoint);
    return result.data;
  }

  /**
   * Retrieves all organizations from Tyk Gateway.
   * @returns {Promise<Array>} List of organizations
   */
  async getOrganizations() {
    const result = await this.makeRequest('GET', '/tyk/org/keys');
    return result.data;
  }

  /**
   * Retrieves a specific organization from Tyk Gateway.
   * @param {string} orgId - The ID of the organization to retrieve
   * @returns {Promise<Object>} Organization data
   */
  async getOrganization(orgId) {
    const result = await this.makeRequest('GET', `/tyk/org/keys/${orgId}`);
    return result.data;
  }

  /**
   * Retrieves organization-level API keys from Tyk Gateway.
   * @param {string} [orgId='default'] - Organization ID
   * @returns {Promise<Array>} List of organization keys
   */
  async getOrganizationKeys(orgId = 'default') {
    const endpoint = `/tyk/org/keys?orgID=${orgId}`;
    const result = await this.makeRequest('GET', endpoint);
    return result.data;
  }

  /**
   * Retrieves a certificate from Tyk Gateway.
   * @param {string} certId - The ID of the certificate to retrieve
   * @param {string} [orgId] - Optional organization ID
   * @returns {Promise<Object>} Certificate data
   */
  async getCertificate(certId, orgId = null) {
    let endpoint = `/tyk/certs/${certId}`;
    if (orgId) {
      endpoint += `?org_id=${orgId}`;
    }
    const result = await this.makeRequest('GET', endpoint);
    return result.data;
  }

  /**
   * Retrieves policies from Tyk Gateway.
   * @param {string} [orgId] - Optional organization ID to filter policies
   * @returns {Promise<Array>} List of policies
   */
  async getPolicies(orgId = null) {
    let endpoint = '/tyk/policies';
    if (orgId) {
      endpoint += `?org_id=${orgId}`;
    }
    const result = await this.makeRequest('GET', endpoint);
    return result.data;
  }

  /**
   * Creates a new policy in Tyk Gateway.
   * @param {Object} policyData - Policy configuration data
   * @returns {Promise<Object>} Created policy data
   */
  async createPolicy(policyData) {
    try {
      console.log('Sending policy data to Tyk Gateway:', JSON.stringify(policyData, null, 2));
      
      const result = await this.makeRequest('POST', '/tyk/policies', policyData);
      console.log('Tyk policy creation response:', JSON.stringify(result, null, 2));
      
      // Tyk Gateway returns the policy ID in the response body
      if (!result) {
        throw new Error('Failed to create policy in Tyk Gateway - empty response');
      }

      // Return the policy data with the ID from the request
      return {
        ...result,
        id: policyData.id // Use the ID we generated
      };
    } catch (error) {
      console.error('Policy creation error:', error);
      throw error;
    }
  }

  /**
   * Retrieves a specific policy from Tyk Gateway.
   * @param {string} policyId - The ID of the policy to retrieve
   * @param {string} [orgId] - Optional organization ID
   * @returns {Promise<Object>} Policy data
   */
  async getPolicy(policyId, orgId = null) {
    let endpoint = `/tyk/policies/${policyId}`;
    if (orgId) {
      endpoint += `?org_id=${orgId}`;
    }
    const result = await this.makeRequest('GET', endpoint);
    return result.data;
  }

  /**
   * Updates an existing policy in Tyk Gateway.
   * @param {string} policyId - The ID of the policy to update
   * @param {Object} policyData - Updated policy configuration
   * @param {string} [orgId] - Optional organization ID
   * @returns {Promise<Object>} Updated policy data
   */
  async updatePolicy(policyId, policyData, orgId = null) {
    let endpoint = `/tyk/policies/${policyId}`;
    if (orgId) {
      endpoint += `?org_id=${orgId}`;
    }
    const result = await this.makeRequest('PUT', endpoint, policyData);
    return result.data;
  }

  /**
   * Deletes a policy from Tyk Gateway.
   * @param {string} policyId - The ID of the policy to delete
   * @param {string} [orgId] - Optional organization ID
   * @returns {Promise<Object>} Deletion result
   */
  async deletePolicy(policyId, orgId = null) {
    let endpoint = `/tyk/policies/${policyId}`;
    if (orgId) {
      endpoint += `?org_id=${orgId}`;
    }
    const result = await this.makeRequest('DELETE', endpoint);
    return result.data;
  }

  /**
   * Triggers a reload of the Tyk Gateway configuration.
   * @returns {Promise<Object>} Reload result
   */
  async reloadGateway() {
    const result = await this.makeRequest('GET', '/tyk/reload');
    return result.data;
  }

  // Health check
  async healthCheck() {
    try {
      const result = await this.makeRequest('GET', '/hello');
      return {
        status: 'healthy',
        message: 'Tyk Gateway is responsive',
        response: result,
        duration: 0 // Tyk Gateway doesn't return duration for /hello endpoint
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
        error: error.message
      };
    }
  }

  // API Management
  async createApi(apiDefinition, orgId = null) {
    // Ensure organization context is set
    if (orgId) {
      apiDefinition.org_id = orgId;
    }
    
    // Ensure the API has a unique ID
    if (!apiDefinition.api_id) {
      apiDefinition.api_id = apiDefinition.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    }
    
    const result = await this.makeRequest('POST', '/tyk/apis', apiDefinition);
    
    // Add api_id to the response for consistency with our frontend
    if (result.key) {
      result.api_id = result.key;
    }
    
    return result;
  }

  async updateApi(apiId, apiDefinition) {
    const result = await this.makeRequest('PUT', `/tyk/apis/${apiId}`, apiDefinition);
    return result.data;
  }

  async deleteApi(apiId) {
    const result = await this.makeRequest('DELETE', `/tyk/apis/${apiId}`);
    return result.data;
  }

  // Key Management
  async createKey(keyData, orgId = null) {
    // Ensure organization context is set
    if (orgId && !keyData.org_id) {
      keyData.org_id = orgId;
    }
    
    const result = await this.makeRequest('POST', '/tyk/keys', keyData);
    return result.data;
  }

  async updateKey(keyId, keyData, hashed = true, orgId = null) {
    let endpoint = `/tyk/keys/${keyId}?hashed=${hashed}`;
    if (orgId) {
      endpoint += `&orgID=${orgId}`;
    }
    const result = await this.makeRequest('PUT', endpoint, keyData);
    return result.data;
  }

  async deleteKey(keyId, hashed = true, orgId = null) {
    let endpoint = `/tyk/keys/${keyId}?hashed=${hashed}`;
    if (orgId) {
      endpoint += `&orgID=${orgId}`;
    }
    const result = await this.makeRequest('DELETE', endpoint);
    return result.data;
  }

  // Organization Management
  async createOrganization(orgData) {
    const result = await this.makeRequest('PUT', `/tyk/org/keys/${orgData.owner_slug}`, orgData);
    return result.data;
  }

  async updateOrganization(orgId, orgData) {
    const result = await this.makeRequest('PUT', `/tyk/org/keys/${orgId}`, orgData);
    return result.data;
  }

  async deleteOrganization(orgId) {
    const result = await this.makeRequest('DELETE', `/tyk/org/keys/${orgId}`);
    return result.data;
  }

  // Organization Key Management (for organization-level rate limiting)
  async createOrganizationKey(orgId, orgKeyData) {
    const result = await this.makeRequest('PUT', `/tyk/org/keys/${orgId}`, orgKeyData);
    return result.data;
  }

  async updateOrganizationKey(orgId, orgKeyData) {
    const result = await this.makeRequest('PUT', `/tyk/org/keys/${orgId}`, orgKeyData);
    return result.data;
  }

  async deleteOrganizationKey(orgId) {
    const endpoint = `/tyk/org/keys/${orgId}?orgID=${orgId}`;
    const result = await this.makeRequest('DELETE', endpoint);
    return result.data;
  }

  // Certificate Management
  async uploadCertificate(certificatePem, orgId = null) {
    let endpoint = '/tyk/certs';
    if (orgId) {
      endpoint += `?org_id=${orgId}`;
    }
    const result = await this.makeRequest('POST', endpoint, certificatePem, {
      contentType: 'text/plain'
    });
    return result.data;
  }

  async deleteCertificate(certId, orgId = null) {
    let endpoint = `/tyk/certs/${certId}`;
    if (orgId) {
      endpoint += `?org_id=${orgId}`;
    }
    const result = await this.makeRequest('DELETE', endpoint);
    return result.data;
  }

  // Reload/Hot Reload
  async hotReload() {
    const result = await this.makeRequest('GET', '/tyk/reload/group');
    return result.data;
  }

  // Analytics
  async getAnalytics(apiId = null, resolution = 'day', from = null, to = null, orgId = null) {
    let endpoint = '/tyk/analytics';
    const params = new URLSearchParams();
    
    if (apiId) params.append('api_id', apiId);
    if (resolution) params.append('resolution', resolution);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (orgId) params.append('org_id', orgId);
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }
    
    const result = await this.makeRequest('GET', endpoint);
    return result.data;
  }
}

// Create singleton instance
const tykGatewayService = new TykGatewayService();

module.exports = tykGatewayService; 