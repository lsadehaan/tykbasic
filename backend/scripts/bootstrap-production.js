#!/usr/bin/env node

/**
 * Production Bootstrap Script for TykBasic
 * 
 * This script securely creates the initial super admin user for production deployments.
 * 
 * Usage:
 * 1. Environment Variables (recommended for CI/CD):
 *    SUPER_ADMIN_EMAIL=admin@yourcompany.com SUPER_ADMIN_PASSWORD=secure-password node bootstrap-production.js
 * 
 * 2. Interactive Mode:
 *    node bootstrap-production.js
 * 
 * 3. With arguments:
 *    node bootstrap-production.js --email admin@yourcompany.com --password secure-password
 */

const bcrypt = require('bcrypt');
const readline = require('readline');
const crypto = require('crypto');
const { sequelize, User, Organization, SystemConfig } = require('../models');

// Password requirements
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_REQUIREMENTS = {
  minLength: PASSWORD_MIN_LENGTH,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

function validatePassword(password) {
  const errors = [];
  
  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`);
  }
  
  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (PASSWORD_REQUIREMENTS.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (PASSWORD_REQUIREMENTS.requireSpecialChars && 
      !new RegExp(`[${PASSWORD_REQUIREMENTS.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(password)) {
    errors.push(`Password must contain at least one special character (${PASSWORD_REQUIREMENTS.specialChars})`);
  }
  
  return errors;
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function generateSecurePassword() {
  const length = 16;
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  let password = '';
  
  // Ensure at least one character from each required set
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest randomly
  const allChars = uppercase + lowercase + numbers + special;
  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

function getInput(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    if (hidden) {
      // Hide password input
      const stdin = process.openStdin();
      process.stdin.on('data', char => {
        const byteArray = [...char];
        if (byteArray.length > 0 && byteArray[0] === 3) {
          console.log('^C');
          process.exit(1);
        }
        process.stdout.write('\x1B[2K\x1B[200D' + question + '*'.repeat(rl.line.length));
      });
    }
    
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) {
        console.log(); // Add newline after hidden input
      }
      resolve(answer.trim());
    });
  });
}

async function createSuperAdmin(email, password) {
  try {
    console.log('🔄 Initializing database connection...');
    
    // Ensure database is synced
    await sequelize.sync({ force: false, alter: true });
    console.log('✅ Database connection established');

    // Create admin organization if it doesn't exist
    const [adminOrg] = await Organization.findOrCreate({
      where: { name: 'admin' },
      defaults: {
        name: 'admin',
        display_name: 'System Administrators',
        description: 'System administrative organization',
        status: 'active',
        settings: {
          allowSelfRegistration: false,
          requireEmailVerification: false,
          defaultUserRole: 'admin'
        }
      }
    });

    // Check if super admin already exists
    const existingAdmin = await User.findOne({
      where: { 
        email: email,
        role: 'super_admin'
      }
    });

    if (existingAdmin) {
      console.log('⚠️  Super admin user already exists with that email');
      console.log('   If you need to reset the password, use the password reset functionality');
      return false;
    }

    // Create the super admin user
    const superAdmin = await User.create({
      email: email,
      password: password, // Will be hashed by the model hook
      first_name: 'Super',
      last_name: 'Admin',
      role: 'super_admin',
      is_active: true,
      organization_id: adminOrg.id,
      is_verified: true,
      preferences: {
        theme: 'light',
        notifications: true,
        timezone: 'UTC'
      }
    });

    console.log('✅ Super admin user successfully created');
    console.log(`   Email: ${email}`);
    console.log(`   Role: super_admin`);
    console.log(`   Organization: ${adminOrg.display_name}`);
    
    return true;

  } catch (error) {
    console.error('❌ Failed to create super admin:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 TykBasic Production Bootstrap');
  console.log('================================\n');

  let email, password;

  // Parse command line arguments
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf('--email');
  const passwordIndex = args.indexOf('--password');

  if (emailIndex !== -1 && emailIndex + 1 < args.length) {
    email = args[emailIndex + 1];
  }

  if (passwordIndex !== -1 && passwordIndex + 1 < args.length) {
    password = args[passwordIndex + 1];
  }

  // Check environment variables
  if (!email) {
    email = process.env.SUPER_ADMIN_EMAIL;
  }

  if (!password) {
    password = process.env.SUPER_ADMIN_PASSWORD;
  }

  // Interactive mode if not provided
  if (!email || !password) {
    console.log('Super Admin Account Setup');
    console.log('-------------------------\n');
    
    if (!email) {
      while (!email || !validateEmail(email)) {
        email = await getInput('Super Admin Email: ');
        if (!validateEmail(email)) {
          console.log('❌ Invalid email format. Please try again.\n');
          email = null;
        }
      }
    }

    if (!password) {
      console.log('\nPassword Requirements:');
      console.log(`• At least ${PASSWORD_REQUIREMENTS.minLength} characters`);
      console.log('• At least one uppercase letter');
      console.log('• At least one lowercase letter');
      console.log('• At least one number');
      console.log('• At least one special character\n');

      const useGenerated = await getInput('Generate secure password automatically? (y/n): ');
      
      if (useGenerated.toLowerCase() === 'y' || useGenerated.toLowerCase() === 'yes') {
        password = generateSecurePassword();
        console.log('\n🔐 Generated secure password (SAVE THIS SECURELY):');
        console.log(`   ${password}\n`);
        
        const confirm = await getInput('Continue with this password? (y/n): ');
        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
          console.log('Bootstrap cancelled.');
          process.exit(0);
        }
      } else {
        while (!password) {
          password = await getInput('Super Admin Password: ', true);
          const passwordErrors = validatePassword(password);
          
          if (passwordErrors.length > 0) {
            console.log('❌ Password does not meet requirements:');
            passwordErrors.forEach(error => console.log(`   • ${error}`));
            console.log();
            password = null;
          }
        }
      }
    }
  }

  // Final validation
  if (!validateEmail(email)) {
    console.error('❌ Invalid email format');
    process.exit(1);
  }

  const passwordErrors = validatePassword(password);
  if (passwordErrors.length > 0) {
    console.error('❌ Password does not meet security requirements:');
    passwordErrors.forEach(error => console.error(`   • ${error}`));
    process.exit(1);
  }

  console.log('\n🔄 Creating super admin user...\n');

  const success = await createSuperAdmin(email, password);
  
  if (success) {
    console.log('\n🎉 Bootstrap completed successfully!');
    console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
    console.log('   • Store the admin credentials securely');
    console.log('   • Consider setting up MFA for the admin account');
    console.log('   • Review and update system configuration');
    console.log('   • Configure proper TLS/SSL certificates');
    console.log('   • Set up proper backup procedures');
    console.log('\nYou can now log in to the TykBasic dashboard with the created credentials.');
  } else {
    console.log('\n❌ Bootstrap failed');
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n\nBootstrap cancelled by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nBootstrap terminated');
  process.exit(0);
});

// Run the bootstrap
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Bootstrap failed:', error);
      process.exit(1);
    });
}

module.exports = { createSuperAdmin, validatePassword, validateEmail }; 