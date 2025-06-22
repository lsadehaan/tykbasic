const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const winston = require('winston');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const tykRoutes = require('./routes/tyk');
const userRoutes = require('./routes/user');
const policyRoutes = require('./routes/policies');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const logger = require('./middleware/logger');

// Import database
const { sequelize, User, Organization } = require('./models');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure Winston logger
const appLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'tykbasic-backend' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  appLogger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tyk-authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  trustProxy: false // Disable X-Forwarded-For header validation for development
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(logger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tyk', tykRoutes);
app.use('/api/user', userRoutes);
app.use('/api/policies', policyRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
  });
}

// Error handling middleware (must be last)
app.use(errorHandler);

// Auto-create initial data if it doesn't exist
async function createInitialData() {
  try {
    // Check if default organization exists
    let defaultOrg = await Organization.findOne({ where: { name: 'default' } });
    
    if (!defaultOrg) {
      defaultOrg = await Organization.create({
        name: 'default',
        display_name: 'Default Organization',
        description: 'Default organization for TykBasic',
        tyk_org_id: 'default'
      });
      appLogger.info('✅ Default organization created');
    }
    
    // Check if admin user exists
    const adminUser = await User.findOne({ where: { email: 'admin@tykbasic.local' } });
    
    if (!adminUser) {
      await User.create({
        email: 'admin@tykbasic.local',
        password: 'admin123!', // Will be hashed automatically
        first_name: 'Admin',
        last_name: 'User',
        role: 'super_admin',
        organization_id: defaultOrg.id,
        is_verified: true,
        is_active: true
      });
      appLogger.info('✅ Admin user created (admin@tykbasic.local / admin123!)');
    }
    
  } catch (error) {
    appLogger.warn('⚠️  Initial data setup failed:', error.message);
  }
}

// Database connection and server startup
async function startServer() {
  try {
    // Test database connection
    await sequelize.authenticate();
    appLogger.info('Database connection established successfully.');
    
    // Sync database - create tables only if they don't exist
    // This is safe and won't modify existing table structures
    await sequelize.sync({ force: false });
    appLogger.info('Database synchronized successfully.');
    
    // Auto-create initial data if none exists
    await createInitialData();
    
    // Initialize email service
    try {
      const emailService = require('./services/emailService');
      const emailConfigured = await emailService.loadConfig();
      if (emailConfigured) {
        appLogger.info('✅ Email service initialized successfully');
      } else {
        appLogger.info('⚠️  Email service not configured - emails will not be sent');
      }
    } catch (emailError) {
      appLogger.error('❌ Email service initialization failed:', emailError.message);
    }

    // Initialize Tyk Gateway service
    try {
      const tykGatewayService = require('./services/TykGatewayService');
      const tykConfigured = await tykGatewayService.initialize();
      if (tykConfigured) {
        appLogger.info('✅ Tyk Gateway service initialized successfully');
        
        // Test Tyk Gateway connection
        const healthCheck = await tykGatewayService.healthCheck();
        if (healthCheck.status === 'healthy') {
          appLogger.info('✅ Tyk Gateway is healthy and responsive');
        } else {
          appLogger.warn('⚠️  Tyk Gateway health check failed:', healthCheck.message);
        }
      } else {
        appLogger.warn('⚠️  Tyk Gateway service not configured - API management will not work');
      }
    } catch (tykError) {
      appLogger.error('❌ Tyk Gateway service initialization failed:', tykError.message);
    }
    
    // Start server
    app.listen(PORT, () => {
      appLogger.info(`TykBasic backend server running on port ${PORT}`);
      appLogger.info(`Environment: ${process.env.NODE_ENV}`);
      appLogger.info(`Frontend URL: ${process.env.FRONTEND_URL}`);
    });
    
  } catch (error) {
    appLogger.error('Unable to start server:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  appLogger.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  appLogger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  appLogger.info('SIGTERM received, shutting down gracefully');
  await sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  appLogger.info('SIGINT received, shutting down gracefully');
  await sequelize.close();
  process.exit(0);
});

startServer();

module.exports = app;