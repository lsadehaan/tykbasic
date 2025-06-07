const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const EmailWhitelist = sequelize.define('EmailWhitelist', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    pattern: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 255]
      }
    },
    description: {
      type: DataTypes.STRING,
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
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'email_whitelist',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (emailWhitelist) => {
        if (!emailWhitelist.id) {
          emailWhitelist.id = uuidv4();
        }
        // Normalize the pattern
        emailWhitelist.pattern = emailWhitelist.pattern.toLowerCase().trim();
      },
      beforeUpdate: async (emailWhitelist) => {
        if (emailWhitelist.changed('pattern')) {
          emailWhitelist.pattern = emailWhitelist.pattern.toLowerCase().trim();
        }
      }
    }
  });

  // Instance methods
  EmailWhitelist.prototype.matchesEmail = function(email) {
    const pattern = this.pattern;
    const normalizedEmail = email.toLowerCase().trim();
    
    // Exact match
    if (pattern === normalizedEmail) {
      return true;
    }
    
    // Wildcard match
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(normalizedEmail);
    }
    
    // Domain match (starts with @)
    if (pattern.startsWith('@')) {
      return normalizedEmail.endsWith(pattern);
    }
    
    return false;
  };

  // Class methods
  EmailWhitelist.isEmailAllowed = async function(email) {
    const activePatterns = await this.findAll({
      where: { is_active: true }
    });
    
    return activePatterns.some(pattern => pattern.matchesEmail(email));
  };

  EmailWhitelist.getActivePatterns = function() {
    return this.findAll({
      where: { is_active: true },
      order: [['created_at', 'ASC']]
    });
  };

  return EmailWhitelist;
}; 