#!/usr/bin/env node
/**
 * Environment Configuration Checker
 * Usage: node check-env.js [local-env-file] [--remote]
 * 
 * Compares local .env with remote server configuration
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse arguments
const args = process.argv.slice(2);
const localEnvFile = args[0] || '.env';
const checkRemote = args.includes('--remote');

console.log('\n🔍 Environment Configuration Checker');
console.log('=====================================\n');

// Required variables for email functionality
const REQUIRED_EMAIL_VARS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM',
  'APP_NAME',
  'APP_URL'
];

// Optional but recommended
const OPTIONAL_VARS = [
  'SMTP_SOCKET_TIMEOUT',
  'SMTP_CONNECTION_TIMEOUT',
  'SMTP_GREETING_TIMEOUT',
  'DEFAULT_LANGUAGE'
];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const vars = {};
  
  content.split('\n').forEach(line => {
    // Skip comments and empty lines
    if (!line || line.startsWith('#')) return;
    
    const [key, ...valueParts] = line.split('=');
    if (key) {
      vars[key.trim()] = valueParts.join('=').trim();
    }
  });
  
  return vars;
}

function maskSensitive(key, value) {
  const sensitiveKeys = ['PASSWORD', 'SECRET', 'TOKEN', 'KEY'];
  if (sensitiveKeys.some(k => key.includes(k))) {
    return value ? '***configured***' : 'not set';
  }
  return value || 'not set';
}

function checkEnvironment(envPath, label) {
  console.log(`📋 Checking ${label}: ${envPath}\n`);
  
  const vars = parseEnvFile(envPath);
  
  if (!vars) {
    console.log(`❌ File not found: ${envPath}\n`);
    return null;
  }
  
  console.log('📧 Email Configuration:');
  
  // Check SMTP configuration
  const hasHost = vars.SMTP_HOST && vars.SMTP_PORT;
  
  if (hasHost) {
    console.log('  ✅ SMTP configured:', vars.SMTP_HOST + ':' + vars.SMTP_PORT);
    // Check if it's Gmail
    if (vars.SMTP_HOST?.toLowerCase().includes('gmail')) {
      console.log('  📌 Gmail detected - Remember to use App Password, not regular password');
    }
  } else {
    console.log('  ❌ No SMTP configuration found (need SMTP_HOST and SMTP_PORT)');
  }
  
  // Check required variables
  console.log('\n🔑 Required Variables:');
  REQUIRED_EMAIL_VARS.forEach(key => {
    const value = vars[key];
    const masked = maskSensitive(key, value);
    const status = value ? '✅' : '❌';
    console.log(`  ${status} ${key}: ${masked}`);
  });
  
  // Check optional variables
  console.log('\n📝 Optional Variables:');
  OPTIONAL_VARS.forEach(key => {
    const value = vars[key];
    const status = value ? '✅' : '⚪';
    console.log(`  ${status} ${key}: ${value || 'not set'}`);
  });
  
  // Check for APP_NAME specifically (for email subject)
  if (!vars.APP_NAME) {
    console.log('\n⚠️  WARNING: APP_NAME not set');
    console.log('   Email subjects will show [undefined] instead of application name');
  }
  
  return vars;
}

// Main execution
console.log('🔍 Checking local environment...\n');

// Check different possible .env locations
const envFiles = [
  localEnvFile,
  'docker/staging/.env',
  'docker/prod/.env',
  '.env.example'
];

let foundEnv = false;
for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    console.log(`Found: ${envFile}`);
    foundEnv = true;
  }
}

if (!foundEnv) {
  console.log('❌ No .env files found');
  console.log('\nCreate one of these files with your configuration:');
  console.log('  - .env (for local development)');
  console.log('  - docker/staging/.env (for staging)');
  console.log('  - docker/prod/.env (for production)');
  process.exit(1);
}

console.log('');

// Check specified environment
const localVars = checkEnvironment(localEnvFile, 'Local Environment');

// Check remote if requested
if (checkRemote) {
  console.log('\n' + '='.repeat(50) + '\n');
  console.log('🌐 Checking remote server configuration...\n');
  
  try {
    // Try to detect environment from git branch
    const branch = execSync('git branch --show-current').toString().trim();
    const environment = branch === 'main' ? 'production' : 'staging';
    const serverHost = environment === 'production' ? 'jupiter.ar' : 'stage.jupiter.ar';
    
    console.log(`Detected environment: ${environment}`);
    console.log(`Connecting to: deploy@${serverHost}\n`);
    
    // Get remote .env (without showing sensitive data)
    const remoteEnv = execSync(
      `ssh deploy@${serverHost} "cat /home/deploy/jupiter-${environment}/.env | grep -E '^(SMTP_|APP_)' | sed 's/=.*PASSWORD.*/=***configured***/g'"`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
    
    console.log('Remote configuration (masked):');
    console.log(remoteEnv);
    
  } catch (error) {
    console.log('❌ Could not connect to remote server');
    console.log('   Make sure you have SSH access configured');
  }
}

// Comparison if we have staging/prod files locally
console.log('\n' + '='.repeat(50) + '\n');
console.log('📊 Environment Comparison:\n');

const stagingVars = parseEnvFile('docker/staging/.env');
const prodVars = parseEnvFile('docker/prod/.env');

if (stagingVars || prodVars) {
  const allKeys = new Set([
    ...REQUIRED_EMAIL_VARS,
    ...OPTIONAL_VARS,
    ...(stagingVars ? Object.keys(stagingVars) : []),
    ...(prodVars ? Object.keys(prodVars) : [])
  ]);
  
  console.log('Variable                  | Local      | Staging    | Production');
  console.log('-'.repeat(65));
  
  allKeys.forEach(key => {
    if (!key.startsWith('SMTP_') && !key.startsWith('APP_')) return;
    
    const local = localVars && localVars[key] ? '✅' : '❌';
    const staging = stagingVars && stagingVars[key] ? '✅' : '❌';
    const prod = prodVars && prodVars[key] ? '✅' : '❌';
    
    console.log(`${key.padEnd(25)} | ${local.padEnd(10)} | ${staging.padEnd(10)} | ${prod}`);
  });
}

// Recommendations
console.log('\n' + '='.repeat(50) + '\n');
console.log('💡 Recommendations:\n');

if (localVars && !localVars.APP_NAME) {
  console.log('1. Add APP_NAME to your .env file:');
  console.log('   APP_NAME=Jupiter\n');
}

if (localVars && !localVars.APP_URL) {
  console.log('2. Add APP_URL to your .env file:');
  console.log('   APP_URL=https://app.jupiter.ar\n');
}

if (localVars && !localVars.SMTP_SOCKET_TIMEOUT) {
  console.log('3. For slow connections, add timeout configuration:');
  console.log('   SMTP_SOCKET_TIMEOUT=180000');
  console.log('   SMTP_CONNECTION_TIMEOUT=120000');
  console.log('   SMTP_GREETING_TIMEOUT=60000\n');
}

console.log('✅ Check complete!\n');
