const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const UserCredentials = sequelize.define('UserCredentials', {
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
    organization_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Organizations',
        key: 'id'
      }
    },
    credential_type: {
      type: DataTypes.ENUM('api_key', 'mtls_certificate', 'hmac_signature'),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 100]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Tyk Gateway information
    tyk_key_id: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Key ID in Tyk Gateway'
    },
    tyk_key_hash: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Hashed key for Tyk API operations'
    },
    // API Key configuration
    api_key_data: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {}
    },
    // mTLS Certificate information
    certificate_id: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Certificate ID in Tyk Gateway'
    },
    certificate_fingerprint: {
      type: DataTypes.STRING,
      allowNull: true
    },
    certificate_data: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {}
    },
    certificate_expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // HMAC configuration
    hmac_secret: {
      type: DataTypes.STRING,
      allowNull: true
    },
    hmac_algorithm: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'hmac-sha256'
    },
    // Rate limiting and quota
    rate_limits: {
      type: DataTypes.JSON,
      defaultValue: {
        allowance: 1000,
        rate: 100,
        per: 60,
        quota_max: 10000,
        quota_renewal_rate: 3600
      }
    },
    // Access rights
    access_rights: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    // Status and metadata
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    last_used: {
      type: DataTypes.DATE,
      allowNull: true
    },
    usage_stats: {
      type: DataTypes.JSON,
      defaultValue: {
        total_requests: 0,
        last_request_date: null,
        error_count: 0
      }
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'user_credentials',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (credential) => {
        if (!credential.id) {
          credential.id = uuidv4();
        }
      }
    }
  });

  // Instance methods
  UserCredentials.prototype.isExpired = function() {
    if (!this.expires_at) return false;
    return new Date() > this.expires_at;
  };

  UserCredentials.prototype.isCertificateExpired = function() {
    if (!this.certificate_expires_at) return false;
    return new Date() > this.certificate_expires_at;
  };

  UserCredentials.prototype.isCertificateExpiringSoon = function(days = 30) {
    if (!this.certificate_expires_at) return false;
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + days);
    return this.certificate_expires_at <= warningDate;
  };

  UserCredentials.prototype.updateUsageStats = async function() {
    this.usage_stats.total_requests += 1;
    this.usage_stats.last_request_date = new Date();
    this.last_used = new Date();
    this.changed('usage_stats', true);
    await this.save();
  };

  UserCredentials.prototype.addApiAccess = async function(apiId, apiName, versions = ['Default']) {
    if (!this.access_rights) {
      this.access_rights = {};
    }
    
    this.access_rights[apiId] = {
      api_id: apiId,
      api_name: apiName,
      versions: versions,
      allowed_urls: [],
      limit: null,
      allowance_scope: ""
    };
    
    this.changed('access_rights', true);
    await this.save();
  };

  UserCredentials.prototype.removeApiAccess = async function(apiId) {
    if (this.access_rights && this.access_rights[apiId]) {
      delete this.access_rights[apiId];
      this.changed('access_rights', true);
      await this.save();
    }
  };

  UserCredentials.prototype.toSafeObject = function() {
    return {
      id: this.id,
      user_id: this.user_id,
      organization_id: this.organization_id,
      credential_type: this.credential_type,
      name: this.name,
      description: this.description,
      tyk_key_id: this.tyk_key_id,
      certificate_id: this.certificate_id,
      certificate_fingerprint: this.certificate_fingerprint,
      certificate_expires_at: this.certificate_expires_at,
      hmac_algorithm: this.hmac_algorithm,
      rate_limits: this.rate_limits,
      access_rights: this.access_rights,
      is_active: this.is_active,
      last_used: this.last_used,
      usage_stats: this.usage_stats,
      expires_at: this.expires_at,
      is_expired: this.isExpired(),
      is_certificate_expired: this.isCertificateExpired(),
      is_certificate_expiring_soon: this.isCertificateExpiringSoon(),
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  };

  // Class methods
  UserCredentials.findByUser = function(userId) {
    return this.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']]
    });
  };

  UserCredentials.findByOrganization = function(organizationId) {
    return this.findAll({
      where: { organization_id: organizationId },
      order: [['created_at', 'DESC']]
    });
  };

  UserCredentials.findByTykKeyId = function(tykKeyId) {
    return this.findOne({ where: { tyk_key_id: tykKeyId } });
  };

  UserCredentials.findByCertificateId = function(certificateId) {
    return this.findOne({ where: { certificate_id: certificateId } });
  };

  UserCredentials.findExpiringCertificates = function(days = 30) {
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + days);
    
    return this.findAll({
      where: {
        credential_type: 'mtls_certificate',
        is_active: true,
        certificate_expires_at: {
          [sequelize.Sequelize.Op.lte]: warningDate,
          [sequelize.Sequelize.Op.gt]: new Date()
        }
      }
    });
  };

  UserCredentials.findActiveCredentials = function() {
    return this.findAll({
      where: { is_active: true },
      order: [['created_at', 'DESC']]
    });
  };

  return UserCredentials;
}; 