const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Import all models
const User = require('./User')(sequelize, DataTypes);
const Organization = require('./Organization')(sequelize, DataTypes);
const EmailWhitelist = require('./EmailWhitelist')(sequelize, DataTypes);
const PendingUser = require('./PendingUser')(sequelize, DataTypes);
const SystemConfig = require('./SystemConfig')(sequelize, DataTypes);
const UserCredentials = require('./UserCredentials')(sequelize, DataTypes);
const ApiDefinition = require('./ApiDefinition')(sequelize, DataTypes);
const ApiAccessGrant = require('./ApiAccessGrant')(sequelize, DataTypes);
const AuditLog = require('./AuditLog')(sequelize, DataTypes);

// Define associations
const setupAssociations = () => {
  // User and Organization associations
  User.belongsTo(Organization, { 
    foreignKey: 'organization_id', 
    as: 'organization' 
  });
  Organization.hasMany(User, { 
    foreignKey: 'organization_id', 
    as: 'users' 
  });

  // User and UserCredentials associations
  User.hasMany(UserCredentials, { 
    foreignKey: 'user_id', 
    as: 'credentials' 
  });
  UserCredentials.belongsTo(User, { 
    foreignKey: 'user_id', 
    as: 'user' 
  });

  // Organization and UserCredentials associations
  Organization.hasMany(UserCredentials, { 
    foreignKey: 'organization_id', 
    as: 'credentials' 
  });
  UserCredentials.belongsTo(Organization, { 
    foreignKey: 'organization_id', 
    as: 'organization' 
  });

  // ApiDefinition and Organization associations
  ApiDefinition.belongsTo(Organization, { 
    foreignKey: 'organization_id', 
    as: 'organization' 
  });
  Organization.hasMany(ApiDefinition, { 
    foreignKey: 'organization_id', 
    as: 'apis' 
  });

  // ApiAccessGrant associations
  ApiAccessGrant.belongsTo(User, { 
    foreignKey: 'user_id', 
    as: 'user' 
  });
  ApiAccessGrant.belongsTo(ApiDefinition, { 
    foreignKey: 'api_id', 
    as: 'api' 
  });
  ApiAccessGrant.belongsTo(Organization, { 
    foreignKey: 'organization_id', 
    as: 'organization' 
  });

  User.hasMany(ApiAccessGrant, { 
    foreignKey: 'user_id', 
    as: 'apiAccess' 
  });
  ApiDefinition.hasMany(ApiAccessGrant, { 
    foreignKey: 'api_id', 
    as: 'accessGrants' 
  });

  // PendingUser associations
  PendingUser.belongsTo(Organization, { 
    foreignKey: 'organization_id', 
    as: 'organization' 
  });

  // AuditLog associations
  AuditLog.belongsTo(User, { 
    foreignKey: 'user_id', 
    as: 'user',
    constraints: false
  });
  AuditLog.belongsTo(Organization, { 
    foreignKey: 'organization_id', 
    as: 'organization',
    constraints: false
  });
};

// Setup associations
setupAssociations();

// Export all models and sequelize instance
const db = {
  sequelize,
  Sequelize,
  User,
  Organization,
  EmailWhitelist,
  PendingUser,
  SystemConfig,
  UserCredentials,
  ApiDefinition,
  ApiAccessGrant,
  AuditLog
};

module.exports = db; 