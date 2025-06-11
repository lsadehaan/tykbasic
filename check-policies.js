const { Sequelize } = require('sequelize');
const config = require('./config/database.js')[process.env.NODE_ENV || 'development'];

const sequelize = new Sequelize(config);

async function checkPolicies() {
  try {
    console.log('Checking policies in database...\n');
    
    // Check all policies
    const policies = await sequelize.query(`
      SELECT 
        p.id, 
        p.name, 
        p.owner_organization_id, 
        p.target_organization_id, 
        p.is_active,
        p.tyk_policy_id
      FROM policies p 
      ORDER BY p.created_at DESC
    `, { type: Sequelize.QueryTypes.SELECT });
    
    console.log('All policies:');
    console.table(policies);
    
    // Check organization assignments
    const assignments = await sequelize.query(`
      SELECT 
        oap.organization_id,
        oap.policy_id,
        oap.is_active,
        p.name as policy_name
      FROM organization_available_policies oap 
      JOIN policies p ON oap.policy_id = p.id
      ORDER BY oap.assigned_at DESC
    `, { type: Sequelize.QueryTypes.SELECT });
    
    console.log('\nOrganization policy assignments:');
    console.table(assignments);
    
    // Check specific organization
    const userOrgId = 'a0e48fd7-a4fb-4c6e-acb5-dea0c89afbb3'; // IDNTEQ org from logs
    const availablePolicies = await sequelize.query(`
      SELECT 
        p.id, 
        p.name,
        p.tyk_policy_id
      FROM policies p 
      INNER JOIN organization_available_policies oap ON p.id = oap.policy_id 
      WHERE oap.organization_id = ? 
        AND oap.is_active = 1 
        AND p.is_active = 1
    `, { 
      replacements: [userOrgId],
      type: Sequelize.QueryTypes.SELECT 
    });
    
    console.log(`\nPolicies available to organization ${userOrgId}:`);
    console.table(availablePolicies);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

checkPolicies(); 