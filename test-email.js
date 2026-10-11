#!/usr/bin/env node
/**
 * Email Configuration Test Script
 * Usage: node test-email.js [recipient@email.com] [env-file-path]
 * Examples:
 *   node test-email.js
 *   node test-email.js user@example.com
 *   node test-email.js user@example.com docker/staging/.env
 * 
 * This script tests your SMTP configuration with detailed logging
 */

const path = require('path');
const fs = require('fs');

// Parse arguments
const recipientEmail = process.argv[2] || 'test@example.com';
const envFile = process.argv[3];

// Load environment file
if (envFile) {
  if (!fs.existsSync(envFile)) {
    console.error(`❌ Environment file not found: ${envFile}`);
    process.exit(1);
  }
  console.log(`📁 Loading environment from: ${envFile}\n`);
  require('dotenv').config({ path: envFile });
} else {
  require('dotenv').config();
}

const nodemailer = require('nodemailer');

console.log('\n🔍 Email Configuration Test');
console.log('============================\n');

// Show configuration (hiding password)
console.log('📧 SMTP Configuration:');
console.log('  Host:', process.env.SMTP_HOST || 'not set');
console.log('  Port:', process.env.SMTP_PORT || 'not set');
console.log('  User:', process.env.SMTP_USER || 'not set');
console.log('  Password:', process.env.SMTP_PASSWORD ? '***set***' : 'not set');
console.log('  From:', process.env.SMTP_FROM || 'not set');
console.log('');

// Timeout configuration
const socketTimeout = process.env.SMTP_SOCKET_TIMEOUT ? parseInt(process.env.SMTP_SOCKET_TIMEOUT) : 300000; // 5 minutes for testing
const connectionTimeout = process.env.SMTP_CONNECTION_TIMEOUT ? parseInt(process.env.SMTP_CONNECTION_TIMEOUT) : 180000; // 3 minutes
const greetingTimeout = process.env.SMTP_GREETING_TIMEOUT ? parseInt(process.env.SMTP_GREETING_TIMEOUT) : 120000; // 2 minutes

console.log('⏱️  Timeout Configuration:');
console.log('  Socket:', socketTimeout, 'ms');
console.log('  Connection:', connectionTimeout, 'ms');
console.log('  Greeting:', greetingTimeout, 'ms');
console.log('');

async function testEmail() {
  try {
    // Check required configuration
    if (!process.env.SMTP_HOST || !process.env.SMTP_PORT) {
      console.error('❌ Missing required SMTP configuration');
      console.error('   Please set SMTP_HOST and SMTP_PORT in your .env file');
      process.exit(1);
    }
    
    console.log('🔌 Creating transporter...');
    console.log('  Host:', process.env.SMTP_HOST);
    console.log('  Port:', process.env.SMTP_PORT);
    
    // Determine if using Gmail
    const isGmail = process.env.SMTP_HOST?.toLowerCase().includes('gmail');
    
    // Configure TLS based on port
    let tls;
    if (process.env.SMTP_PORT === "587") {
      // Port 587 uses STARTTLS
      tls = {
        rejectUnauthorized: false,
      };
    }
    
    const transporterConfig = {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      tls,
      socketTimeout,
      connectionTimeout,
      greetingTimeout,
      logger: true,
      debug: true,
      // Gmail specific settings for better reliability
      ...(isGmail && {
        pool: true,
        maxConnections: 1,
        maxMessages: 3,
        rateDelta: 1000,
        rateLimit: 3,
      })
    };
    
    const transporter = nodemailer.createTransport(transporterConfig);
    
    console.log('\n🔍 Verifying connection...');
    console.log('  This may take a while with slow connections...\n');
    
    // Verify connection
    await transporter.verify();
    console.log('✅ Connection verified successfully!\n');
    
    console.log('📤 Sending test email to:', recipientEmail);
    
    // Send test email
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'test@example.com',
      to: recipientEmail,
      subject: 'Test Email - SMTP Configuration Working',
      text: 'This is a test email to verify SMTP configuration.\n\nIf you received this, your email configuration is working correctly!',
      html: '<h2>Test Email</h2><p>This is a test email to verify SMTP configuration.</p><p><strong>If you received this, your email configuration is working correctly!</strong></p>'
    });
    
    console.log('\n✅ SUCCESS! Email sent successfully');
    console.log('  Message ID:', info.messageId);
    console.log('  Response:', info.response);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    
    if (error.message.includes('timeout')) {
      console.log('\n💡 Timeout Issue Detected:');
      console.log('  - Check your firewall settings');
      console.log('  - Verify network connectivity to SMTP server');
      console.log('  - Try increasing timeout values in .env');
      console.log('  - For Gmail: Make sure you\'re using an App Password');
    } else if (error.message.includes('auth')) {
      console.log('\n💡 Authentication Issue Detected:');
      console.log('  - For Gmail: Use App Password, not regular password');
      console.log('  - Generate App Password at: https://myaccount.google.com/apppasswords');
      console.log('  - Check SMTP_USER and SMTP_PASSWORD in .env');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Connection Refused:');
      console.log('  - Check SMTP_HOST and SMTP_PORT');
      console.log('  - Verify the SMTP server is accessible');
      console.log('  - Check firewall rules');
    }
    
    console.log('\nFull error:', error);
    process.exit(1);
  }
}

// Run the test
console.log('🚀 Starting email test...\n');
testEmail().then(() => {
  console.log('\n✅ Test completed successfully!');
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
