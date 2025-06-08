# TykBasic Analytics Integration Plan

## Overview

This document outlines the strategy for integrating comprehensive analytics into TykBasic using Tyk Pump to collect API traffic data and present it through our React frontend.

## Architecture Decision

We've chosen to use **Tyk Pump + PostgreSQL + React Dashboard** for our analytics solution because:

✅ **Integrated with existing stack** (PostgreSQL/SQLite database)
✅ **Self-contained** (no external dependencies like Elasticsearch/Prometheus)
✅ **Customizable** (build exactly the analytics we need)
✅ **Cost-effective** (no additional service costs)
✅ **Secure** (data stays in our infrastructure)

## Implementation Strategy

### Phase 1: Tyk Pump Setup and Database Schema

#### 1.1 Tyk Pump Configuration
```yaml
# pump.conf
{
  "analytics_storage_type": "redis",
  "analytics_storage_config": {
    "type": "redis",
    "host": "localhost",
    "port": 6379,
    "password": "",
    "database": 0
  },
  "pumps": {
    "postgres": {
      "type": "postgres",
      "meta": {
        "connection_string": "postgresql://user:password@localhost:5432/tykbasic_db",
        "table_sharding": false
      }
    }
  },
  "dont_purge_uptime_data": false
}
```

#### 1.2 Analytics Database Schema
```sql
-- API Request Logs (from Tyk Pump)
CREATE TABLE api_requests (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Request Details
    api_id VARCHAR(255) NOT NULL,
    api_name VARCHAR(255),
    api_key_id VARCHAR(255),
    path VARCHAR(1000) NOT NULL,
    method VARCHAR(10) NOT NULL,
    
    -- Response Details
    response_code INTEGER NOT NULL,
    response_time_ms INTEGER NOT NULL,
    content_length BIGINT DEFAULT 0,
    
    -- User Context
    user_agent TEXT,
    ip_address INET,
    geo_country VARCHAR(2),
    geo_city VARCHAR(100),
    
    -- Organization Context
    org_id VARCHAR(255),
    
    -- Indexes for performance
    CONSTRAINT idx_api_requests_timestamp_api_id_response_code 
        CREATE INDEX ON (timestamp, api_id, response_code),
    CONSTRAINT idx_api_requests_api_key_id 
        CREATE INDEX ON (api_key_id),
    CONSTRAINT idx_api_requests_org_id 
        CREATE INDEX ON (org_id)
);

-- Pre-aggregated Analytics (for performance)
CREATE TABLE api_analytics_hourly (
    id SERIAL PRIMARY KEY,
    hour_bucket TIMESTAMP WITH TIME ZONE NOT NULL,
    api_id VARCHAR(255) NOT NULL,
    org_id VARCHAR(255),
    
    -- Traffic Metrics
    total_requests INTEGER NOT NULL DEFAULT 0,
    success_requests INTEGER NOT NULL DEFAULT 0,
    error_requests INTEGER NOT NULL DEFAULT 0,
    
    -- Performance Metrics
    avg_response_time_ms FLOAT NOT NULL DEFAULT 0,
    min_response_time_ms INTEGER NOT NULL DEFAULT 0,
    max_response_time_ms INTEGER NOT NULL DEFAULT 0,
    p95_response_time_ms INTEGER NOT NULL DEFAULT 0,
    
    -- Data Transfer
    total_bytes_sent BIGINT NOT NULL DEFAULT 0,
    total_bytes_received BIGINT NOT NULL DEFAULT 0,
    
    -- Top Response Codes
    status_2xx INTEGER NOT NULL DEFAULT 0,
    status_3xx INTEGER NOT NULL DEFAULT 0,
    status_4xx INTEGER NOT NULL DEFAULT 0,
    status_5xx INTEGER NOT NULL DEFAULT 0,
    
    UNIQUE(hour_bucket, api_id, org_id),
    INDEX idx_analytics_hourly_time_api (hour_bucket, api_id),
    INDEX idx_analytics_hourly_org (org_id, hour_bucket)
);

-- API Key Usage Analytics
CREATE TABLE api_key_analytics_daily (
    id SERIAL PRIMARY KEY,
    date_bucket DATE NOT NULL,
    api_key_id VARCHAR(255) NOT NULL,
    api_id VARCHAR(255) NOT NULL,
    org_id VARCHAR(255),
    
    requests_count INTEGER NOT NULL DEFAULT 0,
    bytes_transferred BIGINT NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    
    UNIQUE(date_bucket, api_key_id, api_id),
    INDEX idx_key_analytics_date_key (date_bucket, api_key_id)
);
```

### Phase 2: Backend Analytics API

#### 2.1 Analytics Service
```javascript
// backend/services/AnalyticsService.js
class AnalyticsService {
  // Dashboard overview
  async getDashboardStats(orgId, timeRange = '24h') {
    // Total requests, error rate, avg response time, top APIs
  }
  
  // API-specific analytics
  async getApiAnalytics(apiId, timeRange = '7d', granularity = 'hour') {
    // Request volume, response times, error rates, status codes
  }
  
  // Key usage analytics
  async getKeyAnalytics(keyId, timeRange = '30d') {
    // Usage patterns, quota consumption, top endpoints
  }
  
  // Real-time metrics
  async getRealTimeMetrics(orgId) {
    // Last 5 minutes: requests/sec, active APIs, error spike detection
  }
  
  // Geographical analytics
  async getGeoAnalytics(apiId, timeRange = '7d') {
    // Request distribution by country/city
  }
}
```

#### 2.2 Analytics Routes
```javascript
// GET /api/analytics/dashboard - Overview stats
// GET /api/analytics/apis/:apiId - API-specific metrics
// GET /api/analytics/keys/:keyId - Key usage stats
// GET /api/analytics/realtime - Real-time metrics
// GET /api/analytics/geo/:apiId - Geographic distribution
```

### Phase 3: Frontend Analytics Dashboard

#### 3.1 Analytics Components
```
frontend/src/components/analytics/
├── AnalyticsDashboard.js      # Main analytics page
├── ApiMetricsChart.js         # API performance charts
├── RequestVolumeChart.js      # Request volume over time
├── ErrorRateChart.js          # Error rate monitoring
├── ResponseTimeChart.js       # Response time trends
├── GeographicMap.js           # Request geographic distribution
├── TopApisTable.js            # Most used APIs
├── KeyUsageTable.js           # Key usage statistics
└── RealTimeMetrics.js         # Live metrics widgets
```

#### 3.2 Chart Library
- **Recharts** (already in package.json) for all visualizations
- **React-Leaflet** for geographic maps
- **Date-fns** (already included) for time manipulation

### Phase 4: Aggregation and Performance

#### 4.1 Background Jobs
```javascript
// backend/jobs/analyticsAggregator.js
class AnalyticsAggregator {
  // Hourly job: aggregate raw requests into hourly summaries
  async aggregateHourlyData() {}
  
  // Daily job: aggregate hourly data into daily summaries
  async aggregateDailyData() {}
  
  // Cleanup job: archive old raw request data
  async cleanupOldData() {}
}
```

#### 4.2 Caching Strategy
- **Redis caching** for frequently accessed metrics
- **Database materialized views** for complex aggregations
- **React Query** for frontend caching

## Implementation Timeline

### Week 1: Foundation
- [ ] Set up Tyk Pump configuration
- [ ] Create analytics database schema
- [ ] Test Tyk Pump data flow
- [ ] Basic backend analytics service

### Week 2: Core Analytics
- [ ] Implement analytics API endpoints
- [ ] Create basic frontend analytics dashboard
- [ ] Request volume and response time charts
- [ ] Error rate monitoring

### Week 3: Advanced Features
- [ ] API-specific detailed analytics
- [ ] Key usage analytics
- [ ] Geographic distribution maps
- [ ] Real-time metrics dashboard

### Week 4: Optimization & Polish
- [ ] Background aggregation jobs
- [ ] Performance optimization
- [ ] Caching implementation
- [ ] UI/UX improvements

## Key Metrics to Track

### API Performance
- **Request Volume**: Requests per hour/day/week
- **Response Times**: Average, P95, P99 response times
- **Error Rates**: 4xx/5xx error percentages
- **Availability**: Uptime percentage

### API Usage
- **Top APIs**: Most frequently used APIs
- **Peak Hours**: Traffic patterns by time of day
- **Geographic Distribution**: Requests by country/region
- **User Agents**: Browser/client distribution

### Key Management
- **Key Usage**: Requests per key
- **Quota Consumption**: Usage vs limits
- **Key Performance**: Response times by key
- **Popular Endpoints**: Most accessed paths per key

### Business Metrics
- **Growth Metrics**: New APIs, keys, users over time
- **Resource Usage**: Bandwidth consumption
- **SLA Compliance**: Performance against SLAs
- **Cost Analysis**: Usage-based cost tracking

## Technical Considerations

### Data Retention Policy
- **Raw Requests**: 90 days
- **Hourly Aggregates**: 1 year
- **Daily Aggregates**: 3 years
- **Monthly Summaries**: Indefinite

### Performance Requirements
- **Dashboard Load Time**: < 2 seconds
- **Real-time Updates**: < 5 second lag
- **Historical Queries**: < 5 seconds for 30-day ranges
- **Concurrent Users**: Support 100+ simultaneous dashboard users

### Security & Privacy
- **Data Anonymization**: Option to anonymize IP addresses
- **Access Controls**: Organization-level data isolation
- **Audit Logging**: Track analytics access
- **GDPR Compliance**: Data retention and deletion capabilities

## Next Steps

1. **Update Docker Compose**: Add Tyk Pump service
2. **Database Migration**: Add analytics tables to schema
3. **Backend Implementation**: Start with basic analytics service
4. **Frontend Dashboard**: Create analytics section in navigation
5. **Testing**: Verify data flow from Tyk → Pump → Database → Frontend

This analytics solution will provide TykBasic with enterprise-grade API analytics while maintaining our simple, integrated architecture. 