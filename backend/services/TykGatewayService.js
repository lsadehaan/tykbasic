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
  async getApis() {
    const result = await this.makeRequest('GET', '/tyk/apis');
    return result.data;
  }

  async createApi(apiDefinition) {
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

  async createKey(keyData) {
    const result = await this.makeRequest('POST', '/tyk/keys', keyData);
    return result.data;
  }

  async getKey(keyId, hashed = true) {
    const endpoint = `/tyk/keys/${keyId}?hashed=${hashed}`;
    const result = await this.makeRequest('GET', endpoint);
    return result.data;
  }

  async updateKey(keyId, keyData, hashed = true) {
    const endpoint = `/tyk/keys/${keyId}?hashed=${hashed}`;
    const result = await this.makeRequest('PUT', endpoint, keyData);
    return result.data;
  }

  async deleteKey(keyId, hashed = true) {
    const endpoint = `/tyk/keys/${keyId}?hashed=${hashed}`;
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

  // Certificate Management
  async getCertificates() {
    const result = await this.makeRequest('GET', '/tyk/certs');
    return result.data;
  }

  async uploadCertificate(certificatePem) {
    const result = await this.makeRequest('POST', '/tyk/certs', certificatePem, {
      contentType: 'text/plain'
    });
    return result.data;
  }

  async getCertificate(certId) {
    const result = await this.makeRequest('GET', `/tyk/certs/${certId}`);
    return result.data;
  }

  async deleteCertificate(certId) {
    const result = await this.makeRequest('DELETE', `/tyk/certs/${certId}`);
    return result.data;
  }

  // Policies
  async getPolicies() {
    const result = await this.makeRequest('GET', '/tyk/policies');
    return result.data;
  }

  async createPolicy(policyData) {
    const result = await this.makeRequest('POST', '/tyk/policies', policyData);
    return result.data;
  }

  async getPolicy(policyId) {
    const result = await this.makeRequest('GET', `/tyk/policies/${policyId}`);
    return result.data;
  }

  async updatePolicy(policyId, policyData) {
    const result = await this.makeRequest('PUT', `/tyk/policies/${policyId}`, policyData);
    return result.data;
  }

  async deletePolicy(policyId) {
    const result = await this.makeRequest('DELETE', `/tyk/policies/${policyId}`);
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
  async getAnalytics(apiId = null, resolution = 'day', from = null, to = null) {
    let endpoint = '/tyk/analytics';
    const params = new URLSearchParams();
    
    if (apiId) params.append('api_id', apiId);
    if (resolution) params.append('resolution', resolution);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    
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