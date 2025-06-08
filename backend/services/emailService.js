const nodemailer = require('nodemailer');
const fetch = require('node-fetch');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const { SystemConfig } = require('../models');

class EmailService {
  constructor() {
    this.transporter = null;
    this.config = null;
  }

  async loadConfig() {
    try {
      const configRecord = await SystemConfig.findOne({
        where: { key: 'email_config' }
      });
      
      if (configRecord && configRecord.value) {
        this.config = configRecord.value;
        await this.createTransporter();
        return true;
      }
      
      console.log('No email configuration found');
      return false;
    } catch (error) {
      console.error('Failed to load email configuration:', error);
      return false;
    }
  }

  async createTransporter() {
    if (!this.config || !this.config.enabled) {
      console.log('Email service is disabled');
      return false;
    }

    try {
      let transportConfig = {};

      switch (this.config.service) {
        case 'gmail':
          transportConfig = {
            service: 'gmail',
            auth: {
              user: this.config.username,
              pass: this.config.password
            }
          };
          break;

        case 'smtp':
          transportConfig = {
            host: this.config.host,
            port: this.config.port,
            secure: this.config.secure, // true for 465, false for other ports
            auth: {
              user: this.config.username,
              pass: this.config.password
            }
          };
          
          // Add debugging for SMTP configuration
          console.log(`🔧 SMTP Config: ${this.config.host}:${this.config.port}, secure: ${this.config.secure}, user: ${this.config.username}`);
          break;

        case 'sendgrid':
          transportConfig = {
            service: 'SendGrid',
            auth: {
              user: 'apikey',
              pass: this.config.password // API key
            }
          };
          break;

        case 'mailgun':
          // For Mailgun, we'll use SMTP
          transportConfig = {
            host: 'smtp.mailgun.org',
            port: 587,
            secure: false,
            auth: {
              user: this.config.username, // Mailgun SMTP username
              pass: this.config.password   // Mailgun SMTP password
            }
          };
          break;

        case 'brevo':
          // For Brevo, we can use either HTTP API or SMTP
          // If API key is provided, we'll use HTTP API
          // If username is provided, we'll use SMTP
          if (this.config.password && this.config.password.startsWith('xkeysib-')) {
            // Use HTTP API - no transporter needed
            console.log('✅ Brevo HTTP API configured');
            return true;
          } else {
            // Use SMTP fallback
            transportConfig = {
              host: 'smtp-relay.brevo.com',
              port: 587,
              secure: false,
              auth: {
                user: this.config.username || this.config.fromEmail,
                pass: this.config.password
              }
            };
          }
          break;

        default:
          throw new Error(`Unsupported email service: ${this.config.service}`);
      }

      // For Brevo HTTP API, we don't need nodemailer transporter
      if (this.config.service === 'brevo' && this.config.password && this.config.password.startsWith('xkeysib-')) {
        this.transporter = 'brevo-api'; // Special marker
        return true;
      }

      this.transporter = nodemailer.createTransport(transportConfig);
      
      // Verify the connection
      await this.transporter.verify();
      console.log(`✅ Email service configured successfully (${this.config.service})`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to configure email service (${this.config.service}):`, error.message);
      this.transporter = null;
      return false;
    }
  }

  async sendEmail(to, subject, text, html = null) {
    try {
      // Ensure config is loaded and transporter is ready
      if (!this.transporter) {
        const configLoaded = await this.loadConfig();
        if (!configLoaded) {
          throw new Error('Email service is not configured or disabled');
        }
      }

      // Use Brevo HTTP API if configured
      if (this.config.service === 'brevo' && this.transporter === 'brevo-api') {
        return await this.sendBrevoAPI(to, subject, text, html);
      }

      // Use nodemailer for other providers
      const mailOptions = {
        from: `"${this.config.fromName || 'TykBasic'}" <${this.config.fromEmail}>`,
        to: to,
        subject: subject,
        text: text
      };

      if (html) {
        mailOptions.html = html;
      }

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`📧 Email sent successfully to ${to}: ${info.messageId}`);
      
      return {
        success: true,
        messageId: info.messageId,
        to: to,
        subject: subject
      };

    } catch (error) {
      console.error(`❌ Failed to send email to ${to}:`, error.message);
      return {
        success: false,
        error: error.message,
        to: to,
        subject: subject
      };
    }
  }

  // Brevo SDK implementation
  async sendBrevoAPI(to, subject, text, html = null) {
    try {
      // Configure Brevo SDK
      const defaultClient = SibApiV3Sdk.ApiClient.instance;
      const apiKey = defaultClient.authentications['api-key'];
      apiKey.apiKey = this.config.password; // Your API key

      // Create API instance
      const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

      // Create email object
      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      
      sendSmtpEmail.subject = subject;
      sendSmtpEmail.sender = {
        name: this.config.fromName || 'TykBasic',
        email: this.config.fromEmail
      };
      sendSmtpEmail.to = [
        {
          email: to,
          name: to.split('@')[0] // Use email prefix as name if no name provided
        }
      ];
      
      if (html) {
        sendSmtpEmail.htmlContent = html;
      }
      
      if (text) {
        sendSmtpEmail.textContent = text;
      }

      // Send the email
      const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`📧 Email sent successfully via Brevo SDK to ${to}: ${data.messageId}`);
      
      return {
        success: true,
        messageId: data.messageId,
        to: to,
        subject: subject,
        provider: 'brevo-sdk'
      };

    } catch (error) {
      console.error(`❌ Failed to send email via Brevo SDK to ${to}:`, error.message);
      return {
        success: false,
        error: error.message,
        to: to,
        subject: subject,
        provider: 'brevo-sdk'
      };
    }
  }

  async sendPasswordResetEmail(email, resetToken, firstName = '') {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const subject = 'Reset Your TykBasic Password';
    
    const text = `
Hello${firstName ? ` ${firstName}` : ''},

You requested a password reset for your TykBasic account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request this password reset, you can safely ignore this email.

Best regards,
The TykBasic Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reset Your Password</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reset Your Password</h1>
    </div>
    <div class="content">
      <p>Hello${firstName ? ` ${firstName}` : ''},</p>
      
      <p>You requested a password reset for your TykBasic account.</p>
      
      <p>Click the button below to reset your password:</p>
      
      <p style="text-align: center;">
        <a href="${resetUrl}" class="button">Reset My Password</a>
      </p>
      
      <p>Or copy and paste this link into your browser:</p>
      <p style="background: #eee; padding: 10px; border-radius: 4px; word-break: break-all;">
        ${resetUrl}
      </p>
      
      <p><strong>This link will expire in 1 hour</strong> for security reasons.</p>
      
      <p>If you didn't request this password reset, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>Best regards,<br>The TykBasic Team</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    return await this.sendEmail(email, subject, text, html);
  }

  async sendWelcomeEmail(email, firstName = '', tempPassword = null) {
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;
    
    const subject = 'Welcome to TykBasic!';
    
    let passwordInfo = '';
    if (tempPassword) {
      passwordInfo = `Your temporary password is: ${tempPassword}\n\nPlease log in and change your password immediately.`;
    }
    
    const text = `
Hello${firstName ? ` ${firstName}` : ''},

Welcome to TykBasic! Your account has been approved and is now active.

${passwordInfo}

You can log in here:
${loginUrl}

If you have any questions, please contact your system administrator.

Best regards,
The TykBasic Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to TykBasic</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .credentials { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to TykBasic!</h1>
    </div>
    <div class="content">
      <p>Hello${firstName ? ` ${firstName}` : ''},</p>
      
      <p>Welcome to TykBasic! Your account has been approved and is now active.</p>
      
      ${tempPassword ? `
      <div class="credentials">
        <p><strong>Your temporary credentials:</strong></p>
        <p>Email: ${email}</p>
        <p>Password: <strong>${tempPassword}</strong></p>
        <p><em>Please change your password after logging in.</em></p>
      </div>` : ''}
      
      <p style="text-align: center;">
        <a href="${loginUrl}" class="button">Log In to TykBasic</a>
      </p>
      
      <p>If you have any questions, please contact your system administrator.</p>
    </div>
    <div class="footer">
      <p>Best regards,<br>The TykBasic Team</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    return await this.sendEmail(email, subject, text, html);
  }

  async sendTestEmail(email, testMessage = 'This is a test email from TykBasic.') {
    const subject = 'TykBasic Email Test';
    
    const text = `
Hello,

${testMessage}

If you received this email, your TykBasic email configuration is working correctly!

Service: ${this.config?.service || 'Unknown'}
From: ${this.config?.fromEmail || 'Unknown'}

Best regards,
The TykBasic Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Email Test</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Email Test Successful</h1>
    </div>
    <div class="content">
      <div class="success">
        <p><strong>Congratulations!</strong></p>
        <p>${testMessage}</p>
      </div>
      
      <p>If you received this email, your TykBasic email configuration is working correctly!</p>
      
      <p><strong>Configuration Details:</strong></p>
      <ul>
        <li>Service: ${this.config?.service || 'Unknown'}</li>
        <li>From: ${this.config?.fromEmail || 'Unknown'}</li>
        <li>Test sent at: ${new Date().toISOString()}</li>
      </ul>
    </div>
  </div>
</body>
</html>
    `.trim();

    return await this.sendEmail(email, subject, text, html);
  }

  // Check if email service is configured and enabled
  isConfigured() {
    return this.config && this.config.enabled && this.transporter;
  }

  // Get current configuration status
  getStatus() {
    return {
      configured: !!this.config,
      enabled: this.config?.enabled || false,
      service: this.config?.service || null,
      fromEmail: this.config?.fromEmail || null,
      transporterReady: !!this.transporter
    };
  }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService; 