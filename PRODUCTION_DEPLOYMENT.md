# TykBasic Production Deployment Guide

## Overview
This guide covers securely deploying TykBasic in production environments, including initial setup, security considerations, and operational best practices.

## ⚠️ Security Warning
**NEVER use the development seeding script (`seed-database.js`) in production!** It creates hardcoded credentials that are logged and easily discoverable.

## Production Bootstrap Methods

### Method 1: Interactive Bootstrap (Recommended for manual deployments)
```bash
cd backend
node scripts/bootstrap-production.js
```
This will prompt you for:
- Super admin email
- Option to generate secure password or enter your own
- All inputs are validated for security requirements

### Method 2: Environment Variables (Recommended for CI/CD)
```bash
export SUPER_ADMIN_EMAIL="admin@yourcompany.com"
export SUPER_ADMIN_PASSWORD="YourSecurePassword123!"
cd backend
node scripts/bootstrap-production.js
```

### Method 3: Command Line Arguments
```bash
cd backend
node scripts/bootstrap-production.js --email admin@yourcompany.com --password YourSecurePassword123!
```

## Password Requirements
The bootstrap script enforces strong password requirements:
- **Minimum 12 characters**
- At least one uppercase letter
- At least one lowercase letter  
- At least one number
- At least one special character
- Special characters allowed: `!@#$%^&*()_+-=[]{}|;:,.<>?`

## Production Environment Setup

### 1. Environment Variables
Create a `.env` file in the backend directory:

```bash
# Database Configuration
NODE_ENV=production
DATABASE_URL=postgresql://user:password@localhost:5432/tykbasic_prod

# Security
JWT_SECRET=your-long-random-jwt-secret-here
SESSION_SECRET=your-long-random-session-secret-here

# TYK Gateway Configuration
TYK_GATEWAY_URL=https://your-tyk-gateway.com
TYK_GATEWAY_SECRET=your-tyk-gateway-admin-secret

# Email Configuration (if using email features)
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password

# Application Configuration
APP_URL=https://your-tykbasic-app.com
FRONTEND_URL=https://your-tykbasic-frontend.com

# SSL/TLS Configuration
HTTPS_CERT_PATH=/path/to/your/certificate.pem
HTTPS_KEY_PATH=/path/to/your/private-key.key
```

### 2. Database Setup

#### PostgreSQL (Recommended)
```bash
# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE tykbasic_prod;
CREATE USER tykbasic WITH ENCRYPTED PASSWORD 'secure-password';
GRANT ALL PRIVILEGES ON DATABASE tykbasic_prod TO tykbasic;
\q
```

#### Database Migration
```bash
cd backend
npm run migrate
```

### 3. SSL/TLS Configuration
Always use HTTPS in production. You can use:
- Let's Encrypt certificates (free)
- Commercial SSL certificates
- Cloud provider SSL termination

### 4. Reverse Proxy Setup (Nginx)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/your/certificate.pem;
    ssl_certificate_key /path/to/your/private-key.key;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Security Checklist

### ✅ Before Going Live
- [ ] Super admin account created with secure password
- [ ] Development seeding script disabled/removed
- [ ] All environment variables properly set
- [ ] HTTPS/SSL configured
- [ ] Database secured with proper user permissions
- [ ] Firewall configured (only necessary ports open)
- [ ] Regular backups configured
- [ ] Log rotation configured
- [ ] Rate limiting configured
- [ ] Security headers configured
- [ ] Dependencies updated to latest versions

### ✅ Post-Deployment
- [ ] Change default JWT and session secrets
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation
- [ ] Set up automated backups
- [ ] Test disaster recovery procedures
- [ ] Configure MFA for admin accounts (when available)
- [ ] Review and audit user permissions regularly

## Container Deployment (Docker)

### Dockerfile for Backend
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3001

USER node

CMD ["npm", "start"]
```

### Docker Compose for Production
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: tykbasic_prod
      POSTGRES_USER: tykbasic
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    networks:
      - tykbasic-network

  backend:
    build: ./backend
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://tykbasic:${DB_PASSWORD}@postgres:5432/tykbasic_prod
      JWT_SECRET: ${JWT_SECRET}
      SESSION_SECRET: ${SESSION_SECRET}
      TYK_GATEWAY_URL: ${TYK_GATEWAY_URL}
      TYK_GATEWAY_SECRET: ${TYK_GATEWAY_SECRET}
    depends_on:
      - postgres
    restart: unless-stopped
    networks:
      - tykbasic-network

  frontend:
    build: ./frontend
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /path/to/ssl/certs:/etc/nginx/certs
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - tykbasic-network

volumes:
  postgres_data:

networks:
  tykbasic-network:
    driver: bridge
```

### Bootstrap in Container
```bash
# After containers are running
docker-compose exec backend node scripts/bootstrap-production.js
```

## Backup Strategy

### Database Backups
```bash
#!/bin/bash
# backup-database.sh
BACKUP_DIR="/backups/tykbasic"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="tykbasic_prod"

mkdir -p $BACKUP_DIR

pg_dump -h localhost -U tykbasic $DB_NAME | gzip > $BACKUP_DIR/tykbasic_$DATE.sql.gz

# Keep only last 30 days of backups
find $BACKUP_DIR -name "tykbasic_*.sql.gz" -mtime +30 -delete
```

### Automated Backups (Cron)
```bash
# Add to crontab
0 2 * * * /path/to/backup-database.sh
```

## Monitoring and Logging

### Application Logs
```javascript
// Configure proper logging in production
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

### Health Check Endpoint
```javascript
// Add to your Express app
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await sequelize.authenticate();
    
    // Check Tyk Gateway connection
    const tykResponse = await fetch(`${process.env.TYK_GATEWAY_URL}/hello`);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      tyk_gateway: tykResponse.ok ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',    
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

## Performance Optimization

### 1. Database Indexing
```sql
-- Add indexes for common queries
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_organization_id ON users (organization_id);
CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_organizations_name ON organizations (name);
```

### 2. Connection Pooling
```javascript
// Configure Sequelize connection pool
const sequelize = new Sequelize(DATABASE_URL, {
  pool: {
    max: 20,
    min: 5,
    acquire: 30000,
    idle: 10000
  }
});
```

### 3. Caching
Consider implementing Redis for session storage and caching:
```javascript
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const redis = require('redis');

const redisClient = redis.createClient();

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // HTTPS only
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
```

## Troubleshooting

### Common Issues
1. **Bootstrap fails with database connection error**
   - Check DATABASE_URL environment variable
   - Ensure database is running and accessible
   - Verify database credentials

2. **Super admin creation fails**
   - Check if user already exists
   - Verify email format
   - Ensure password meets requirements

3. **TYK Gateway integration issues**
   - Verify TYK_GATEWAY_URL and TYK_GATEWAY_SECRET
   - Check network connectivity to Tyk Gateway
   - Review Tyk Gateway logs for errors

### Getting Help
- Check application logs in `/logs` directory
- Review database connection settings
- Verify all environment variables are set
- Test individual components (database, Tyk Gateway) separately

## Security Updates
- Regularly update Node.js and dependencies
- Monitor security advisories
- Use `npm audit` to check for vulnerabilities
- Implement automated security scanning in CI/CD

---

**Remember**: Production deployment requires careful planning and testing. Always test the deployment process in a staging environment that mirrors production before going live. 