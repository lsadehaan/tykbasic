const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const ApiAccessGrant = sequelize.define('ApiAccessGrant', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    api_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'ApiDefinitions',
        key: 'id'
      }
    },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Organizations',
        key: 'id'
      }
    },
    access_level: {
      type: DataTypes.ENUM('read', 'write', 'admin'),
      allowNull: false,
      defaultValue: 'read'
    },
    granted_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    // Rate limiting overrides
    custom_rate_limits: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Override default rate limits for this user/API combination'
    },
    // Quota overrides
    custom_quota: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Override default quotas for this user/API combination'
    },
    // Allowed versions
    allowed_versions: {
      type: DataTypes.JSON,
      defaultValue: ['Default'],
      comment: 'API versions this user can access'
    },
    // Path restrictions
    allowed_paths: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Specific paths this user can access within the API'
    },
    restricted_paths: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Paths this user cannot access within the API'
    },
    // Time-based access
    valid_from: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When this access grant becomes valid'
    },
    valid_until: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When this access grant expires'
    },
    // Status
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    revoked_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    revoked_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    revocation_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Usage tracking
    first_used: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_used: {
      type: DataTypes.DATE,
      allowNull: true
    },
    usage_count: {
      type: DataTypes.BIGINT,
      defaultValue: 0
    },
    // Additional metadata
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    // Timestamps
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'api_access_grants',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'api_id']
      },
      {
        fields: ['organization_id']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['valid_from', 'valid_until']
      }
    ],
    hooks: {
      beforeCreate: async (grant) => {
        if (!grant.id) {
          grant.id = uuidv4();
        }
      }
    }
  });

  // Instance methods
  ApiAccessGrant.prototype.isValid = function() {
    if (!this.is_active) return false;
    
    const now = new Date();
    
    if (this.valid_from && now < this.valid_from) return false;
    if (this.valid_until && now > this.valid_until) return false;
    
    return true;
  };

  ApiAccessGrant.prototype.isExpired = function() {
    if (!this.valid_until) return false;
    return new Date() > this.valid_until;
  };

  ApiAccessGrant.prototype.isExpiringSoon = function(days = 7) {
    if (!this.valid_until) return false;
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + days);
    return this.valid_until <= warningDate && this.valid_until > new Date();
  };

  ApiAccessGrant.prototype.revoke = async function(revokedBy, reason = null) {
    this.is_active = false;
    this.revoked_at = new Date();
    this.revoked_by = revokedBy;
    this.revocation_reason = reason;
    await this.save();
  };

  ApiAccessGrant.prototype.updateUsage = async function() {
    this.usage_count += 1;
    this.last_used = new Date();
    
    if (!this.first_used) {
      this.first_used = new Date();
    }
    
    await this.save();
  };

  ApiAccessGrant.prototype.canAccessPath = function(path) {
    // If allowed_paths is specified, path must be in the list
    if (this.allowed_paths && this.allowed_paths.length > 0) {
      const allowed = this.allowed_paths.some(allowedPath => {
        if (allowedPath.endsWith('*')) {
          return path.startsWith(allowedPath.slice(0, -1));
        }
        return path === allowedPath;
      });
      if (!allowed) return false;
    }
    
    // If restricted_paths is specified, path must not be in the list
    if (this.restricted_paths && this.restricted_paths.length > 0) {
      const restricted = this.restricted_paths.some(restrictedPath => {
        if (restrictedPath.endsWith('*')) {
          return path.startsWith(restrictedPath.slice(0, -1));
        }
        return path === restrictedPath;
      });
      if (restricted) return false;
    }
    
    return true;
  };

  ApiAccessGrant.prototype.canAccessVersion = function(version) {
    if (!this.allowed_versions || this.allowed_versions.length === 0) {
      return true; // No version restrictions
    }
    return this.allowed_versions.includes(version);
  };

  ApiAccessGrant.prototype.toSafeObject = function() {
    return {
      id: this.id,
      user_id: this.user_id,
      api_id: this.api_id,
      organization_id: this.organization_id,
      access_level: this.access_level,
      granted_by: this.granted_by,
      custom_rate_limits: this.custom_rate_limits,
      custom_quota: this.custom_quota,
      allowed_versions: this.allowed_versions,
      allowed_paths: this.allowed_paths,
      restricted_paths: this.restricted_paths,
      valid_from: this.valid_from,
      valid_until: this.valid_until,
      is_active: this.is_active,
      revoked_at: this.revoked_at,
      revoked_by: this.revoked_by,
      revocation_reason: this.revocation_reason,
      first_used: this.first_used,
      last_used: this.last_used,
      usage_count: this.usage_count,
      notes: this.notes,
      metadata: this.metadata,
      is_valid: this.isValid(),
      is_expired: this.isExpired(),
      is_expiring_soon: this.isExpiringSoon(),
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  };

  // Class methods
  ApiAccessGrant.findByUser = function(userId) {
    return this.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']]
    });
  };

  ApiAccessGrant.findByApi = function(apiId) {
    return this.findAll({
      where: { api_id: apiId },
      order: [['created_at', 'DESC']]
    });
  };

  ApiAccessGrant.findByOrganization = function(organizationId) {
    return this.findAll({
      where: { organization_id: organizationId },
      order: [['created_at', 'DESC']]
    });
  };

  ApiAccessGrant.findActiveGrants = function() {
    const now = new Date();
    return this.findAll({
      where: {
        is_active: true,
        [sequelize.Sequelize.Op.or]: [
          { valid_from: null },
          { valid_from: { [sequelize.Sequelize.Op.lte]: now } }
        ],
        [sequelize.Sequelize.Op.or]: [
          { valid_until: null },
          { valid_until: { [sequelize.Sequelize.Op.gt]: now } }
        ]
      },
      order: [['created_at', 'DESC']]
    });
  };

  ApiAccessGrant.findExpiringGrants = function(days = 7) {
    const now = new Date();
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + days);
    
    return this.findAll({
      where: {
        is_active: true,
        valid_until: {
          [sequelize.Sequelize.Op.lte]: warningDate,
          [sequelize.Sequelize.Op.gt]: now
        }
      },
      order: [['valid_until', 'ASC']]
    });
  };

  ApiAccessGrant.findUserApiAccess = function(userId, apiId) {
    return this.findOne({
      where: { user_id: userId, api_id: apiId }
    });
  };

  return ApiAccessGrant;
}; 