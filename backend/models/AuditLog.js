const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    // Who performed the action
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    // Context information
    organization_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Organizations',
        key: 'id'
      }
    },
    // Action details
    action: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Action performed (e.g., CREATE, UPDATE, DELETE, LOGIN, LOGOUT)'
    },
    resource_type: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Type of resource affected (e.g., User, Organization, API, Key)'
    },
    resource_id: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'ID of the specific resource affected'
    },
    // Detailed information
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Human-readable description of the action'
    },
    details: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Detailed information about the action, changes made, etc.'
    },
    // Request information
    ip_address: {
      type: DataTypes.INET,
      allowNull: true
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    request_method: {
      type: DataTypes.STRING,
      allowNull: true
    },
    request_path: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Result information
    status: {
      type: DataTypes.ENUM('success', 'failure', 'error'),
      allowNull: false,
      defaultValue: 'success'
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Severity level
    severity: {
      type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
      allowNull: false,
      defaultValue: 'info'
    },
    // Additional metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    // Timestamp
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'audit_logs',
    timestamps: false, // Only created_at, no updated_at for audit logs
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['organization_id']
      },
      {
        fields: ['action']
      },
      {
        fields: ['resource_type']
      },
      {
        fields: ['resource_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['severity']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['ip_address']
      }
    ],
    hooks: {
      beforeCreate: async (auditLog) => {
        if (!auditLog.id) {
          auditLog.id = uuidv4();
        }
      }
    }
  });

  // Class methods for logging different types of actions
  AuditLog.logUserAction = async function(userId, action, resourceType, resourceId, description, details = {}, req = null) {
    const logData = {
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      description,
      details,
      status: 'success'
    };

    if (req) {
      logData.ip_address = req.ip || req.connection?.remoteAddress;
      logData.user_agent = req.get('User-Agent');
      logData.request_method = req.method;
      logData.request_path = req.path;
    }

    return this.create(logData);
  };

  AuditLog.logAuthEvent = async function(userId, action, status = 'success', errorMessage = null, req = null) {
    const logData = {
      user_id: userId,
      action,
      resource_type: 'Authentication',
      description: `User ${action.toLowerCase()}`,
      status,
      error_message: errorMessage,
      severity: status === 'success' ? 'info' : 'warning'
    };

    if (req) {
      logData.ip_address = req.ip || req.connection?.remoteAddress;
      logData.user_agent = req.get('User-Agent');
      logData.request_method = req.method;
      logData.request_path = req.path;
    }

    return this.create(logData);
  };

  AuditLog.logApiAction = async function(userId, organizationId, action, apiId, description, details = {}, req = null) {
    return this.logUserAction(
      userId,
      action,
      'API',
      apiId,
      description,
      { ...details, organization_id: organizationId },
      req
    );
  };

  AuditLog.logKeyAction = async function(userId, organizationId, action, keyId, description, details = {}, req = null) {
    return this.logUserAction(
      userId,
      action,
      'APIKey',
      keyId,
      description,
      { ...details, organization_id: organizationId },
      req
    );
  };

  AuditLog.logCertificateAction = async function(userId, organizationId, action, certId, description, details = {}, req = null) {
    return this.logUserAction(
      userId,
      action,
      'Certificate',
      certId,
      description,
      { ...details, organization_id: organizationId },
      req
    );
  };

  AuditLog.logAdminAction = async function(adminId, action, resourceType, resourceId, description, details = {}, req = null) {
    const logData = {
      user_id: adminId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      description,
      details,
      status: 'success',
      severity: 'warning' // Admin actions are generally more important
    };

    if (req) {
      logData.ip_address = req.ip || req.connection?.remoteAddress;
      logData.user_agent = req.get('User-Agent');
      logData.request_method = req.method;
      logData.request_path = req.path;
    }

    return this.create(logData);
  };

  AuditLog.logSystemEvent = async function(action, resourceType, resourceId, description, details = {}, severity = 'info') {
    return this.create({
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      description,
      details,
      status: 'success',
      severity
    });
  };

  AuditLog.logError = async function(userId, action, resourceType, resourceId, errorMessage, details = {}, req = null) {
    const logData = {
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      description: `Error during ${action}`,
      details,
      status: 'error',
      error_message: errorMessage,
      severity: 'error'
    };

    if (req) {
      logData.ip_address = req.ip || req.connection?.remoteAddress;
      logData.user_agent = req.get('User-Agent');
      logData.request_method = req.method;
      logData.request_path = req.path;
    }

    return this.create(logData);
  };

  // Query methods
  AuditLog.findByUser = function(userId, limit = 100) {
    return this.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit
    });
  };

  AuditLog.findByOrganization = function(organizationId, limit = 100) {
    return this.findAll({
      where: { organization_id: organizationId },
      order: [['created_at', 'DESC']],
      limit
    });
  };

  AuditLog.findByResource = function(resourceType, resourceId, limit = 100) {
    return this.findAll({
      where: { resource_type: resourceType, resource_id: resourceId },
      order: [['created_at', 'DESC']],
      limit
    });
  };

  AuditLog.findByAction = function(action, limit = 100) {
    return this.findAll({
      where: { action },
      order: [['created_at', 'DESC']],
      limit
    });
  };

  AuditLog.findRecentActivity = function(hours = 24, limit = 100) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.findAll({
      where: {
        created_at: {
          [sequelize.Sequelize.Op.gte]: since
        }
      },
      order: [['created_at', 'DESC']],
      limit
    });
  };

  AuditLog.findFailedActions = function(hours = 24, limit = 100) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.findAll({
      where: {
        status: ['failure', 'error'],
        created_at: {
          [sequelize.Sequelize.Op.gte]: since
        }
      },
      order: [['created_at', 'DESC']],
      limit
    });
  };

  AuditLog.findSecurityEvents = function(hours = 24, limit = 100) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.findAll({
      where: {
        [sequelize.Sequelize.Op.or]: [
          { action: ['LOGIN_FAILED', 'ACCOUNT_LOCKED', 'PASSWORD_RESET', 'UNAUTHORIZED_ACCESS'] },
          { severity: ['error', 'critical'] }
        ],
        created_at: {
          [sequelize.Sequelize.Op.gte]: since
        }
      },
      order: [['created_at', 'DESC']],
      limit
    });
  };

  // Cleanup old logs
  AuditLog.cleanupOldLogs = async function(daysToKeep = 90) {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    const result = await this.destroy({
      where: {
        created_at: {
          [sequelize.Sequelize.Op.lt]: cutoffDate
        },
        severity: ['info'] // Only delete info-level logs, keep warnings and errors longer
      }
    });
    return result;
  };

  return AuditLog;
}; 