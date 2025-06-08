const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [8, 255]
      }
    },
    first_name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 100]
      }
    },
    last_name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 100]
      }
    },
    role: {
      type: DataTypes.ENUM('super_admin', 'admin', 'user', 'viewer'),
      allowNull: false,
      defaultValue: 'user'
    },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Organizations',
        key: 'id'
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    email_verification_token: {
      type: DataTypes.STRING,
      allowNull: true
    },
    email_verification_expires: {
      type: DataTypes.DATE,
      allowNull: true
    },
    password_reset_token: {
      type: DataTypes.STRING,
      allowNull: true
    },
    password_reset_expires: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // 2FA fields
    two_factor_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    two_factor_secret: {
      type: DataTypes.STRING,
      allowNull: true
    },
    two_factor_backup_codes: {
      type: DataTypes.JSON,
      allowNull: true
    },
    // Account security
    failed_login_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    account_locked_until: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_password_change: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    // Preferences
    preferences: {
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
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
          user.password = await bcrypt.hash(user.password, salt);
        }
        if (!user.id) {
          user.id = uuidv4();
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
          user.password = await bcrypt.hash(user.password, salt);
          user.last_password_change = new Date();
        }
      }
    }
  });

  // Instance methods
  User.prototype.validatePassword = async function(password) {
    return bcrypt.compare(password, this.password);
  };

  User.prototype.generateEmailVerificationToken = function() {
    this.email_verification_token = uuidv4();
    this.email_verification_expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    return this.email_verification_token;
  };

  User.prototype.generatePasswordResetToken = function() {
    this.password_reset_token = uuidv4();
    this.password_reset_expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    return this.password_reset_token;
  };

  User.prototype.incrementFailedLoginAttempts = async function() {
    this.failed_login_attempts += 1;
    
    const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
    const lockoutTime = parseInt(process.env.LOCKOUT_TIME) || 15 * 60 * 1000; // 15 minutes
    
    if (this.failed_login_attempts >= maxAttempts) {
      this.account_locked_until = new Date(Date.now() + lockoutTime);
    }
    
    await this.save();
  };

  User.prototype.resetFailedLoginAttempts = async function() {
    this.failed_login_attempts = 0;
    this.account_locked_until = null;
    this.last_login = new Date();
    await this.save();
  };

  User.prototype.isAccountLocked = function() {
    return this.account_locked_until && this.account_locked_until > new Date();
  };

  User.prototype.getFullName = function() {
    return `${this.first_name} ${this.last_name}`;
  };

  User.prototype.toSafeObject = function() {
    return {
      id: this.id,
      email: this.email,
      first_name: this.first_name,
      last_name: this.last_name,
      full_name: this.getFullName(),
      role: this.role,
      organization_id: this.organization_id,
      is_active: this.is_active,
      is_verified: this.is_verified,
      two_factor_enabled: this.two_factor_enabled,
      last_login: this.last_login,
      preferences: this.preferences,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  };

  // Class methods
  User.findByEmail = function(email) {
    return this.findOne({ where: { email: email.toLowerCase() } });
  };

  User.findActiveUsers = function() {
    return this.findAll({ where: { is_active: true } });
  };

  User.findByOrganization = function(organizationId) {
    return this.findAll({ where: { organization_id: organizationId } });
  };

  return User;
}; 