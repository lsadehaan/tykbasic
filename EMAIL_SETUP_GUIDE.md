# Email Setup Guide for TykBasic

## Overview

TykBasic includes a comprehensive email system that supports multiple email providers and automatically sends:
- **Password reset emails** with secure links
- **Welcome emails** when users are approved by admins
- **Test emails** to verify configuration

## Supported Email Services

### 1. Gmail (Recommended for Quick Setup)
- **Free tier**: No limits for personal use
- **Easy setup**: Use your Gmail account with app passwords
- **Best for**: Development and small deployments

### 2. Brevo (formerly Sendinblue) - Recommended for Production
- **Free tier**: 300 emails/day
- **Professional features**: Templates, analytics, automation
- **Best for**: Production environments

### 3. SendGrid
- **Free tier**: 100 emails/day
- **Enterprise features**: Advanced analytics, dedicated IPs
- **Best for**: Large-scale applications

### 4. Mailgun
- **Free tier**: 100 emails/day (first 3 months)
- **Developer-friendly**: Powerful API and webhook support
- **Best for**: Developer-centric applications

### 5. Custom SMTP
- **Flexibility**: Use any SMTP server
- **Best for**: Organizations with existing email infrastructure

## Quick Setup Instructions

### Gmail Setup (Easiest)

1. **Enable 2-Factor Authentication** on your Gmail account
   - Go to [myaccount.google.com](https://myaccount.google.com)
   - Security → 2-Step Verification → Turn On

2. **Generate App Password**
   - Go to Security → 2-Step Verification → App passwords
   - Select "Mail" and your device
   - Copy the 16-character password

3. **Configure in TykBasic**
   - Service: Gmail
   - Username: your-email@gmail.com
   - Password: [16-character app password]
   - From Email: your-email@gmail.com
   - From Name: TykBasic

### Brevo Setup (Recommended for Production)

**Brevo supports both HTTP API and SMTP methods. TykBasic automatically detects which to use:**

1. **Create Account**
   - Sign up at [brevo.com](https://www.brevo.com)
   - Verify your email address

2. **Option A: HTTP API (Recommended)**
   - Go to `SMTP & API` → `API Keys`
   - Generate a new API key (starts with `xkeysib-`)
   - Configure in TykBasic:
     - Service: Brevo
     - API Key: `xkeysib-xxxxx...` (your API key)
     - From Email: [verified sender email]
     - From Name: TykBasic

3. **Option B: SMTP Method**
   - Go to `SMTP & API` → `SMTP`
   - Note your login and SMTP key
   - Configure in TykBasic:
     - Service: Custom SMTP
     - Host: smtp-relay.brevo.com
     - Port: 587
     - Username: [your Brevo email]
     - Password: [SMTP key from Brevo]

### SendGrid Setup

1. **Create Account**
   - Sign up at [sendgrid.com](https://sendgrid.com)
   - Complete verification process

2. **Create API Key**
   - Go to Settings → API Keys
   - Create API Key with "Mail Send" permissions

3. **Configure in TykBasic**
   - Service: SendGrid
   - Username: apikey
   - Password: [your API key]
   - From Email: [verified sender email]
   - From Name: TykBasic

## Configuration Steps

### 1. Access Admin Dashboard
- Log in as an admin user
- Navigate to **Settings** tab in the Admin Dashboard

### 2. Configure Email Service
- Select your preferred email service
- Fill in the required credentials
- Set your "From" email and name
- Enable email sending

### 3. Test Configuration
- Enter a test email address
- Click "Send Test Email"
- Check the inbox for the test email

### 4. Verify Email Templates
The system sends three types of emails:

#### Password Reset Email
```
Subject: Reset Your TykBasic Password
Content: Branded HTML email with reset link
Expiry: 1 hour
```

#### Welcome Email
```
Subject: Welcome to TykBasic!
Content: Branded HTML email with login instructions
Trigger: When admin approves pending user
```

#### Test Email
```
Subject: TykBasic Email Test
Content: Configuration verification message
Purpose: Validate email setup
```

## Environment Variables

Optional environment variables for advanced configuration:

```bash
# Frontend URL for email links (auto-detected if not set)
FRONTEND_URL=https://your-domain.com

# Email service debugging
EMAIL_DEBUG=true
```

## Troubleshooting

### Common Issues

#### 1. Gmail "Less Secure Apps" Error
- **Solution**: Use App Passwords (see setup above)
- **Don't**: Enable "Less secure app access" (deprecated)

#### 2. "Authentication Failed" Error
- **Check**: Username/password are correct
- **Gmail**: Ensure app password is used, not regular password
- **Other services**: Verify API keys and credentials

#### 3. Emails Going to Spam
- **Solution**: Configure SPF/DKIM records for your domain
- **Quick fix**: Ask recipients to whitelist your from address

#### 4. "Service Not Configured" Error
- **Check**: Email service is enabled in settings
- **Verify**: All required fields are filled
- **Test**: Send a test email to verify configuration

### Error Codes

| Error | Meaning | Solution |
|-------|---------|----------|
| `EAUTH` | Authentication failed | Check credentials |
| `ECONNECTION` | Connection failed | Check server/port settings |
| `EMESSAGE` | Invalid message format | Contact support |
| `EENVELOPE` | Invalid from/to addresses | Check email addresses |

### Debug Mode

Enable debug logging for email issues:

1. Set `EMAIL_DEBUG=true` in your environment
2. Check server logs for detailed email debug information
3. Test email sending and review logs

## Security Considerations

### Best Practices
- **Never commit** email passwords to version control
- **Use environment variables** for sensitive credentials
- **Enable 2FA** on all email service accounts
- **Regularly rotate** API keys and passwords
- **Monitor** email sending logs for suspicious activity

### Rate Limiting
The system includes built-in rate limiting:
- **Password resets**: 5 attempts per 15 minutes per IP
- **Email tests**: Included in general API rate limits
- **User registration**: 20 attempts per 15 minutes per IP

## Production Deployment

### Recommended Setup
1. **Use Brevo or SendGrid** for reliability
2. **Configure custom domain** for from addresses
3. **Set up monitoring** for email delivery failures
4. **Enable audit logging** for email-related actions
5. **Regular backup** of email configurations

### Email Templates Customization
Email templates are defined in `backend/services/emailService.js`:
- **HTML templates**: Modern, responsive design
- **Text fallbacks**: Plain text versions included
- **Branding**: Customize colors and styling
- **Content**: Modify messages and formatting

### Monitoring
The system logs all email activities:
- **Successful sends**: Logged with message IDs
- **Failed sends**: Logged with error details
- **Configuration changes**: Audit trail maintained
- **Test emails**: Tracked separately

## API Integration

### Email Service Status
```javascript
// Check email service status
GET /api/admin/email-config
```

### Send Test Email
```javascript
// Send test email
POST /api/admin/email-config/test
{
  "testEmail": "recipient@example.com",
  "service": "gmail",
  "enabled": true,
  // ... other config fields
}
```

## Support

### Common Questions

**Q: Can I use Office 365 or Outlook?**
A: Yes, use the Custom SMTP option with these settings:
- Host: smtp-mail.outlook.com
- Port: 587
- Secure: false (STARTTLS)

**Q: How do I change email templates?**
A: Templates are in `backend/services/emailService.js`. Modify the HTML/text content as needed.

**Q: Can I disable email sending?**
A: Yes, uncheck "Enable Email Sending" in the admin settings.

**Q: What happens if email sending fails?**
A: The system logs errors but continues operation. Users can still reset passwords via admin intervention.

### Getting Help

1. **Check server logs** for detailed error messages
2. **Test with Gmail** to verify basic functionality
3. **Review audit logs** in the admin dashboard
4. **Contact your email provider** for service-specific issues

---

## Email Service Comparison

| Service | Free Tier | Setup Difficulty | Reliability | Features |
|---------|-----------|------------------|-------------|----------|
| Gmail | Unlimited | Easy | High | Basic |
| Brevo | 300/day | Medium | High | Advanced |
| SendGrid | 100/day | Medium | Very High | Enterprise |
| Mailgun | 100/day* | Medium | High | Developer-focused |
| Custom SMTP | Varies | Hard | Varies | Full control |

*First 3 months only

Choose the service that best fits your deployment scale and requirements. 