const winston = require('winston');

// Create audit logger
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'tykbasic-audit' },
  transports: [
    new winston.transports.File({ filename: 'logs/audit.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  auditLogger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Audit logging function
const logAuditEvent = (action, userId, organizationId, details = {}) => {
  auditLogger.info('Audit Event', {
    action,
    userId,
    organizationId,
    details,
    timestamp: new Date().toISOString()
  });
};

// Tyk operation logging function (for policies route)
const logTykOperation = async (req, action, resourceType, resourceId, details = {}) => {
  const logData = {
    action,
    resourceType,
    resourceId,
    userId: req.user?.id,
    userEmail: req.user?.email,
    organizationId: req.user?.organization_id,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
    details,
    timestamp: new Date().toISOString()
  };
  
  auditLogger.info('Tyk Operation', logData);
  return logData;
};

module.exports = {
  auditLogger,
  logAuditEvent,
  logTykOperation
}; 