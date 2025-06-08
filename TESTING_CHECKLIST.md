# TykBasic Testing Checklist

## Issues Addressed
✅ **Rate limiting on registration** - Increased from 5 to 20 requests per 15 minutes  
✅ **Statistics loading issue** - Fixed sequelize import  
✅ **Force password reset functionality** - Added proper login check

## Testing Plan

### 1. Admin Dashboard Statistics
**Test**: Admin Dashboard → Dashboard Tab
- **Expected**: Should show actual numbers instead of "Loading statistics..."
- **Data to verify**:
  - Total users count
  - Active/inactive users count
  - Pending approvals count
  - Organizations count
  - Recent login activity (24h)
  - Failed login attempts (24h)

### 2. User Registration (Rate Limiting)
**Test**: Create multiple new accounts quickly
- **Expected**: Should allow up to 20 registration attempts per 15 minutes
- **Steps**:
  1. Try registering 3-5 accounts with different emails
  2. Should succeed without 429 errors
  3. After 20 attempts, should get rate limit message

### 3. Force Password Reset Feature
**Test**: Admin forces password reset → User tries to login
- **Steps**:
  1. As admin: Go to Users tab → Edit a user → Check "Force password reset" → Save
  2. As that user: Try to login with correct credentials
  3. **Expected**: Should get message "Your password must be changed. Please use the password reset process."
  4. **Status code**: 202 (not 200)

### 4. User Management Features
**Test**: All admin user management functions
- **User listing**: ✅ Working
- **User filtering**: Search, role filter, status filter
- **User editing**: Name, role, status changes
- **Account lockout**: Reset failed attempts
- **User activation/deactivation**: ✅ Working

### 5. Pending User Approval Workflow
**Test**: Complete registration approval process
- **Steps**:
  1. Register new user (should go to pending)
  2. As admin: Check "Pending Approvals" tab
  3. Approve user with specific role
  4. Verify user appears in "Users" tab
  5. Verify new user can login

### 6. Email Whitelist Management
**Test**: Email pattern management
- **Add patterns**: Domain patterns, wildcard patterns
- **Pattern validation**: Test registration against patterns
- **Pattern editing**: Modify existing patterns

### 7. Authentication Security Features
**Test**: Account lockout and security
- **Account lockout**: 5 failed login attempts
- **Lockout duration**: 15 minutes
- **Lockout reset**: Admin can reset failed attempts
- **Rate limiting**: Auth endpoints protected

### 8. Audit Logging
**Test**: Verify audit trail
- **Admin actions**: User modifications, approvals, rejections
- **Login events**: Success, failure, lockouts
- **System events**: Password resets, account changes

### 9. Email Functionality
**Test**: Complete email system integration
- **Email Configuration**:
  1. Admin Dashboard → Settings tab
  2. Configure email service (Gmail recommended for testing)
  3. Test email sending functionality
- **Password Reset Emails**:
  1. Request password reset from login page
  2. Check email inbox for reset link
  3. Verify reset link works correctly
- **Welcome Emails**:
  1. Approve a pending user registration
  2. Check if welcome email is sent
  3. Verify email content and branding
- **Email Services Supported**:
  - Gmail (easiest for testing)
  - Brevo (300 emails/day free)
  - SendGrid (100 emails/day free)
  - Mailgun (100 emails/day free)
  - Custom SMTP

## Debugging Steps

### If Statistics Still Not Loading:
1. Check browser network tab for `/api/admin/statistics` request
2. Check backend console for sequelize errors
3. Verify database tables exist (users, organizations, audit_logs, pending_users)

### If Force Password Reset Not Working:
1. Check that `last_password_change` field was set to 1970-01-01
2. Verify login response status is 202 (not 200)
3. Check backend console for "Password reset required" log message

### If Registration Still Failing:
1. Check if it's a different error (not 429)
2. Verify backend is running and accessible
3. Check for database connection issues
4. Review email whitelist configuration

## Database Verification Commands

### Check User Password Reset Status:
```sql
SELECT id, email, last_password_change, 
       CASE 
         WHEN last_password_change < NOW() - INTERVAL '7 days' THEN 'Reset Required'
         ELSE 'OK'
       END as status
FROM users;
```

### Check Audit Logs:
```sql
SELECT action, resource_type, details, created_at 
FROM audit_logs 
ORDER BY created_at DESC 
LIMIT 10;
```

### Check Pending Users:
```sql
SELECT email, created_at 
FROM pending_users 
ORDER BY created_at DESC;
```

## Expected Behavior Summary

| Feature | Status | Expected Behavior |
|---------|--------|-------------------|
| Statistics | ✅ Fixed | Shows real numbers, not "Loading..." |
| Registration | ✅ Fixed | 20 attempts per 15min allowed |
| Force Password Reset | ✅ Fixed | Blocks login, shows reset message |
| User Management | ✅ Working | Full CRUD operations |
| Pending Approvals | ✅ Working | Complete approval workflow |
| Account Security | ✅ Working | Lockouts, rate limiting |
| Audit Trail | ✅ Working | All actions logged |
| Email System | ✅ Complete | Password reset & welcome emails |

## Next Steps After Testing

1. **API Management**: Certificate upload for mTLS authentication
2. **Dashboard Enhancements**: Real-time statistics, charts
3. **Advanced Security**: 2FA, session management
4. **Organization Management**: Multi-tenant features

## Email System Testing

### Quick Email Setup (Gmail)
1. **Enable 2FA** on Gmail account
2. **Generate App Password**: Google Account → Security → 2-Step Verification → App passwords
3. **Configure in TykBasic**:
   - Service: Gmail
   - Username: your-email@gmail.com
   - Password: [16-character app password]
   - From Email: your-email@gmail.com

### Email Debug Commands
```bash
# Check email service status
curl -H "Authorization: Bearer <admin-token>" \
     http://localhost:3001/api/admin/email-config

# Watch email logs
tail -f backend/logs/combined.log | grep -E "(✅|❌|📧)"

# Test email sending
POST /api/admin/email-config/test
{
  "testEmail": "your-test@email.com",
  "service": "gmail",
  "enabled": true,
  // ... other config
}
```

## Troubleshooting

- **Backend not starting**: Check database connection, missing environment variables
- **Frontend compilation errors**: Check React dependencies, syntax errors
- **Database errors**: Verify PostgreSQL is running, tables created
- **Authentication issues**: Check JWT secret, token validation

## Email System Testing

### Quick Email Setup (Gmail)
1. **Enable 2FA** on Gmail account
2. **Generate App Password**: Google Account → Security → 2-Step Verification → App passwords
3. **Configure in TykBasic**:
   - Service: Gmail
   - Username: your-email@gmail.com
   - Password: [16-character app password]
   - From Email: your-email@gmail.com

### Email Debug Commands
```bash
# Check email service status
curl -H "Authorization: Bearer <admin-token>" \
     http://localhost:3001/api/admin/email-config

# Watch email logs
tail -f backend/logs/combined.log | grep -E "(✅|❌|📧)"

# Test email sending
POST /api/admin/email-config/test
{
  "testEmail": "your-test@email.com",
  "service": "gmail",
  "enabled": true
}
```

### Email Templates Included
- **Password Reset**: Branded HTML email with secure reset link (1-hour expiry)
- **Welcome Email**: Sent when admin approves pending user registration
- **Test Email**: Configuration verification with service details 