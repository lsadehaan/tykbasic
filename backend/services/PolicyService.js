const db = require('../models');
const { Policy, PolicyApiAccess, OrganizationAvailablePolicy, Organization, User, sequelize } = db;
const tykGatewayService = require('./TykGatewayService');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

/**
 * Service class for managing Tyk Gateway policies.
 * Handles policy creation, updates, and deletion in both Tyk Gateway and local database.
 * Manages policy-API relationships and organization policy assignments.
 */
class PolicyService {
  /**
   * Creates a new policy in both Tyk Gateway and local database.
   * Handles policy creation with proper organization context and API access rights.
   * 
   * @param {Object} policyData - Policy configuration data
   * @param {string} policyData.name - Name of the policy
   * @param {string} [policyData.description] - Policy description
   * @param {number} [policyData.rate_limit] - Rate limit per period
   * @param {number} [policyData.rate_per] - Rate limit period in seconds
   * @param {number} [policyData.quota_max] - Maximum quota (-1 for unlimited)
   * @param {number} [policyData.quota_renewal_rate] - Quota renewal period in seconds
   * @param {Array} [policyData.api_accesses] - List of API access configurations
   * @param {string} [policyData.target_organization_id] - Target organization ID
   * @param {Array} [policyData.tags] - Policy tags
   * @param {string} creatorUserId - ID of the user creating the policy
   * @returns {Promise<Object>} Created policy data
   * @throws {Error} If policy creation fails
   */
  async createPolicy(policyData, creatorUserId) {
    const transaction = await sequelize.transaction();
    
    try {
      // Get creator user to determine organization context
      const creator = await User.findByPk(creatorUserId, {
        include: [{ model: Organization, as: 'organization' }]
      });
      
      if (!creator) {
        throw new Error('Creator user not found');
      }

      // Determine which organization context to use for Tyk Gateway
      // If target_organization_id is specified, use that org's tyk_org_id
      let targetOrgId = creator.organization.tyk_org_id || 'default';
      if (policyData.target_organization_id) {
        const targetOrg = await Organization.findByPk(policyData.target_organization_id);
        if (targetOrg) {
          targetOrgId = targetOrg.tyk_org_id || 'default';
        }
      }

      // Generate unique policy ID for Tyk Gateway
      const generatedPolicyId = uuidv4().replace(/-/g, ''); // Remove dashes to match Tyk's format

      // Prepare Tyk policy data (using structure from working test)
      const tykPolicyData = {
        id: generatedPolicyId, // Tyk Gateway requires this field
        name: policyData.name,
        active: true,
        org_id: targetOrgId,
        rate: policyData.rate_limit || 1000,
        per: policyData.rate_per || 60,
        quota_max: policyData.quota_max || -1,
        quota_renewal_rate: policyData.quota_renewal_rate || 3600,
        tags: policyData.tags || []
      };

      // Add access rights (required field, even if empty)
      tykPolicyData.access_rights = {};
      if (policyData.api_accesses && policyData.api_accesses.length > 0) {
        // Only add APIs that we can validate exist
        for (const access of policyData.api_accesses) {
          // For now, trust that the frontend is sending valid APIs
          // In production, you'd want to validate each API exists
          tykPolicyData.access_rights[access.api_id] = {
            api_id: access.api_id,
            api_name: access.api_name || access.api_id,
            versions: access.versions || ['Default'],
            allowed_urls: access.allowed_urls || []
          };
        }
      } else {
        // Create a placeholder access right to ensure policy creation succeeds
        // This allows creating policies that can be updated later with actual APIs
        console.log('Warning: Creating policy without API access - this is for admin setup only');
      }

      // Create policy in Tyk Gateway
      console.log('Sending policy data to Tyk Gateway:', JSON.stringify(tykPolicyData, null, 2));
      const tykPolicyResponse = await tykGatewayService.createPolicy(tykPolicyData);
      
      console.log('Tyk policy creation response:', JSON.stringify(tykPolicyResponse, null, 2));
      
      if (!tykPolicyResponse || (!tykPolicyResponse.id && !tykPolicyResponse.key) || 
          (tykPolicyResponse.key && tykPolicyResponse.key.trim() === '')) {
        console.error('Invalid Tyk policy response structure:', tykPolicyResponse);
        throw new Error('Failed to create policy in Tyk Gateway - empty policy ID returned');
      }

      // Tyk Gateway returns policy ID in 'key' field for policy creation
      const tykPolicyId = tykPolicyResponse.key || tykPolicyResponse.id;

      // Create policy record in our database
      const dbPolicy = await Policy.create({
        name: policyData.name,
        description: policyData.description || '',
        created_by_user_id: creatorUserId,
        owner_organization_id: creator.organization_id,
        target_organization_id: policyData.target_organization_id || null,
        tyk_policy_id: tykPolicyId,
        is_active: true,
        rate_limit: policyData.rate_limit || 1000,
        rate_per: policyData.rate_per || 60,
        quota_max: policyData.quota_max || -1,
        quota_renewal_rate: policyData.quota_renewal_rate || 3600,
        policy_data: tykPolicyResponse,
        tags: policyData.tags || []
      }, { transaction });

      // Create API access records if specified
      if (policyData.api_accesses && policyData.api_accesses.length > 0) {
        await PolicyApiAccess.createBulkForPolicy(
          dbPolicy.id, 
          policyData.api_accesses, 
          transaction
        );
      }

      // Make policy available to its owner organization
      await OrganizationAvailablePolicy.assignPolicyToOrganization(
        dbPolicy.id,
        creator.organization_id,
        creatorUserId,
        transaction
      );

      // If target organization is specified and different, make it available there too
      if (policyData.target_organization_id && 
          policyData.target_organization_id !== creator.organization_id) {
        await OrganizationAvailablePolicy.assignPolicyToOrganization(
          dbPolicy.id,
          policyData.target_organization_id,
          creatorUserId,
          transaction
        );
      }

      // If additional organizations are specified, assign the policy to them
      if (policyData.available_to_organizations && 
          Array.isArray(policyData.available_to_organizations) && 
          policyData.available_to_organizations.length > 0) {
        
        for (const orgId of policyData.available_to_organizations) {
          // Skip if it's the same as owner or target organization (already assigned above)
          if (orgId !== creator.organization_id && orgId !== policyData.target_organization_id) {
            await OrganizationAvailablePolicy.assignPolicyToOrganization(
              dbPolicy.id,
              orgId,
              creatorUserId,
              transaction
            );
          }
        }
      }

      await transaction.commit();
      
      // Reload with associations
      return await this.getPolicyWithDetails(dbPolicy.id);
      
    } catch (error) {
      await transaction.rollback();
      console.error('PolicyService.createPolicy error:', error);
      throw error;
    }
  }

  /**
   * Get policies available to an organization (for end users selecting policies)
   */
  async getAvailablePolicies(organizationId) {
    try {
      const policies = await Policy.findAll({
        where: {
          is_active: true
        },
        include: [
          {
            model: OrganizationAvailablePolicy,
            as: 'OrganizationAvailablePolicies',
            where: {
              organization_id: organizationId,
              is_active: true
            },
            required: true
          },
          {
            model: PolicyApiAccess,
            as: 'PolicyApiAccesses',
            required: false
          }
        ],
        order: [['name', 'ASC']]
      });

      // Add API count to each policy
      return policies.map(policy => {
        const policyJson = policy.toJSON();
        policyJson.api_count = policy.PolicyApiAccesses ? policy.PolicyApiAccesses.length : 0;
        return policyJson;
      });
      
    } catch (error) {
      console.error('PolicyService.getAvailablePolicies error:', error);
      throw error;
    }
  }

  /**
   * Get policies created by an organization (for admins managing policies)
   */
  async getCreatedPolicies(organizationId) {
    try {
      const policies = await Policy.findAll({
        where: {
          owner_organization_id: organizationId
        },
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'email', 'first_name', 'last_name']
          },
          {
            model: Organization,
            as: 'ownerOrganization',
            attributes: ['id', 'name']
          },
          {
            model: Organization,
            as: 'targetOrganization',
            attributes: ['id', 'name'],
            required: false
          },
          {
            model: PolicyApiAccess,
            as: 'PolicyApiAccesses',
            required: false
          }
        ],
        order: [['created_at', 'DESC']]
      });

      return policies.map(policy => {
        const policyJson = policy.toJSON();
        policyJson.api_count = policy.PolicyApiAccesses ? policy.PolicyApiAccesses.length : 0;
        return policyJson;
      });
      
    } catch (error) {
      console.error('PolicyService.getCreatedPolicies error:', error);
      throw error;
    }
  }

  /**
   * Get a single policy with all details
   */
  async getPolicyWithDetails(policyId) {
    try {
      const policy = await Policy.findByPk(policyId, {
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'email', 'first_name', 'last_name']
          },
          {
            model: Organization,
            as: 'ownerOrganization',
            attributes: ['id', 'name']
          },
          {
            model: Organization,
            as: 'targetOrganization',
            attributes: ['id', 'name'],
            required: false
          },
          {
            model: PolicyApiAccess,
            as: 'PolicyApiAccesses',
            required: false,
            include: [{
              model: Organization,
              as: 'apiOrganization',
              attributes: ['id', 'name'],
              required: false
            }]
          }
        ]
      });

      if (!policy) {
        throw new Error('Policy not found');
      }

      return policy;
      
    } catch (error) {
      console.error('PolicyService.getPolicyWithDetails error:', error);
      throw error;
    }
  }

  /**
   * Validate that a policy is available to an organization
   */
  async validatePolicyAccess(policyId, organizationId) {
    try {
      const isAvailable = await OrganizationAvailablePolicy.isPolicyAvailableToOrganization(
        policyId, 
        organizationId
      );
      
      if (!isAvailable) {
        return null;
      }

      return await Policy.findByPk(policyId);
      
    } catch (error) {
      console.error('PolicyService.validatePolicyAccess error:', error);
      throw error;
    }
  }

  /**
   * Assign a policy to an organization (super admin only)
   */
  async assignPolicyToOrganization(policyId, targetOrgId, assignedByUserId) {
    try {
      // Check if policy exists
      const policy = await Policy.findByPk(policyId);
      if (!policy) {
        throw new Error('Policy not found');
      }

      // Check if target organization exists
      const targetOrg = await Organization.findByPk(targetOrgId);
      if (!targetOrg) {
        throw new Error('Target organization not found');
      }

      // Assign policy to organization
      const assignment = await OrganizationAvailablePolicy.assignPolicyToOrganization(
        policyId,
        targetOrgId,
        assignedByUserId
      );

      return assignment;
      
    } catch (error) {
      console.error('PolicyService.assignPolicyToOrganization error:', error);
      throw error;
    }
  }

  /**
   * Remove policy assignment from organization
   */
  async removePolicyFromOrganization(policyId, organizationId) {
    try {
      return await OrganizationAvailablePolicy.removePolicyFromOrganization(
        policyId,
        organizationId
      );
      
    } catch (error) {
      console.error('PolicyService.removePolicyFromOrganization error:', error);
      throw error;
    }
  }

  /**
   * Updates an existing policy in both Tyk Gateway and local database.
   * 
   * @param {string} policyId - ID of the policy to update
   * @param {Object} updates - Policy update data
   * @param {string} [updates.name] - New policy name
   * @param {string} [updates.description] - New policy description
   * @param {number} [updates.rate_limit] - New rate limit
   * @param {number} [updates.rate_per] - New rate period
   * @param {number} [updates.quota_max] - New quota maximum
   * @param {number} [updates.quota_renewal_rate] - New quota renewal rate
   * @param {Array} [updates.tags] - New policy tags
   * @param {boolean} [updates.is_active] - New active status
   * @param {string} updaterUserId - ID of the user updating the policy
   * @returns {Promise<Object>} Updated policy data
   * @throws {Error} If policy update fails
   */
  async updatePolicy(policyId, updates, updaterUserId) {
    const transaction = await sequelize.transaction();
    
    try {
      const policy = await Policy.findByPk(policyId);
      if (!policy) {
        throw new Error('Policy not found');
      }

      // Update in Tyk Gateway
      const tykUpdates = {
        name: updates.name || policy.name,
        rate: updates.rate_limit || policy.rate_limit,
        per: updates.rate_per || policy.rate_per,
        quota_max: updates.quota_max !== undefined ? updates.quota_max : policy.quota_max,
        quota_renewal_rate: updates.quota_renewal_rate || policy.quota_renewal_rate,
        tags: updates.tags || policy.tags,
        meta_data: {
          ...policy.policy_data?.meta_data,
          description: updates.description || policy.description,
          updated_by: (await User.findByPk(updaterUserId))?.email,
          updated_at: new Date().toISOString()
        }
      };

      await tykGatewayService.updatePolicy(policy.tyk_policy_id, tykUpdates);

      // Update in our database
      await policy.update({
        name: updates.name || policy.name,
        description: updates.description || policy.description,
        rate_limit: updates.rate_limit || policy.rate_limit,
        rate_per: updates.rate_per || policy.rate_per,
        quota_max: updates.quota_max !== undefined ? updates.quota_max : policy.quota_max,
        quota_renewal_rate: updates.quota_renewal_rate || policy.quota_renewal_rate,
        tags: updates.tags || policy.tags,
        is_active: updates.is_active !== undefined ? updates.is_active : policy.is_active
      }, { transaction });

      await transaction.commit();
      
      return await this.getPolicyWithDetails(policyId);
      
    } catch (error) {
      await transaction.rollback();
      console.error('PolicyService.updatePolicy error:', error);
      throw error;
    }
  }

  /**
   * Deletes a policy from both Tyk Gateway and local database.
   * 
   * @param {string} policyId - ID of the policy to delete
   * @param {string} deleterUserId - ID of the user deleting the policy
   * @returns {Promise<Object>} Deletion result
   * @throws {Error} If policy deletion fails
   */
  async deletePolicy(policyId, deleterUserId) {
    const transaction = await sequelize.transaction();
    
    try {
      const policy = await Policy.findByPk(policyId);
      if (!policy) {
        throw new Error('Policy not found');
      }

      // Delete from Tyk Gateway
      await tykGatewayService.deletePolicy(policy.tyk_policy_id);

      // Delete from our database (cascade will handle related records)
      await policy.destroy({ transaction });

      await transaction.commit();
      
      return { success: true, message: 'Policy deleted successfully' };
      
    } catch (error) {
      await transaction.rollback();
      console.error('PolicyService.deletePolicy error:', error);
      throw error;
    }
  }
}

module.exports = new PolicyService(); 