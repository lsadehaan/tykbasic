const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const SystemConfig = sequelize.define('SystemConfig', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [1, 100]
      }
    },
    value: {
      type: DataTypes.JSON,
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    updated_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      }
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
    tableName: 'system_config',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (config) => {
        if (!config.id) {
          config.id = uuidv4();
        }
      }
    }
  });

  // Class methods
  SystemConfig.getValue = async function(key, defaultValue = null) {
    const config = await this.findOne({
      where: { key, is_active: true }
    });
    return config ? config.value : defaultValue;
  };

  SystemConfig.setValue = async function(key, value, userId = null, description = null) {
    const [config, created] = await this.findOrCreate({
      where: { key },
      defaults: {
        key,
        value,
        description,
        created_by: userId,
        updated_by: userId
      }
    });

    if (!created) {
      config.value = value;
      config.updated_by = userId;
      if (description) {
        config.description = description;
      }
      await config.save();
    }

    return config;
  };

  SystemConfig.getMultiple = async function(keys) {
    const configs = await this.findAll({
      where: { 
        key: keys,
        is_active: true 
      }
    });
    
    const result = {};
    configs.forEach(config => {
      result[config.key] = config.value;
    });
    
    return result;
  };

  SystemConfig.getAuthConfig = async function() {
    return this.getMultiple([
      'require_email_verification',
      'require_admin_approval',
      'require_2fa',
      'max_login_attempts',
      'account_lockout_time',
      'session_timeout',
      'password_policy'
    ]);
  };

  SystemConfig.getTykConfig = async function() {
    return this.getMultiple([
      'tyk_gateway_url',
      'tyk_secret',
      'default_rate_limits',
      'certificate_expiry_warning_days'
    ]);
  };

  return SystemConfig;
}; 