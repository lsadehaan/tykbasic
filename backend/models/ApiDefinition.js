const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const ApiDefinition = sequelize.define('ApiDefinition', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Organizations',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 100]
      }
    },
    api_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: 'API ID in Tyk Gateway'
    },
    listen_path: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Path that Tyk listens on'
    },
    target_url: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isUrl: true
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    version: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Default'
    },
    // API Configuration
    api_definition: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Complete Tyk API definition'
    },
    // Authentication settings
    auth_type: {
      type: DataTypes.ENUM('none', 'auth_token', 'basic_auth', 'oauth2', 'jwt', 'hmac', 'mtls'),
      allowNull: false,
      defaultValue: 'auth_token'
    },
    use_keyless: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    // Rate limiting
    rate_limits: {
      type: DataTypes.JSON,
      defaultValue: {
        enabled: true,
        rate: 1000,
        per: 60
      }
    },
    // Quotas
    quota_config: {
      type: DataTypes.JSON,
      defaultValue: {
        enabled: false,
        quota_max: 10000,
        quota_renewal_rate: 3600
      }
    },
    // CORS settings
    cors_config: {
      type: DataTypes.JSON,
      defaultValue: {
        enabled: false,
        allowed_origins: ["*"],
        allowed_methods: ["GET", "POST", "PUT", "DELETE"],
        allowed_headers: ["Origin", "Content-Type", "Authorization"]
      }
    },
    // Caching
    cache_config: {
      type: DataTypes.JSON,
      defaultValue: {
        enabled: false,
        timeout: 60
      }
    },
    // Status and metadata
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_deployed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether API is deployed to Tyk Gateway'
    },
    deployment_status: {
      type: DataTypes.ENUM('pending', 'deployed', 'failed', 'updating'),
      defaultValue: 'pending'
    },
    last_deployed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    deployment_error: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Statistics
    total_requests: {
      type: DataTypes.BIGINT,
      defaultValue: 0
    },
    last_request_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Tags and categories
    tags: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true
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
    tableName: 'api_definitions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (api) => {
        if (!api.id) {
          api.id = uuidv4();
        }
        if (!api.api_id) {
          // Generate a unique API ID for Tyk
          api.api_id = `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
      }
    }
  });

  // Instance methods
  ApiDefinition.prototype.updateRequestCount = async function() {
    this.total_requests += 1;
    this.last_request_at = new Date();
    await this.save();
  };

  ApiDefinition.prototype.markAsDeployed = async function() {
    this.is_deployed = true;
    this.deployment_status = 'deployed';
    this.last_deployed_at = new Date();
    this.deployment_error = null;
    await this.save();
  };

  ApiDefinition.prototype.markAsDeploymentFailed = async function(error) {
    this.is_deployed = false;
    this.deployment_status = 'failed';
    this.deployment_error = error;
    await this.save();
  };

  ApiDefinition.prototype.addTag = async function(tag) {
    if (!this.tags) {
      this.tags = [];
    }
    if (!this.tags.includes(tag)) {
      this.tags.push(tag);
      this.changed('tags', true);
      await this.save();
    }
  };

  ApiDefinition.prototype.removeTag = async function(tag) {
    if (this.tags && this.tags.includes(tag)) {
      this.tags = this.tags.filter(t => t !== tag);
      this.changed('tags', true);
      await this.save();
    }
  };

  ApiDefinition.prototype.generateTykDefinition = function() {
    const baseDefinition = {
      name: this.name,
      api_id: this.api_id,
      org_id: "", // Will be set by the organization
      use_keyless: this.use_keyless,
      auth: {
        auth_header_name: "Authorization"
      },
      definition: {
        location: "header",
        key: "x-api-version"
      },
      proxy: {
        listen_path: this.listen_path,
        target_url: this.target_url,
        strip_listen_path: true
      },
      active: this.is_active,
      ...this.api_definition
    };

    return baseDefinition;
  };

  ApiDefinition.prototype.toSafeObject = function() {
    return {
      id: this.id,
      organization_id: this.organization_id,
      name: this.name,
      api_id: this.api_id,
      listen_path: this.listen_path,
      target_url: this.target_url,
      description: this.description,
      version: this.version,
      auth_type: this.auth_type,
      use_keyless: this.use_keyless,
      rate_limits: this.rate_limits,
      quota_config: this.quota_config,
      cors_config: this.cors_config,
      cache_config: this.cache_config,
      is_active: this.is_active,
      is_deployed: this.is_deployed,
      deployment_status: this.deployment_status,
      last_deployed_at: this.last_deployed_at,
      deployment_error: this.deployment_error,
      total_requests: this.total_requests,
      last_request_at: this.last_request_at,
      tags: this.tags,
      category: this.category,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  };

  // Class methods
  ApiDefinition.findByApiId = function(apiId) {
    return this.findOne({ where: { api_id: apiId } });
  };

  ApiDefinition.findByOrganization = function(organizationId) {
    return this.findAll({
      where: { organization_id: organizationId },
      order: [['created_at', 'DESC']]
    });
  };

  ApiDefinition.findActiveApis = function() {
    return this.findAll({
      where: { is_active: true },
      order: [['name', 'ASC']]
    });
  };

  ApiDefinition.findDeployedApis = function() {
    return this.findAll({
      where: { is_deployed: true },
      order: [['last_deployed_at', 'DESC']]
    });
  };

  ApiDefinition.findByCategory = function(category) {
    return this.findAll({
      where: { category },
      order: [['name', 'ASC']]
    });
  };

  ApiDefinition.findByTag = function(tag) {
    return this.findAll({
      where: sequelize.literal(`JSON_CONTAINS(tags, '"${tag}"')`),
      order: [['name', 'ASC']]
    });
  };

  return ApiDefinition;
}; 