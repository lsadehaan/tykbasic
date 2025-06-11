-- Policy-Based Access Control Migration
-- Date: 2024-12-01
-- Description: Create policies, policy_api_access, and organization_available_policies tables

-- Create policies table
CREATE TABLE policies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  owner_organization_id INTEGER REFERENCES organizations(id), -- Who owns/manages this policy
  target_organization_id INTEGER REFERENCES organizations(id), -- Which org can use this policy (NULL = same as owner)
  tyk_policy_id VARCHAR(255) UNIQUE NOT NULL, -- Tyk's policy ID
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Policy configuration
  rate_limit INTEGER DEFAULT 1000,
  rate_per INTEGER DEFAULT 60,
  quota_max INTEGER DEFAULT -1,
  quota_renewal_rate INTEGER DEFAULT 3600,
  
  -- Metadata
  policy_data JSONB, -- Full Tyk policy data
  tags TEXT[], -- For categorization
  
  UNIQUE(owner_organization_id, name) -- Policy names must be unique within organization
);

-- Create policy API access definitions table
CREATE TABLE policy_api_access (
  id SERIAL PRIMARY KEY,
  policy_id INTEGER REFERENCES policies(id) ON DELETE CASCADE,
  api_id VARCHAR(255) NOT NULL, -- Tyk API ID
  api_name VARCHAR(255),
  api_organization_id INTEGER REFERENCES organizations(id), -- Which org owns the API
  versions TEXT[] DEFAULT ARRAY['Default'],
  allowed_urls JSONB, -- Specific endpoint restrictions if needed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(policy_id, api_id)
);

-- Create organization available policies tracking table
CREATE TABLE organization_available_policies (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id),
  policy_id INTEGER REFERENCES policies(id),
  is_active BOOLEAN DEFAULT true,
  assigned_by_user_id INTEGER REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(organization_id, policy_id)
);

-- Update user_credentials table to support policies
-- Remove old access_rights tracking and add policy tracking
ALTER TABLE user_credentials DROP COLUMN IF EXISTS api_key_data;
ALTER TABLE user_credentials ADD COLUMN tyk_policy_id VARCHAR(255);
ALTER TABLE user_credentials ADD COLUMN policy_id INTEGER REFERENCES policies(id);

-- Add policy creation permission to organizations
ALTER TABLE organizations ADD COLUMN allow_admin_policy_creation BOOLEAN DEFAULT true;

-- Create indexes for better performance
CREATE INDEX idx_policies_owner_org ON policies(owner_organization_id);
CREATE INDEX idx_policies_target_org ON policies(target_organization_id);
CREATE INDEX idx_policies_tyk_id ON policies(tyk_policy_id);
CREATE INDEX idx_policy_api_access_policy ON policy_api_access(policy_id);
CREATE INDEX idx_policy_api_access_api ON policy_api_access(api_id);
CREATE INDEX idx_org_policies_org ON organization_available_policies(organization_id);
CREATE INDEX idx_org_policies_policy ON organization_available_policies(policy_id);
CREATE INDEX idx_user_credentials_policy ON user_credentials(policy_id);

-- Add comments for documentation
COMMENT ON TABLE policies IS 'Policy definitions for API access control';
COMMENT ON TABLE policy_api_access IS 'Mapping of policies to APIs they can access';
COMMENT ON TABLE organization_available_policies IS 'Tracks which policies are available to which organizations';

COMMENT ON COLUMN policies.owner_organization_id IS 'Organization that owns and manages this policy';
COMMENT ON COLUMN policies.target_organization_id IS 'Organization that can use this policy (NULL = same as owner)';
COMMENT ON COLUMN policies.tyk_policy_id IS 'Reference to the policy ID in Tyk Gateway';
COMMENT ON COLUMN policy_api_access.api_organization_id IS 'Organization that owns the API';
COMMENT ON COLUMN user_credentials.tyk_policy_id IS 'Tyk policy ID used when creating the key';
COMMENT ON COLUMN user_credentials.policy_id IS 'Reference to our internal policy record'; 