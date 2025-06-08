# Password Double-Hashing Bug Fix

## Problem Summary

A critical bug was discovered in the user registration and approval process that prevented users from logging in with their originally set passwords.

### The Bug

1. **Registration Process**: When users registered, their passwords were correctly hashed using bcrypt and stored in the `pending_users` table as `password_hash`.

2. **Approval Process**: When admins approved pending users, the system transferred the already-hashed password to the `users` table, but the User model's `beforeCreate` hook attempted to hash it again.

3. **Result**: Users ended up with double-hashed passwords that could never match their original passwords during login attempts.

### Code Location

The bug was in `backend/routes/admin.js` in the user approval endpoint:

```javascript
// ❌ BUGGY CODE (before fix)
const newUser = await User.create({
  email: pendingUser.email,
  password: pendingUser.password_hash, // Already hashed, but gets hashed again!
  // ... other fields
});
```

## The Fix

### 1. Fixed the Approval Process

Updated `backend/routes/admin.js` to bypass the password hashing hook when creating approved users:

```javascript
// ✅ FIXED CODE
const newUser = await User.create({
  email: pendingUser.email,
  password: pendingUser.password_hash, // Already hashed
  first_name: pendingUser.first_name,
  last_name: pendingUser.last_name,
  role: role,
  organization_id: pendingUser.organization_id,
  is_active: true,
  is_verified: true
}, {
  hooks: false // Bypass beforeCreate hook to prevent double-hashing
});
```

### 2. Created Recovery Script

Created `backend/scripts/fix-double-hashed-passwords.js` to identify and fix affected users:

- **Scan Mode**: Identifies potentially affected users
- **Fix Mode**: Resets affected users' passwords to a temporary password
- **Individual Fix**: Fixes specific users by email

### 3. Recovery Process

For affected users like `info@idnteq.net`:

1. **Identified the Issue**: User couldn't login despite correct password
2. **Ran the Fix**: `node scripts/fix-double-hashed-passwords.js fix-user info@idnteq.net`
3. **Set Temporary Password**: `TempPass123!`
4. **Verified Fix**: User can now login with temporary password
5. **Next Step**: User should reset their password via the normal password reset flow

## Usage Instructions

### For System Administrators

#### Check for Affected Users
```bash
cd backend
node scripts/fix-double-hashed-passwords.js scan
```

#### Fix All Affected Users
```bash
cd backend
node scripts/fix-double-hashed-passwords.js fix
```

#### Fix Specific User
```bash
cd backend
node scripts/fix-double-hashed-passwords.js fix-user user@example.com
```

### For Users

If you're experiencing login issues after registration and approval:

1. **Contact your administrator** to run the fix script for your account
2. **Login with temporary password**: `TempPass123!`
3. **Reset your password** immediately via the password reset flow
4. **Use your new password** for future logins

## Prevention

This fix ensures that future user approvals will work correctly. The bug has been permanently resolved by:

1. Adding `hooks: false` to bypass password hashing during user approval
2. Adding comprehensive logging and audit trails
3. Creating recovery tools for any affected users

## Security Notes

- The temporary password `TempPass123!` is logged in audit logs
- Users should reset their passwords immediately after being fixed
- All password fixes are logged with full audit trails
- The fix script requires backend database access (admin only)

## Testing

The fix was verified by:

1. Running the recovery script on affected user `info@idnteq.net`
2. Confirming successful login with temporary password
3. Verifying that new user registrations and approvals work correctly

---

**Resolution Date**: June 8, 2025  
**Affected Users**: Anyone who registered and was approved before this fix  
**Status**: ✅ RESOLVED 