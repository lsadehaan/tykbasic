const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const PendingUser = sequelize.define('PendingUser', {
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
    password_hash: {
      type: DataTypes.STRING,
      allowNull: false
    },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Organizations',
        key: 'id'
      }
    },
    requested_role: {
      type: DataTypes.ENUM('user', 'viewer'),
      allowNull: false,
      defaultValue: 'user'
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'expired'),
      allowNull: false,
      defaultValue: 'pending'
    },
    registration_token: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    approved_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    rejection_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    additional_info: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {}
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
    tableName: 'pending_users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (pendingUser) => {
        if (!pendingUser.id) {
          pendingUser.id = uuidv4();
        }
        if (!pendingUser.registration_token) {
          pendingUser.registration_token = uuidv4();
        }
        if (!pendingUser.expires_at) {
          // Default expiration: 7 days
          pendingUser.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }
      }
    }
  });

  // Instance methods
  PendingUser.prototype.isExpired = function() {
    return new Date() > this.expires_at;
  };

  PendingUser.prototype.isPending = function() {
    return this.status === 'pending' && !this.isExpired();
  };

  PendingUser.prototype.approve = async function(adminUser) {
    this.status = 'approved';
    this.approved_by = adminUser.id;
    this.approved_at = new Date();
    await this.save();
  };

  PendingUser.prototype.reject = async function(adminUser, reason = null) {
    this.status = 'rejected';
    this.approved_by = adminUser.id;
    this.approved_at = new Date();
    this.rejection_reason = reason;
    await this.save();
  };

  PendingUser.prototype.getFullName = function() {
    return `${this.first_name} ${this.last_name}`;
  };

  PendingUser.prototype.toSafeObject = function() {
    return {
      id: this.id,
      email: this.email,
      first_name: this.first_name,
      last_name: this.last_name,
      full_name: this.getFullName(),
      organization_id: this.organization_id,
      requested_role: this.requested_role,
      status: this.status,
      expires_at: this.expires_at,
      approved_by: this.approved_by,
      approved_at: this.approved_at,
      rejection_reason: this.rejection_reason,
      additional_info: this.additional_info,
      created_at: this.created_at,
      updated_at: this.updated_at,
      is_expired: this.isExpired(),
      is_pending: this.isPending()
    };
  };

  // Class methods
  PendingUser.findByEmail = function(email) {
    return this.findOne({ where: { email: email.toLowerCase() } });
  };

  PendingUser.findByToken = function(token) {
    return this.findOne({ where: { registration_token: token } });
  };

  PendingUser.findPendingUsers = function() {
    return this.findAll({
      where: {
        status: 'pending',
        expires_at: {
          [sequelize.Sequelize.Op.gt]: new Date()
        }
      },
      order: [['created_at', 'ASC']]
    });
  };

  PendingUser.cleanupExpired = async function() {
    const result = await this.update(
      { status: 'expired' },
      {
        where: {
          status: 'pending',
          expires_at: {
            [sequelize.Sequelize.Op.lt]: new Date()
          }
        }
      }
    );
    return result[0]; // Number of affected rows
  };

  return PendingUser;
}; 