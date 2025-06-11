const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const Organization = sequelize.define('Organization', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [2, 100]
      }
    },
    display_name: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [2, 100]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    domain: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrlIfNotEmpty(value) {
          if (value && value.trim() !== '') {
            const urlRegex = /^https?:\/\/([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
            if (!urlRegex.test(value)) {
              throw new Error('Domain must be a valid URL');
            }
          }
        }
      }
    },
    // New field for automatic domain-based assignment
    auto_assign_domains: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'List of email domains that will automatically assign users to this organization'
    },
    // Organization configuration
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    settings: {
      type: DataTypes.JSON,
      defaultValue: {
        require_admin_approval: true,
        require_email_verification: true,
        require_2fa: false,
        default_user_role: 'user',
        session_timeout: 24,
        password_policy: {
          min_length: 8,
          require_uppercase: true,
          require_lowercase: true,
          require_numbers: true,
          require_symbols: false
        }
      }
    },
    // Rate limiting defaults for this organization
    default_rate_limits: {
      type: DataTypes.JSON,
      defaultValue: {
        allowance: 10000,
        rate: 1000,
        per: 60,
        quota_max: 100000,
        quota_renewal_rate: 3600
      }
    },
    // Tyk-specific settings
    tyk_org_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      comment: 'Organization ID in Tyk Gateway'
    },
    tyk_org_key: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Organization-level rate limiting key in Tyk'
    },
    // Contact information
    contact_email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmailIfNotEmpty(value) {
          if (value && value.trim() !== '') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
              throw new Error('Contact email must be a valid email address');
            }
          }
        }
      }
    },
    contact_phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Address information
    address: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {}
    },
    // Policy management permissions
    allow_admin_policy_creation: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Allow organization admins to create policies'
    },
    // Statistics
    user_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    api_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
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
    tableName: 'organizations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (organization) => {
        if (!organization.id) {
          organization.id = uuidv4();
        }
        if (!organization.display_name) {
          organization.display_name = organization.name;
        }
        if (!organization.tyk_org_id) {
          // Generate a Tyk-compatible organization ID
          organization.tyk_org_id = organization.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        }
      },
      beforeUpdate: async (organization) => {
        if (organization.changed('name') && !organization.display_name) {
          organization.display_name = organization.name;
        }
      }
    }
  });

  // Instance methods
  Organization.prototype.updateUserCount = async function() {
    const count = await this.countUsers();
    this.user_count = count;
    await this.save();
    return count;
  };

  Organization.prototype.updateApiCount = async function() {
    const count = await this.countApis();
    this.api_count = count;
    await this.save();
    return count;
  };

  Organization.prototype.getSetting = function(key, defaultValue = null) {
    if (!this.settings || typeof this.settings !== 'object') {
      return defaultValue;
    }
    
    const keys = key.split('.');
    let value = this.settings;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  };

  Organization.prototype.setSetting = async function(key, value) {
    if (!this.settings || typeof this.settings !== 'object') {
      this.settings = {};
    }
    
    const keys = key.split('.');
    let current = this.settings;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!current[k] || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }
    
    current[keys[keys.length - 1]] = value;
    this.changed('settings', true);
    await this.save();
  };

  Organization.prototype.getDefaultRateLimit = function(type = 'allowance') {
    return this.default_rate_limits?.[type] || 0;
  };

  // New method to check if an email domain should auto-assign to this organization
  Organization.prototype.shouldAutoAssignDomain = function(email) {
    if (!this.auto_assign_domains || !Array.isArray(this.auto_assign_domains)) {
      return false;
    }
    
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (!emailDomain) return false;
    
    return this.auto_assign_domains.some(domain => {
      // Support wildcards like *.company.com
      if (domain.includes('*')) {
        const pattern = domain.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`, 'i');
        return regex.test(emailDomain);
      }
      // Exact domain match
      return domain.toLowerCase() === emailDomain;
    });
  };

  // Static method to find organization by email domain
  Organization.findByEmailDomain = async function(email) {
    const organizations = await this.findAll({
      where: { is_active: true }
    });
    
    for (const org of organizations) {
      if (org.shouldAutoAssignDomain(email)) {
        return org;
      }
    }
    
    return null;
  };

  Organization.prototype.toSafeObject = function() {
    return {
      id: this.id,
      name: this.name,
      display_name: this.display_name,
      description: this.description,
      domain: this.domain,
      is_active: this.is_active,
      settings: this.settings,
      default_rate_limits: this.default_rate_limits,
      contact_email: this.contact_email,
      contact_phone: this.contact_phone,
      address: this.address,
      user_count: this.user_count,
      api_count: this.api_count,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  };

  // Class methods
  Organization.findByName = function(name) {
    return this.findOne({ where: { name } });
  };

  Organization.findByTykOrgId = function(tykOrgId) {
    return this.findOne({ where: { tyk_org_id: tykOrgId } });
  };

  Organization.findActiveOrganizations = function() {
    return this.findAll({ where: { is_active: true } });
  };

  return Organization;
}; 