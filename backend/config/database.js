const { Sequelize } = require('sequelize');
const winston = require('winston');
const path = require('path');

// Create logger for database operations
const dbLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'tykbasic-database' },
  transports: [
    new winston.transports.File({ filename: 'logs/database.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  dbLogger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Database configuration
const config = {
  development: {
    dialect: 'sqlite',
    storage: path.join(__dirname, '../../data/tykbasic.sqlite'),
    logging: (msg) => dbLogger.info(msg),
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },
  test: {
    dialect: 'sqlite',
    storage: ':memory:', // In-memory database for tests
    logging: false
  },
  production: {
    // Use PostgreSQL in production if DATABASE_URL is provided
    ...(process.env.DATABASE_URL ? {
      use_env_variable: 'DATABASE_URL',
      dialect: 'postgres',
      logging: false,
      pool: {
        max: 20,
        min: 5,
        acquire: 30000,
        idle: 10000
      },
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    } : {
      // Fallback to SQLite even in production
      dialect: 'sqlite',
      storage: path.join(__dirname, '../../data/tykbasic_production.sqlite'),
      logging: false,
      pool: {
        max: 10,
        min: 2,
        acquire: 30000,
        idle: 10000
      }
    })
  }
};

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Create Sequelize instance
let sequelize;
if (dbConfig.use_env_variable) {
  sequelize = new Sequelize(process.env[dbConfig.use_env_variable], dbConfig);
} else {
  sequelize = new Sequelize(dbConfig);
}

module.exports = {
  sequelize,
  config
}; 