# 📧 Email Configuration Guide

## ✅ Quick Setup for Gmail

Gmail is the easiest option for getting started. Follow these steps:

### 1. Enable 2-Step Verification
- Go to: https://myaccount.google.com/security
- Enable "2-Step Verification" if not already enabled

### 2. Generate App Password
- Go to: https://myaccount.google.com/apppasswords
- Select "Mail" as the app
- Select your device
- Click "Generate"
- Copy the 16-character password (spaces don't matter)

### 3. Configure .env File

```bash
# Email Configuration for Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587                      # Use port 587 for modern STARTTLS
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx  # Your 16-character App Password
SMTP_FROM="Agilbank <your-email@gmail.com>"

# Optional: Increase timeouts for slow connections
# SMTP_SOCKET_TIMEOUT=180000      # 3 minutes
# SMTP_CONNECTION_TIMEOUT=120000   # 2 minutes
# SMTP_GREETING_TIMEOUT=60000      # 1 minute
```

### 4. Test Your Configuration

```bash
# Run the test script
node test-email.js your-email@gmail.com

# You should see:
# ✅ SUCCESS! Email sent successfully
```

## 🔧 Alternative SMTP Providers

### SendGrid
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
SMTP_FROM="Agilbank <noreply@agilbank.ar>"
```

### Amazon SES
```bash
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-ses-smtp-username
SMTP_PASSWORD=your-ses-smtp-password
SMTP_FROM="Agilbank <verified-email@agilbank.ar>"
```

### Mailgun
```bash
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@mg.yourdomain.com
SMTP_PASSWORD=your-mailgun-password
SMTP_FROM="Agilbank <noreply@mg.yourdomain.com>"
```

### Office 365
```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@company.com
SMTP_PASSWORD=your-password
SMTP_FROM="Agilbank <your-email@company.com>"
```

## 🚨 Troubleshooting

### "Connection timeout"
**Problem**: Can't connect to SMTP server
**Solutions**:
1. Increase timeout values in .env:
   ```bash
   SMTP_SOCKET_TIMEOUT=300000      # 5 minutes
   SMTP_CONNECTION_TIMEOUT=180000   # 3 minutes
   ```
2. Check firewall rules (ports 587, 465, 25)
3. Verify network connectivity to SMTP server
4. For Gmail: Ensure you're using App Password, not regular password

### "Authentication failed"
**Problem**: Invalid credentials
**Solutions**:
1. For Gmail: Use App Password (16 characters), not your regular password
2. Check SMTP_USER is your full email address
3. Verify password has no typos (copy-paste recommended)
4. Some providers require specific "from" addresses

### "Invalid from address"
**Problem**: SMTP_FROM not accepted
**Solutions**:
1. Use the same email as SMTP_USER for Gmail
2. For SES: Verify the sender email first
3. For business accounts: May need domain verification

### Testing in Different Environments

```bash
# Test with specific .env file
cp docker/staging/.env .env.test
node -r dotenv/config test-email.js recipient@example.com dotenv_config_path=.env.test

# Test with environment variables directly
SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_USER=test@gmail.com SMTP_PASSWORD=xxxx node test-email.js

# Test in Docker container
docker compose exec server node test-email.js recipient@example.com
```

## 📝 Important Notes

### For Production

1. **Use dedicated email service**: Consider SendGrid, SES, or Mailgun for better deliverability
2. **Set up SPF/DKIM/DMARC**: Improves email deliverability
3. **Monitor bounce rates**: High bounce rates can affect sender reputation
4. **Use queuing**: For high volume, implement email queuing with workers

### Security Best Practices

1. **Never commit credentials**: Keep .env files out of version control
2. **Use environment-specific credentials**: Different passwords for dev/staging/prod
3. **Rotate passwords regularly**: Especially for production
4. **Monitor for abuse**: Set up alerts for unusual email volumes

### Rate Limits

Different providers have different limits:
- **Gmail (with App Password)**: ~500 emails/day
- **SendGrid (free)**: 100 emails/day
- **Amazon SES**: Starts at 200 emails/day (increases with reputation)
- **Mailgun (free)**: 5,000 emails/month

## 🐳 Docker Configuration

### ⚠️ CRITICAL: Environment Variables in Docker

**Common Problem**: "Emails work locally but fail in Docker containers"

**Root Cause**: Docker containers don't automatically receive .env variables. They must be explicitly passed in docker-compose.yml

**Solution**: Ensure your `docker-compose.yml` includes ALL email variables:

```yaml
services:
  server:
    environment:
      # Email configuration (REQUIRED)
      APP_NAME: ${APP_NAME}
      APP_URL: ${APP_URL}
      SMTP_SERVICE: ${SMTP_SERVICE}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASSWORD: ${SMTP_PASSWORD}
      SMTP_FROM: ${SMTP_FROM}
      # Optional timeouts
      SMTP_SOCKET_TIMEOUT: ${SMTP_SOCKET_TIMEOUT:-120000}
      SMTP_CONNECTION_TIMEOUT: ${SMTP_CONNECTION_TIMEOUT:-90000}
      SMTP_GREETING_TIMEOUT: ${SMTP_GREETING_TIMEOUT:-30000}
  
  worker:  # Workers also send emails!
    environment:
      # Same email variables needed here
      APP_NAME: ${APP_NAME}
      # ... (all SMTP variables)
```

### Verifying Docker Configuration

```bash
# Check if variables are reaching the container
docker exec <container-name> env | grep SMTP

# Test email from inside container
docker exec <container-name> npm run db:seed

# View logs
docker compose logs server | grep -i email
```

## 🧪 Testing Seeds with Email

When running seeds, emails are sent to new users with their passwords. If email fails:

1. **Check /app/backups/seed/created_users.txt**: Created ONLY when emails fail, contains usernames and passwords as backup
2. **Run seed with email disabled**:
   ```bash
   SKIP_EMAILS=true npm run db:seed
   ```
3. **Test email separately**:
   ```bash
   node test-email.js user@example.com
   ```

## 📊 Monitoring Email Delivery

### Check Email Logs

```bash
# In development
npm run dev 2>&1 | grep -i email

# In Docker
docker compose logs server | grep -i email

# In production
ssh deploy@server "cd /home/deploy/agilbank && docker compose logs server | grep -i email"
```

### Email Metrics to Track

- **Sent**: Total emails sent
- **Bounced**: Invalid addresses
- **Complaints**: Marked as spam
- **Opens**: Engagement rate (requires tracking pixel)
- **Clicks**: Link engagement (requires link tracking)

## 🛠️ Diagnostic Tools

The project includes several diagnostic scripts:

### 1. **test-email.js** - Test SMTP Configuration
```bash
# Basic test
node test-email.js recipient@example.com

# Test with specific .env file
node test-email.js recipient@example.com docker/staging/.env

# Shows detailed connection logs and identifies common issues
```

### 2. **check-env.js** - Verify Environment Variables
```bash
# Check current .env
node check-env.js

# Check specific environment file
node check-env.js docker/staging/.env

# Compare local vs remote (with --remote flag)
node check-env.js --remote
```

### 3. **deployment/sync-env.sh** - Sync .env with Server
```bash
# Interactive tool to compare and sync .env files
bash deployment/sync-env.sh staging

# Shows differences between local and server
# Offers options to upload/download/merge
```

## 🆘 Getting Help

If you're still having issues:

1. Run the diagnostic scripts above in order
2. Check Docker container variables: `docker exec <container> env | grep SMTP`
3. Verify network connectivity: `curl -v telnet://smtp.gmail.com:465`
4. Try with extended timeouts (5+ minutes)
5. Test with a different SMTP provider
6. Check if your ISP/hosting provider blocks SMTP ports

Remember: Email configuration can be tricky due to security measures. Be patient and methodical in your troubleshooting.
