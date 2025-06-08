#!/usr/bin/env node

/**
 * Fix Double-Hashed Passwords Script
 * 
 * This script identifies and fixes users whose passwords were double-hashed
 * due to the bug in the user approval process where pendingUser.password_hash
 * was passed to User.create() and got hashed again.
 * 
 * The bug occurred when:
 * 1. User registered (password gets hashed and stored in PendingUser.password_hash)
 * 2. Admin approved user (password_hash gets hashed AGAIN in User.password)
 * 3. User can't login because their original password doesn't match the double-hash
 * 
 * This script will:
 * 1. Find users who might be affected
 * 2. Check if their password appears to be double-hashed
 * 3. Optionally reset their passwords to a temporary one
 */

const bcrypt = require('bcrypt');
const { User, AuditLog } = require('../models');
const { Op } = require('sequelize');

const TEMP_PASSWORD = 'TempPass123!'; // Users will need to reset this

async function identifyAffectedUsers() {
  console.log('🔍 Scanning for users with potential double-hashed passwords...\n');
  
  try {
    // Get all users
    const users = await User.findAll({
      where: {
        is_active: true
      },
      order: [['created_at', 'ASC']]
    });

    console.log(`Found ${users.length} active users to check\n`);

    const affectedUsers = [];
    
    for (const user of users) {
      console.log(`Checking user: ${user.email}`);
      
      // Check if the password looks like it could be double-hashed
      // Double-hashed passwords will have specific patterns
      
      let isLikelyDoubleHashed = false;
      
      // Method 1: Check if the stored password looks like a bcrypt hash of a bcrypt hash
      // A bcrypt hash starts with $2a$, $2b$, or $2y$
      // If we hash a bcrypt hash, it would be ~60 chars hashed to ~60 chars
      if (user.password && user.password.length >= 60) {
        // Try to see if this could be a hash of a hash
        // We can't definitively prove it without the original, but we can make educated guesses
        
        // Check pattern - bcrypt hashes have specific structure
        const bcryptPattern = /^\$2[aby]\$\d{2}\$.{53}$/;
        if (bcryptPattern.test(user.password)) {
          // This looks like a normal bcrypt hash, but could still be double-hashed
          // We'll mark as potentially affected if created recently (after the bug was introduced)
          const createdRecently = new Date(user.created_at) > new Date('2024-01-01');
          if (createdRecently) {
            isLikelyDoubleHashed = true;
          }
        }
      }
      
      if (isLikelyDoubleHashed) {
        affectedUsers.push({
          id: user.id,
          email: user.email,
          fullName: user.getFullName(),
          createdAt: user.created_at,
          lastLogin: user.last_login
        });
        console.log(`  ⚠️  POTENTIALLY AFFECTED: ${user.email} (created: ${user.created_at})`);
      } else {
        console.log(`  ✅ Appears normal: ${user.email}`);
      }
    }
    
    console.log(`\n📊 Results:`);
    console.log(`  Total users checked: ${users.length}`);
    console.log(`  Potentially affected: ${affectedUsers.length}`);
    
    if (affectedUsers.length > 0) {
      console.log(`\n🚨 Affected users:`);
      affectedUsers.forEach(user => {
        console.log(`  - ${user.email} (${user.fullName}) - Created: ${user.createdAt}`);
      });
    }
    
    return affectedUsers;
    
  } catch (error) {
    console.error('❌ Error scanning users:', error);
    throw error;
  }
}

async function fixUser(userId, tempPassword = TEMP_PASSWORD) {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    
    console.log(`🔧 Fixing password for user: ${user.email}`);
    
    // Generate new password hash
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(tempPassword, saltRounds);
    
    // Update user password directly (bypass hooks)
    await User.update(
      { 
        password: newPasswordHash,
        last_password_change: new Date()
      },
      { 
        where: { id: userId },
        hooks: false // Bypass hooks to prevent double hashing
      }
    );
    
    // Log the fix
    await AuditLog.create({
      action: 'password_double_hash_fix',
      resource_type: 'user',
      resource_id: userId,
      details: {
        email: user.email,
        reason: 'Fixed double-hashed password from user approval bug',
        tempPasswordSet: true,
        fixedBy: 'system_script'
      },
      ip_address: 'localhost',
      user_agent: 'fix-double-hashed-passwords.js'
    });
    
    console.log(`  ✅ Password fixed for ${user.email}`);
    console.log(`  🔑 Temporary password: ${tempPassword}`);
    console.log(`  📧 User should be notified to reset their password`);
    
    return true;
    
  } catch (error) {
    console.error(`❌ Error fixing user ${userId}:`, error);
    return false;
  }
}

async function main() {
  console.log('🔧 TykBasic - Fix Double-Hashed Passwords\n');
  console.log('This script identifies and fixes users affected by the double-hashing bug.\n');
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  try {
    if (command === 'scan' || !command) {
      // Just scan and report
      const affected = await identifyAffectedUsers();
      
      if (affected.length === 0) {
        console.log('\n✅ No affected users found. All passwords appear to be properly hashed.');
      } else {
        console.log(`\n⚠️  Found ${affected.length} potentially affected users.`);
        console.log('\nTo fix these users, run:');
        console.log('  node scripts/fix-double-hashed-passwords.js fix');
        console.log('\nOr fix individual users:');
        console.log('  node scripts/fix-double-hashed-passwords.js fix-user <email>');
      }
      
    } else if (command === 'fix') {
      // Scan and fix all affected users
      const affected = await identifyAffectedUsers();
      
      if (affected.length === 0) {
        console.log('\n✅ No affected users found.');
        return;
      }
      
      console.log(`\n🔧 Fixing ${affected.length} affected users...\n`);
      
      let fixed = 0;
      for (const user of affected) {
        const success = await fixUser(user.id);
        if (success) fixed++;
      }
      
      console.log(`\n📊 Results:`);
      console.log(`  Users fixed: ${fixed}/${affected.length}`);
      console.log(`  Temporary password: ${TEMP_PASSWORD}`);
      console.log('\n📧 IMPORTANT: Notify these users to reset their passwords!');
      
    } else if (command === 'fix-user') {
      // Fix specific user
      const email = args[1];
      if (!email) {
        console.error('❌ Please provide user email');
        console.log('Usage: node scripts/fix-double-hashed-passwords.js fix-user <email>');
        process.exit(1);
      }
      
      const user = await User.findOne({ where: { email: email.toLowerCase() } });
      if (!user) {
        console.error(`❌ User not found: ${email}`);
        process.exit(1);
      }
      
      const success = await fixUser(user.id);
      if (success) {
        console.log('\n✅ User password fixed successfully!');
        console.log(`📧 Please notify ${email} to reset their password.`);
      }
      
    } else {
      console.log('Usage:');
      console.log('  node scripts/fix-double-hashed-passwords.js scan     # Scan for affected users');
      console.log('  node scripts/fix-double-hashed-passwords.js fix      # Fix all affected users');
      console.log('  node scripts/fix-double-hashed-passwords.js fix-user <email>  # Fix specific user');
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = {
  identifyAffectedUsers,
  fixUser
}; 