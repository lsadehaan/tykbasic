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
// Policy models
const Policy = require('./Policy')(sequelize, DataTypes);
const PolicyApiAccess = require('./PolicyApiAccess')(sequelize, DataTypes);
const OrganizationAvailablePolicy = require('./OrganizationAvailablePolicy')(sequelize, DataTypes);

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

  // Policy associations
  Policy.belongsTo(User, { 
    foreignKey: 'created_by_user_id', 
    as: 'creator' 
  });
  Policy.belongsTo(Organization, { 
    foreignKey: 'owner_organization_id', 
    as: 'ownerOrganization' 
  });
  Policy.belongsTo(Organization, { 
    foreignKey: 'target_organization_id', 
    as: 'targetOrganization' 
  });

  // PolicyApiAccess associations
  PolicyApiAccess.belongsTo(Policy, { 
    foreignKey: 'policy_id', 
    as: 'policy' 
  });
  PolicyApiAccess.belongsTo(Organization, { 
    foreignKey: 'api_organization_id', 
    as: 'apiOrganization' 
  });
  Policy.hasMany(PolicyApiAccess, { 
    foreignKey: 'policy_id', 
    as: 'PolicyApiAccesses' 
  });

  // OrganizationAvailablePolicy associations
  OrganizationAvailablePolicy.belongsTo(Organization, { 
    foreignKey: 'organization_id', 
    as: 'organization' 
  });
  OrganizationAvailablePolicy.belongsTo(Policy, { 
    foreignKey: 'policy_id', 
    as: 'policy' 
  });
  OrganizationAvailablePolicy.belongsTo(User, { 
    foreignKey: 'assigned_by_user_id', 
    as: 'assignedBy' 
  });

  Policy.hasMany(OrganizationAvailablePolicy, { 
    foreignKey: 'policy_id', 
    as: 'OrganizationAvailablePolicies' 
  });
  Organization.hasMany(OrganizationAvailablePolicy, { 
    foreignKey: 'organization_id', 
    as: 'availablePolicies' 
  });

  // UserCredentials and Policy associations
  UserCredentials.belongsTo(Policy, { 
    foreignKey: 'policy_id', 
    as: 'policy' 
  });
  Policy.hasMany(UserCredentials, { 
    foreignKey: 'policy_id', 
    as: 'credentials' 
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
  AuditLog,
  Policy,
  PolicyApiAccess,
  OrganizationAvailablePolicy
};

module.exports = db; 
