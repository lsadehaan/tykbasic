module.exports = (sequelize, DataTypes) => {
  const PolicyApiAccess = sequelize.define('PolicyApiAccess', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    policy_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'policies',
        key: 'id'
      }
    },
    api_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    api_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    api_organization_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    versions: {
      type: DataTypes.JSON, // Changed from allowed_versions to match database schema
      defaultValue: "[]"
    },
    allowed_urls: {
      type: DataTypes.JSON, // Changed from ARRAY to JSON for SQLite compatibility
      defaultValue: "[]"
    }
  }, {
    tableName: 'policy_api_access',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false // Database doesn't have updated_at column
  });

  // Instance methods
  PolicyApiAccess.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    
    // Parse JSON fields if they're strings
    ['versions', 'allowed_urls'].forEach(field => {
      if (typeof values[field] === 'string') {
        try {
          values[field] = JSON.parse(values[field]);
        } catch (e) {
          values[field] = [];
        }
      }
    });
    
    return values;
  };

  // Class methods
  PolicyApiAccess.findByPolicyId = async function(policyId) {
    return await PolicyApiAccess.findAll({
      where: { policy_id: policyId },
      order: [['api_name', 'ASC']]
    });
  };

  PolicyApiAccess.createBulkForPolicy = async function(policyId, apiAccesses, transaction = null) {
    const accesses = apiAccesses.map(access => ({
      policy_id: policyId,
      api_id: access.api_id,
      api_name: access.api_name,
      api_organization_id: access.api_organization_id,
      versions: access.versions || access.allowed_versions || ["Default"], // Handle both field names
      allowed_urls: access.allowed_urls || "[]"
    }));
    
    return await PolicyApiAccess.bulkCreate(accesses, {
      transaction,
      validate: true,
      ignoreDuplicates: false
    });
  };

  PolicyApiAccess.removeAllForPolicy = async function(policyId, transaction = null) {
    return await PolicyApiAccess.destroy({
      where: { policy_id: policyId },
      transaction
    });
  };

  PolicyApiAccess.buildTykAccessRights = async function(policyId) {
    const accesses = await PolicyApiAccess.findByPolicyId(policyId);
    const accessRights = {};
    
    accesses.forEach(access => {
      accessRights[access.api_id] = {
        api_id: access.api_id,
        api_name: access.api_name || access.api_id,
        versions: access.versions || ["Default"],
        allowed_urls: access.allowed_urls || []
      };
    });
    
    return accessRights;
  };

  return PolicyApiAccess;
}; 