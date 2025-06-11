module.exports = (sequelize, DataTypes) => {
  const OrganizationAvailablePolicy = sequelize.define('OrganizationAvailablePolicy', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    policy_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'policies',
        key: 'id'
      }
    },
    assigned_by_user_id: {
      type: DataTypes.STRING, // Changed to STRING to match User UUID
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    assigned_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'organization_available_policies',
    underscored: true,
    timestamps: false // Database doesn't have created_at/updated_at columns
  });

  // Class methods
  OrganizationAvailablePolicy.assignPolicyToOrganization = async function(policyId, organizationId, assignedByUserId, transaction = null) {
    return await OrganizationAvailablePolicy.upsert({
      organization_id: organizationId,
      policy_id: policyId,
      assigned_by_user_id: assignedByUserId,
      is_active: true,
      assigned_at: new Date()
    }, {
      transaction,
      fields: ['assigned_by_user_id', 'is_active', 'assigned_at']
    });
  };

  OrganizationAvailablePolicy.removePolicyFromOrganization = async function(policyId, organizationId, transaction = null) {
    return await OrganizationAvailablePolicy.destroy({
      where: {
        organization_id: organizationId,
        policy_id: policyId
      },
      transaction
    });
  };

  OrganizationAvailablePolicy.deactivatePolicyForOrganization = async function(policyId, organizationId, transaction = null) {
    return await OrganizationAvailablePolicy.update(
      { is_active: false },
      {
        where: {
          organization_id: organizationId,
          policy_id: policyId
        },
        transaction
      }
    );
  };

  OrganizationAvailablePolicy.findByOrganization = async function(organizationId, activeOnly = true) {
    const whereClause = { organization_id: organizationId };
    if (activeOnly) {
      whereClause.is_active = true;
    }
    
    return await OrganizationAvailablePolicy.findAll({
      where: whereClause,
      include: [{
        model: require('./Policy'),
        as: 'policy'
      }],
      order: [['assigned_at', 'DESC']]
    });
  };

  OrganizationAvailablePolicy.findByPolicy = async function(policyId, activeOnly = true) {
    const whereClause = { policy_id: policyId };
    if (activeOnly) {
      whereClause.is_active = true;
    }
    
    return await OrganizationAvailablePolicy.findAll({
      where: whereClause,
      include: [{
        model: require('./Organization'),
        as: 'organization'
      }],
      order: [['assigned_at', 'DESC']]
    });
  };

  OrganizationAvailablePolicy.isPolicyAvailableToOrganization = async function(policyId, organizationId) {
    const assignment = await OrganizationAvailablePolicy.findOne({
      where: {
        organization_id: organizationId,
        policy_id: policyId,
        is_active: true
      }
    });
    
    return !!assignment;
  };

  return OrganizationAvailablePolicy;
}; 