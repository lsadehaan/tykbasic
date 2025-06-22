const winston = require('winston');

// Configure request logger
const requestLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'tykbasic-requests' },
  transports: [
    new winston.transports.File({ filename: 'logs/requests.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  requestLogger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

const logger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.user?.id,
    organizationId: req.user?.organization_id
  };

  // Override res.end to capture response info
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime;
    
    // Log response
    requestLogger.info({
      ...logData,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: res.get('Content-Length') || 0
    });

    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

module.exports = logger; 