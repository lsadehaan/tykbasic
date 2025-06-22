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
const logTykOperation = async (userIdOrReq, action, resourceTypeOrDetails, resourceId, details = {}) => {
  let logData;
  
  // Handle both request object and direct parameter cases
  if (typeof userIdOrReq === 'object' && userIdOrReq !== null) {
    // Request object case
    logData = {
      action,
      resourceType: resourceTypeOrDetails,
      resourceId,
      userId: userIdOrReq.user?.id,
      userEmail: userIdOrReq.user?.email,
      organizationId: userIdOrReq.user?.organization_id,
      ipAddress: userIdOrReq.ip,
      userAgent: userIdOrReq.headers?.['user-agent'],
      details,
      timestamp: new Date().toISOString()
    };
  } else {
    // Direct parameter case
    logData = {
      action,
      userId: userIdOrReq,
      details: resourceTypeOrDetails,
      timestamp: new Date().toISOString()
    };
  }
  
  auditLogger.info('Tyk Operation', logData);
  return logData;
};

module.exports = {
  auditLogger,
  logAuditEvent,
  logTykOperation
}; 