# TykBasic

A streamlined frontend application for managing Tyk Gateway APIs, organizations, users, and authentication methods.

## 🚀 Quick Start

### Development Setup (Zero Dependencies!)

```bash
# 1. Install dependencies and setup database
npm run setup

# 2. Start development server
npm run dev

# 3. Open http://localhost:3000
# Login: admin@tykbasic.local / admin123!
```

That's it! TykBasic uses SQLite by default - no database server needed.

## 📁 Project Structure

```
TykBasic/
├── backend/              # Node.js/Express API server
│   ├── models/          # Database models (Sequelize)
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   └── middleware/      # Authentication, validation
├── frontend/            # React.js web application
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   └── services/    # API client
├── data/                # SQLite database files
├── tyk-configs/         # Tyk Gateway configuration
└── docker-compose.yml   # Full stack deployment
```

## 🗄️ Database Options

### SQLite (Default - Recommended for most use cases)
- ✅ **Zero setup** - works out of the box
- ✅ **Portable** - single file database
- ✅ **Fast** - perfect for small-medium workloads
- ✅ **Easy backup** - just copy the file

```bash
# Database file location
data/tykbasic.sqlite

# View database
sqlite3 data/tykbasic.sqlite
```

### PostgreSQL (Optional - for large deployments)
```bash
# Set environment variable to use PostgreSQL
export DATABASE_URL="postgresql://user:pass@localhost:5432/tykbasic"
npm run dev
```

## 🐳 Docker Deployment

### Deploy with Tyk Gateway (Recommended)

```bash
# 1. Set your secrets in .env or docker-compose.yml
export TYK_SECRET="your-tyk-gateway-secret"
export JWT_SECRET="your-jwt-secret"

# 2. Start full stack (Tyk Gateway + Redis + TykBasic)
docker-compose up -d

# 3. Access services
# TykBasic:     http://localhost:3000
# Tyk Gateway:  http://localhost:8080
# Backend API:  http://localhost:3001
```

### Standalone Docker

```bash
# Build and run TykBasic only
npm run docker:build
docker run -p 3000:3000 -p 3001:3001 tykbasic
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3001` | Backend server port |
| `TYK_GATEWAY_URL` | `http://localhost:8080` | Tyk Gateway URL |
| `TYK_SECRET` | `your-gateway-secret` | Tyk Gateway API secret |
| `JWT_SECRET` | `your-jwt-secret` | JWT signing secret |
| `DATABASE_URL` | (SQLite) | PostgreSQL connection string |

### Tyk Gateway Setup

1. **Start Tyk Gateway** (if not already running):
   ```bash
   cd tyk-configs
   docker-compose up -d
   ```

2. **Configure Tyk Secret**:
   - Set `TYK_SECRET` in your environment
   - Or update `docker-compose.yml`

3. **Verify Connection**:
   ```bash
   curl http://localhost:8080/hello
   ```

## 🔐 Authentication Features

- **Email Whitelisting** - Control who can register
- **Admin Approval** - Manual user approval workflow
- **2FA Support** - Optional two-factor authentication
- **Account Lockout** - Protection against brute force
- **Password Policies** - Configurable requirements
- **Audit Logging** - Complete action history

## 🔑 API Key Management

- **Standard API Keys** - Basic Tyk key creation
- **mTLS Certificates** - Certificate-based authentication
- **HMAC Signatures** - Signature-based authentication
- **Rate Limiting** - Per-key rate limits
- **Access Control** - Fine-grained API permissions

## 📊 Admin Features

- **User Management** - Create, approve, suspend users
- **Organization Management** - Multi-tenant support
- **API Management** - Create and deploy APIs to Tyk
- **Certificate Management** - Upload and generate certificates
- **System Configuration** - Global settings
- **Audit Dashboard** - Security and usage monitoring

## 🛠️ Development

### Scripts

```bash
npm run dev          # Start development servers
npm run setup        # Full setup (install + database)
npm run dev-setup    # Initialize database only
npm run backend:dev  # Backend only
npm run frontend:dev # Frontend only
npm run docker:up    # Start Docker stack
npm run docker:down  # Stop Docker stack
npm run docker:logs  # View TykBasic logs
```

### Database Management

```bash
# View database tables
sqlite3 data/tykbasic.sqlite ".tables"

# View users
sqlite3 data/tykbasic.sqlite "SELECT email, role FROM users;"

# Reset database (delete and recreate)
rm data/tykbasic.sqlite
npm run dev-setup
```

## 📚 API Documentation

The backend API is documented in the Swagger specification:
- **Gateway API**: `gateway-swagger.yml`
- **Implementation Guide**: `TYK_FRONTEND_IMPLEMENTATION_GUIDE.md`

## 🔍 Testing

```bash
# Run comprehensive Tyk API tests
cd tests
npm test

# Test specific API functionality
node test-tyk-api.js
```

## 🚢 Production Deployment

### 1. Docker Compose (Recommended)

```yaml
# docker-compose.yml
version: '3.8'
services:
  tykbasic:
    image: tykbasic:latest
    environment:
      - NODE_ENV=production
      - TYK_SECRET=your-production-secret
      - JWT_SECRET=your-production-jwt-secret
    volumes:
      - ./data:/app/data
```

### 2. Manual Deployment

```bash
# Build frontend
cd frontend && npm run build

# Start production server
NODE_ENV=production npm run backend:start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- **Documentation**: Check `TYK_FRONTEND_IMPLEMENTATION_GUIDE.md`
- **Issues**: Create a GitHub issue
- **Tests**: Run `tests/test-tyk-api.js` for API validation

---

**TykBasic** - Streamlined Tyk Gateway Management Made Simple! 🚀 