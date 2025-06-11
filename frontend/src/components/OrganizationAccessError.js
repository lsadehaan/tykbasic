import React from 'react';
import './OrganizationAccessError.css';

const OrganizationAccessError = ({ error }) => {
  const getMessageDetails = () => {
    switch (error?.code) {
      case 'NO_ORGANIZATION_ASSIGNED':
        return {
          title: '🏢 No Organization Assigned',
          message: error.message,
          icon: '👨‍💼',
          actionText: 'Contact Administrator',
          description: 'Your account needs to be assigned to an organization before you can access the API management system.'
        };
      
      case 'DEFAULT_ORGANIZATION_NOT_ALLOWED':
        return {
          title: '⚠️ Invalid Organization Assignment',
          message: error.message,
          icon: '🚫',
          actionText: 'Contact Administrator',
          description: 'For security reasons, regular users cannot access the default organization. You need to be assigned to a specific organization.'
        };
      
      case 'ORGANIZATION_INACTIVE':
        return {
          title: '😴 Organization Inactive',
          message: error.message,
          icon: '⏸️',
          actionText: 'Contact Administrator',
          description: `Your organization "${error.organizationName}" is currently inactive. Please contact an administrator to reactivate it.`
        };
      
      case 'ORGANIZATION_NOT_CONFIGURED':
        return {
          title: '⚙️ Organization Not Configured',
          message: error.message,
          icon: '🔧',
          actionText: 'Contact Administrator',
          description: 'Your organization is missing Tyk Gateway integration. This needs to be configured by an administrator.'
        };
      
      default:
        return {
          title: '🔒 Access Restricted',
          message: error?.message || 'Access to this resource is restricted.',
          icon: '🛡️',
          actionText: 'Contact Support',
          description: 'There is an issue with your organization access. Please contact support for assistance.'
        };
    }
  };

  const details = getMessageDetails();

  const handleContactAdmin = () => {
    // You could implement this to open a support ticket or email
    const subject = encodeURIComponent(`Organization Access Issue - ${details.title}`);
    const body = encodeURIComponent(`
Hi Administrator,

I'm experiencing an organization access issue with my TykBasic account:

Issue: ${details.title}
Message: ${details.message}
Description: ${details.description}

Please help me resolve this issue so I can access the API management system.

Thank you,
[Your Name]
    `);
    
    window.location.href = `mailto:admin@tykbasic.local?subject=${subject}&body=${body}`;
  };

  return (
    <div className="organization-access-error">
      <div className="error-container">
        <div className="error-icon">
          {details.icon}
        </div>
        
        <div className="error-content">
          <h2 className="error-title">{details.title}</h2>
          <p className="error-message">{details.message}</p>
          <p className="error-description">{details.description}</p>
          
          <div className="error-actions">
            <button 
              className="contact-admin-btn"
              onClick={handleContactAdmin}
            >
              {details.actionText}
            </button>
            
            <button 
              className="refresh-btn"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
          </div>
          
          <div className="error-help">
            <h4>What can I do?</h4>
            <ul>
              <li>Contact your system administrator</li>
              <li>Verify your organization assignment</li>
              <li>Check if your organization is active</li>
              <li>Ensure Tyk Gateway integration is configured</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrganizationAccessError; 