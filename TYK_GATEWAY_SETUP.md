# 🔗 Tyk Gateway Integration Setup Guide

## Overview

TykBasic now includes **full Tyk Gateway integration**! This means you can manage APIs, keys, policies, and monitor analytics directly from the TykBasic dashboard.

## 🚀 Quick Start

### 1. **Tyk Gateway Configuration**

TykBasic can connect to your Tyk Gateway using configurable settings. The gateway URL and secret can be set via:

- **Environment Variables**: `TYK_GATEWAY_URL` and `TYK_GATEWAY_SECRET`
- **System Configuration**: Through the database (future UI configuration coming)

#### Default Configuration:
```bash
TYK_GATEWAY_URL=http://localhost:8080
TYK_GATEWAY_SECRET=your-tyk-gateway-secret
```

### 2. **Testing the Integration**

Once TykBasic is running, log in and you'll see:

#### **Dashboard Features:**
- **🔍 Gateway Status**: Real-time connection status to Tyk Gateway
- **🚀 Create Test API**: Instantly create a test API pointing to httpbin.org
- **🔑 View API Keys**: Browse existing API keys
- **📊 View Analytics**: Check API usage analytics
- **🔄 Reload Gateway**: Hot reload the gateway after changes

#### **Statistics Display:**
- Live count of APIs, Keys, and Policies
- Response time monitoring
- Connection health status

## 🔧 Configuration Options

### Environment Variables

Create a `.env` file in the project root:

```bash
# Tyk Gateway Configuration
TYK_GATEWAY_URL=http://localhost:8080
TYK_GATEWAY_SECRET=your-tyk-gateway-secret

# Optional: Auto-reload gateway after API changes
TYK_AUTO_RELOAD=true

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tykbasic
DB_USER=postgres
DB_PASS=yourpassword

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRATION=24h

# Server Configuration
PORT=3001
NODE_ENV=development
```

### System Configuration (via Database)

The following settings are automatically seeded in the `system_configs` table:

| Key | Default Value | Description |
|-----|---------------|-------------|
| `tyk_gateway_url` | `http://localhost:8080` | Tyk Gateway base URL |
| `tyk_gateway_secret` | `your-tyk-gateway-secret` | Gateway API secret |
| `tyk_auto_reload` | `true` | Auto-reload after changes |

## 🐳 Docker Integration

### Current Setup (Tyk Gateway External)
```bash
# Terminal 1: Start Tyk Gateway (your existing setup)
# Gateway running on localhost:8080

# Terminal 2: Start TykBasic
npm run dev
```

### Future Docker Compose Setup
```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  tyk-gateway:
    image: tykio/tyk-gateway:latest
    ports:
      - "8080:8080"
    environment:
      - TYK_GW_SECRET=your-tyk-gateway-secret
    volumes:
      - ./tyk.conf:/opt/tyk-gateway/tyk.conf
    depends_on:
      - redis

  tykbasic:
    build: .
    ports:
      - "3000:3000"
      - "3001:3001"
    environment:
      - TYK_GATEWAY_URL=http://tyk-gateway:8080
      - TYK_GATEWAY_SECRET=your-tyk-gateway-secret
    depends_on:
      - tyk-gateway
```

## 📋 API Endpoints

TykBasic provides these Tyk Gateway proxy endpoints:

### Gateway Management
- `GET /api/tyk/health` - Service health check
- `GET /api/tyk/gateway/status` - Gateway connection status
- `POST /api/tyk/gateway/reload` - Hot reload gateway

### API Management
- `GET /api/tyk/apis` - List all APIs
- `POST /api/tyk/apis` - Create new API
- `GET /api/tyk/apis/:id` - Get specific API
- `PUT /api/tyk/apis/:id` - Update API
- `DELETE /api/tyk/apis/:id` - Delete API

### Key Management
- `GET /api/tyk/keys` - List API keys
- `POST /api/tyk/keys` - Create API key
- `GET /api/tyk/keys/:id` - Get specific key
- `DELETE /api/tyk/keys/:id` - Delete key

### Analytics
- `GET /api/tyk/analytics` - Get usage analytics

## 🔑 Authentication

All Tyk endpoints require authentication:

```javascript
const token = localStorage.getItem('token');
const response = await fetch('/api/tyk/apis', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

## 🛡️ Security Features

- **JWT Authentication**: All requests protected
- **Audit Logging**: Every Tyk operation logged
- **Error Handling**: Comprehensive error tracking
- **Request Tracking**: Unique request IDs for debugging

## 🧪 Testing Your Setup

### 1. Check Gateway Status
Login to TykBasic and look for the "System Status" card. The Tyk Gateway should show "Connected" if properly configured.

### 2. Create a Test API
Click "🚀 Create Test API" in the dashboard. This will:
- Create an API definition pointing to httpbin.org
- Assign a unique listen path like `/test-api-1670123456/`
- Show success message with API details

### 3. Test the API
```bash
# After creating test API, test it:
curl http://localhost:8080/test-api-1670123456/get
```

### 4. View Statistics
The dashboard will show:
- **APIs**: Count of configured APIs
- **Keys**: Number of API keys
- **Response Times**: Gateway response performance

## 🔧 Troubleshooting

### Common Issues

#### 1. Gateway Connection Failed
**Symptoms**: Status shows "Offline" or "Connection failed"

**Solutions**:
- Verify Tyk Gateway is running on configured port
- Check `TYK_GATEWAY_URL` matches your setup
- Ensure `TYK_GATEWAY_SECRET` is correct
- Check firewall/network connectivity

#### 2. Authentication Errors
**Symptoms**: 403 errors when calling Tyk APIs

**Solutions**:
- Verify `TYK_GATEWAY_SECRET` in configuration
- Check Tyk Gateway logs for auth failures
- Ensure secret matches gateway configuration

#### 3. CORS Issues
**Symptoms**: Browser blocks requests

**Solutions**:
- TykBasic acts as proxy, so all requests go through backend
- No direct browser-to-gateway calls needed
- Check browser console for specific errors

### Debug Mode

Enable detailed logging by setting:
```bash
NODE_ENV=development
LOG_LEVEL=debug
```

Check console for detailed request/response logging with unique request IDs.

## 🚀 Next Steps

With Tyk Gateway integration complete, you can:

1. **Manage Real APIs**: Replace test APIs with production endpoints
2. **Configure Policies**: Set rate limits, quotas, and access controls  
3. **Monitor Usage**: Track API analytics and performance
4. **Scale Operations**: Add multiple gateways and organizations

## 📚 Related Documentation

- [Tyk Gateway API Documentation](../gateway-swagger.yml)
- [Implementation Guide](../TYK_FRONTEND_IMPLEMENTATION_GUIDE.md)
- [Test Examples](../tests/test-tyk-api.js)
- [Authentication Setup](./AUTH_SYSTEM_GUIDE.md)

---

**🎉 Congratulations!** TykBasic is now a fully functional Tyk Gateway management platform! 