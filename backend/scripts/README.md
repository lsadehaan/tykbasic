# TykBasic Bootstrap Scripts

This directory contains scripts for setting up TykBasic in different environments.

## 🔧 Development Setup

### `seed-database.js`
**For development/testing only**

```bash
node scripts/seed-database.js
```

Creates:
- Default test organizations (`default`, `admin`)
- Test admin user: `admin@tykbasic.local` / `admin123!`
- Test regular user: `test@tykbasic.local` / `test123!`
- Email whitelist for local domains
- Basic system configuration

**⚠️ NEVER use in production!** This script:
- Creates hardcoded, weak passwords
- Logs credentials to console
- Uses local development domains
- Has production safety checks that will prevent execution

## 🚀 Production Setup

### `bootstrap-production.js`
**For production deployments**

```bash
node scripts/bootstrap-production.js
```

Features:
- ✅ Secure password generation or validation
- ✅ No credential logging
- ✅ Interactive prompts or environment variables
- ✅ Production-safe email validation
- ✅ Strong password requirements (12+ chars, mixed case, numbers, symbols)
- ✅ Prevents duplicate super admin creation

#### Usage Options:

1. **Interactive Mode** (recommended for manual setup):
   ```bash
   node scripts/bootstrap-production.js
   ```

2. **Environment Variables** (recommended for CI/CD):
   ```bash
   export SUPER_ADMIN_EMAIL="admin@yourcompany.com"
   export SUPER_ADMIN_PASSWORD="YourSecurePassword123!"
   node scripts/bootstrap-production.js
   ```

3. **Command Line Arguments**:
   ```bash
   node scripts/bootstrap-production.js --email admin@yourcompany.com --password YourSecurePassword123!
   ```

## 🛠️ Utility Scripts

### `upgrade-admin-to-super.js`
Upgrades an existing admin user to super_admin role.

```bash
node scripts/upgrade-admin-to-super.js
```

## 🔒 Security Best Practices

### Password Requirements
Production bootstrap enforces:
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter  
- At least one number
- At least one special character

### Environment Variables
For production, always use environment variables:
```bash
# Required for production
NODE_ENV=production
DATABASE_URL=postgresql://user:password@localhost:5432/tykbasic_prod
JWT_SECRET=your-long-random-jwt-secret
SESSION_SECRET=your-long-random-session-secret
TYK_GATEWAY_URL=https://your-tyk-gateway.com
TYK_GATEWAY_SECRET=your-tyk-gateway-secret

# For bootstrap
SUPER_ADMIN_EMAIL=admin@yourcompany.com
SUPER_ADMIN_PASSWORD=YourSecurePassword123!
```

## 🚨 Common Errors

### "This seeding script is NOT safe for production"
- You're trying to use `seed-database.js` in production
- Use `bootstrap-production.js` instead
- Or set `ALLOW_UNSAFE_SEEDING=true` (not recommended)

### "Super admin user already exists"
- A super admin with that email already exists
- Use password reset functionality to change password
- Or use a different email address

### "Password does not meet security requirements"
- Check password meets all requirements (length, character types)
- Use the automatic password generator option
- Refer to password requirements above

## 📚 Additional Resources

- See `PRODUCTION_DEPLOYMENT.md` for complete production setup guide
- See `TYK_FRONTEND_IMPLEMENTATION_GUIDE.md` for implementation details
- See `gateway-swagger.yml` for Tyk Gateway API specifications 