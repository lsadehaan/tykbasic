const fetch = require('node-fetch');
const { SystemConfig } = require('../models');

class TykGatewayService {
  constructor() {
    this.baseUrl = null;
    this.secret = null;
    this.initialized = false;
  }

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

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!this.initialized) {
      throw new Error('Tyk Gateway Service not properly initialized');
    }
  }

  getHeaders(contentType = 'application/json') {
    return {
      'x-tyk-authorization': this.secret,
      'Content-Type': contentType,
      'User-Agent': 'TykBasic/1.0'
    };
  }

  async makeRequest(method, endpoint, data = null, options = {}) {
    await this.ensureInitialized();
    
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    const url = `${this.baseUrl}${endpoint}`;
    
    console.log(`🌐 [${requestId}] Tyk API Request:`, {
      method: method,
      url: url,
      hasData: !!data,
      dataSize: data ? JSON.stringify(data).length : 0,
      timestamp: new Date().toISOString()
    });

    try {
      const requestOptions = {
        method: method,
        headers: this.getHeaders(options.contentType),
        ...options
      };

      if (data && method !== 'GET') {
        if (options.contentType === 'text/plain') {
          requestOptions.body = data;
        } else {
          requestOptions.body = JSON.stringify(data);
        }
      }

      const response = await fetch(url, requestOptions);
      const duration = Date.now() - startTime;
      
      let responseData;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      console.log(`🌐 [${requestId}] Tyk API Response:`, {
        status: response.status,
        statusText: response.statusText,
        duration: `${duration}ms`,
        responseSize: typeof responseData === 'string' ? responseData.length : JSON.stringify(responseData).length,
        success: response.ok
      });

      if (!response.ok) {
        const error = new Error(`Tyk API Error: ${response.status} ${response.statusText}`);
        error.status = response.status;
        error.response = responseData;
        error.requestId = requestId;
        throw error;
      }

      return {
        success: true,
        data: responseData,
        status: response.status,
        requestId: requestId,
        duration: duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.error(`💥 [${requestId}] Tyk API Error (${duration}ms):`, {
        error: error.message,
        url: url,
        method: method,
        status: error.status || 'network_error',
        responseBody: error.response,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const result = await this.makeRequest('GET', '/hello');
      return {
        status: 'healthy',
        message: 'Tyk Gateway is responsive',
        response: result.data,
        duration: result.duration
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
        error: error.response || error.message
      };
    }
  }

  // API Management
  async getApis(orgId = null) {
    // Note: Tyk APIs are not organization-scoped by default, but we can filter by org_id
    const result = await this.makeRequest('GET', '/tyk/apis');
    
    if (orgId && result.data && Array.isArray(result.data)) {
      // Filter APIs by organization ID
      result.data = result.data.filter(api => api.org_id === orgId);
    }
    
    return result.data;
  }

  async createApi(apiDefinition, orgId = null) {
    // Ensure organization context is set
    if (orgId && !apiDefinition.org_id) {
      apiDefinition.org_id = orgId;
    }
    
    const result = await this.makeRequest('POST', '/tyk/apis', apiDefinition);
    return result.data;
  }

  async getApi(apiId) {
    const result = await this.makeRequest('GET', `/tyk/apis/${apiId}`);
    return result.data;
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
  async getKeys(orgId = null) {
    const endpoint = orgId ? `/tyk/keys?orgID=${orgId}` : '/tyk/keys';
    const result = await this.makeRequest('GET', endpoint);
    return result.data;
  }

  async createKey(keyData, orgId = null) {
    // Ensure organization context is set
    if (orgId && !keyData.org_id) {
      keyData.org_id = orgId;
    }
    
    const result = await this.makeRequest('POST', '/tyk/keys', keyData);
    return result.data;
  }

  async getKey(keyId, hashed = true, orgId = null) {
    let endpoint = `/tyk/keys/${keyId}?hashed=${hashed}`;
    if (orgId) {
      endpoint += `&orgID=${orgId}`;
    }
    const result = await this.makeRequest('GET', endpoint);
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
  async getOrganizations() {
    const result = await this.makeRequest('GET', '/tyk/orgs');
    return result.data;
  }

  async createOrganization(orgData) {
    const result = await this.makeRequest('POST', '/tyk/orgs', orgData);
    return result.data;
  }

  async getOrganization(orgId) {
    const result = await this.makeRequest('GET', `/tyk/orgs/${orgId}`);
    return result.data;
  }

  async updateOrganization(orgId, orgData) {
    const result = await this.makeRequest('PUT', `/tyk/orgs/${orgId}`, orgData);
    return result.data;
  }

  async deleteOrganization(orgId) {
    const result = await this.makeRequest('DELETE', `/tyk/orgs/${orgId}`);
    return result.data;
  }

  // Organization Key Management (for organization-level rate limiting)
  async getOrganizationKeys(orgId = 'default') {
    const endpoint = `/tyk/org/keys?orgID=${orgId}`;
    const result = await this.makeRequest('GET', endpoint);
    return result.data;
  }

  async createOrganizationKey(orgId, orgKeyData) {
    const result = await this.makeRequest('PUT', `/tyk/org/keys/${orgId}`, orgKeyData);
    return result.data;
  }

  async getOrganizationKey(orgId) {
    const endpoint = `/tyk/org/keys/${orgId}?orgID=${orgId}`;
    const result = await this.makeRequest('GET', endpoint);
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
  async getCertificates(orgId = null) {
    let endpoint = '/tyk/certs';
    if (orgId) {
      endpoint += `?org_id=${orgId}`;
    }
    const result = await this.makeRequest('GET', endpoint);
    return result.data;
  }

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

  async getCertificate(certId, orgId = null) {
    let endpoint = `/tyk/certs/${certId}`;
    if (orgId) {
      endpoint += `?org_id=${orgId}`;
    }
    const result = await this.makeRequest('GET', endpoint);
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

  // Policies
  async getPolicies(orgId = null) {
    let endpoint = '/tyk/policies';
    if (orgId) {
      endpoint += `?org_id=${orgId}`;
    }
    const result = await this.makeRequest('GET', endpoint);
    return result.data;
  }

  async createPolicy(policyData) {
    const result = await this.makeRequest('POST', '/tyk/policies', policyData);
    return result.data;
  }

  async getPolicy(policyId, orgId = null) {
    let endpoint = `/tyk/policies/${policyId}`;
    if (orgId) {
      endpoint += `?org_id=${orgId}`;
    }
    const result = await this.makeRequest('GET', endpoint);
    return result.data;
  }

  async updatePolicy(policyId, policyData, orgId = null) {
    let endpoint = `/tyk/policies/${policyId}`;
    if (orgId) {
      endpoint += `?org_id=${orgId}`;
    }
    const result = await this.makeRequest('PUT', endpoint, policyData);
    return result.data;
  }

  async deletePolicy(policyId, orgId = null) {
    let endpoint = `/tyk/policies/${policyId}`;
    if (orgId) {
      endpoint += `?org_id=${orgId}`;
    }
    const result = await this.makeRequest('DELETE', endpoint);
    return result.data;
  }

  // Reload/Hot Reload
  async reloadGateway() {
    const result = await this.makeRequest('GET', '/tyk/reload');
    return result.data;
  }

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