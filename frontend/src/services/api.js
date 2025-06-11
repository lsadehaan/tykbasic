// Complete API Service with Organization Error Handling
import OrganizationAccessError from '../components/OrganizationAccessError';

class ApiService {
  constructor() {
    this.baseURL = '/api';
  }

  getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  // Enhanced error handling with organization access support
  handleApiError(error, context = '') {
    console.error(`API Error${context ? ` (${context})` : ''}:`, error);
    
    if (error.response) {
      const { status, data } = error.response;
      
      // Handle organization access errors specifically
      if (status === 403 && data?.code) {
        switch (data.code) {
          case 'NO_ORGANIZATION_ASSIGNED':
          case 'DEFAULT_ORGANIZATION_NOT_ALLOWED':
          case 'ORGANIZATION_INACTIVE':
          case 'ORGANIZATION_NOT_CONFIGURED':
            // These are special organization access errors that should be handled by the UI
            throw {
              isOrganizationError: true,
              organizationErrorCode: data.code,
              organizationErrorData: data,
              message: data.message,
              status: status
            };
        }
      }
      
      // Handle other errors normally
      let message = 'An error occurred';
      
      if (status === 401) {
        message = 'Authentication required. Please log in again.';
        // Redirect to login if token is invalid
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
      } else if (status === 403) {
        message = data?.message || 'You do not have permission to perform this action.';
      } else if (status === 404) {
        message = data?.message || 'The requested resource was not found.';
      } else if (status === 422) {
        message = data?.message || 'Validation error occurred.';
      } else if (status >= 500) {
        message = data?.message || 'Server error occurred. Please try again later.';
      } else if (data?.message) {
        message = data.message;
      }
      
      throw new Error(message);
    } else if (error.request) {
      throw new Error('Network error. Please check your connection and try again.');
    } else {
      throw new Error(error.message || 'An unexpected error occurred.');
    }
  }

  async makeRequest(method, endpoint, data = null) {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method,
        headers: this.getAuthHeaders(),
        body: data ? JSON.stringify(data) : null
      });

      const responseData = await response.json();

      if (!response.ok) {
        this.handleApiError({ response: { status: response.status, data: responseData } });
      }

      return responseData;
    } catch (error) {
      if (error.isOrganizationError) {
        // Re-throw organization errors for UI handling
        throw error;
      }
      this.handleApiError(error);
    }
  }

  // Auth methods
  async login(email, password) {
    const response = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.status === 202 && data.action === 'password_reset_required') {
      return { 
        success: false, 
        passwordResetRequired: true,
        email: data.email,
        error: data.message || 'Password reset required'
      };
    } else if (response.ok) {
      localStorage.setItem('token', data.token);
      return { success: true, user: data.user, token: data.token };
    } else {
      return { success: false, error: data.message || 'Login failed' };
    }
  }

  async register(email, password, firstName, lastName) {
    const response = await fetch(`${this.baseURL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName, lastName })
    });

    const data = await response.json();
    return response.ok 
      ? { success: true, message: data.message }
      : { success: false, error: data.message || 'Registration failed' };
  }

  async getCurrentUser() {
    return this.makeRequest('GET', '/auth/me');
  }

  // Tyk API methods (organization-aware)
  async getTykStatus() {
    return this.makeRequest('GET', '/tyk/gateway/status');
  }

  async getApis() {
    return this.makeRequest('GET', '/tyk/apis');
  }

  async createApi(apiDefinition) {
    return this.makeRequest('POST', '/tyk/apis', apiDefinition);
  }

  async getKeys() {
    return this.makeRequest('GET', '/tyk/keys');
  }

  async createKey(keyData) {
    return this.makeRequest('POST', '/tyk/keys', keyData);
  }

  async reloadGateway() {
    return this.makeRequest('POST', '/tyk/gateway/reload');
  }

  async getCertificates() {
    return this.makeRequest('GET', '/tyk/certificates');
  }

  async uploadCertificate(certData) {
    return this.makeRequest('POST', '/tyk/certificates', certData);
  }

  async deleteCertificate(certId) {
    return this.makeRequest('DELETE', `/tyk/certificates/${certId}`);
  }

  async generateCertificate(certForm) {
    return this.makeRequest('POST', '/tyk/certificates/generate', certForm);
  }

  async getCertificateDetails(certId) {
    return this.makeRequest('GET', `/tyk/certificates/${certId}`);
  }

  // Admin API methods
  async getUsers(page = 1, limit = 20) {
    return this.makeRequest('GET', `/admin/users?page=${page}&limit=${limit}`);
  }

  async getPendingUsers(page = 1, limit = 20) {
    return this.makeRequest('GET', `/admin/pending-users?page=${page}&limit=${limit}`);
  }

  async approveUser(userId, role, organizationId = null) {
    const data = { role };
    if (organizationId) data.organizationId = organizationId;
    return this.makeRequest('POST', `/admin/pending-users/${userId}/approve`, data);
  }

  async getOrganizations(page = 1, limit = 20) {
    return this.makeRequest('GET', `/admin/organizations?page=${page}&limit=${limit}`);
  }

  async createOrganization(orgData) {
    return this.makeRequest('POST', '/admin/organizations', orgData);
  }

  async updateOrganization(orgId, updates) {
    return this.makeRequest('PUT', `/admin/organizations/${orgId}`, updates);
  }

  async getOrganizationDetails(orgId) {
    return this.makeRequest('GET', `/admin/organizations/${orgId}`);
  }

  async addUserToOrganization(orgId, userId) {
    return this.makeRequest('POST', `/admin/organizations/${orgId}/users`, { userId });
  }

  async getStatistics() {
    return this.makeRequest('GET', '/admin/statistics');
  }
}

// Create and export singleton instance
const apiService = new ApiService();

// Helper function to handle organization errors in components
export const withOrganizationErrorHandling = (asyncFunction) => {
  return async (...args) => {
    try {
      return await asyncFunction(...args);
    } catch (error) {
      if (error.isOrganizationError) {
        // This error should be handled by the UI component
        // Components can check for this error type and show OrganizationAccessError
        throw error;
      }
      throw error;
    }
  };
};

export default apiService; 