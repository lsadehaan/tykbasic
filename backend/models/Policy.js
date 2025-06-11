module.exports = (sequelize, DataTypes) => {
  const Policy = sequelize.define('Policy', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by_user_id: {
      type: DataTypes.STRING, // Changed to STRING to match User UUID
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    owner_organization_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    target_organization_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    tyk_policy_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    rate_limit: {
      type: DataTypes.INTEGER,
      defaultValue: 1000,
      validate: {
        min: 1
      }
    },
    rate_per: {
      type: DataTypes.INTEGER,
      defaultValue: 60,
      validate: {
        min: 1
      }
    },
    quota_max: {
      type: DataTypes.INTEGER,
      defaultValue: -1
    },
    quota_renewal_rate: {
      type: DataTypes.INTEGER,
      defaultValue: 3600,
      validate: {
        min: 1
      }
    },
    policy_data: {
      type: DataTypes.JSON, // Changed from JSONB to JSON for SQLite compatibility
      allowNull: true
    },
    tags: {
      type: DataTypes.JSON, // Changed from ARRAY to JSON for SQLite compatibility
      defaultValue: "[]"
    }
  }, {
    tableName: 'policies',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  // Instance methods
  Policy.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    
    // Parse tags if it's a string
    if (typeof values.tags === 'string') {
      try {
        values.tags = JSON.parse(values.tags);
      } catch (e) {
        values.tags = [];
      }
    }
    
    // Add computed fields
    values.is_cross_org = values.target_organization_id !== null && 
                         values.target_organization_id !== values.owner_organization_id;
    
    return values;
  };

  // Class methods
  Policy.findAvailableForOrganization = async function(organizationId) {
    const { OrganizationAvailablePolicy } = require('./index');
    
    return await Policy.findAll({
      where: {
        is_active: true
      },
      include: [{
        model: OrganizationAvailablePolicy,
        where: {
          organization_id: organizationId,
          is_active: true
        },
        required: true
      }]
    });
  };

  Policy.findByOwnerOrganization = async function(organizationId) {
    return await Policy.findAll({
      where: {
        owner_organization_id: organizationId
      },
      order: [['created_at', 'DESC']]
    });
  };

  Policy.validateUniqueName = async function(name, ownerOrgId, excludePolicyId = null) {
    const { Op } = require('sequelize');
    const whereClause = {
      name: name,
      owner_organization_id: ownerOrgId
    };
    
    if (excludePolicyId) {
      whereClause.id = { [Op.ne]: excludePolicyId };
    }
    
    const existing = await Policy.findOne({ where: whereClause });
    return !existing;
  };

  return Policy;
}; 