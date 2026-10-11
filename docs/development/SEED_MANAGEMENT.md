# 🌱 Seed Management Guide

## Overview

The Agilbank seed system provides a professional, flexible way to manage system data through code. Seeds can be run multiple times to update permissions, roles, and other system entities.

## 🎯 Philosophy

Seeds serve two purposes:
1. **Initial Setup**: Create base data for new installations
2. **System Updates**: Update permissions, roles, and system data through code (like Django/Rails migrations)

## 🚀 Quick Start

### Interactive CLI (Recommended)

```bash
npm run db:seed:cli
```

This opens an interactive menu where you can:
- Run all seeds
- Select specific modules
- Perform dry runs
- List available modules

### Command Line

```bash
# Run all seeds (smart mode - only updates what's needed)
npm run db:seed

# Update specific modules
npm run db:seed:permissions    # Update only permissions
npm run db:seed:roles          # Update only roles
npm run db:seed:users          # Update only users

# Advanced options
npm run db:seed:dry            # Dry run (lists what would run, writes nothing)
npm run db:seed:list           # List available modules
```

## 📦 Available Seed Modules

### System Seeds (Always Run)

| Module | Description | Dependencies |
|--------|-------------|--------------|
| `users` | System users (SYSTEM, SYSADMIN) | None |
| `permissions` | CRUD permissions for all entities | users |
| `roles` | System roles (Admin, User, etc.) | users, permissions |
| `customRoles` | Custom roles from config | users, permissions |

### Demo Seeds (Development/Staging Only)

Demo seeds are automatically skipped in production unless explicitly enabled.

### Custom Seeds

Add your own seed modules for project-specific data.

## 🔧 Environment Variables

Control seed behavior with environment variables:

These four are the ones `runSeedManager` reads. There are no others: a variable
that is not on this list has no effect, however plausible its name.

| Variable | Description | Example |
|----------|-------------|---------|
| `SEED_ONLY` | Run specific modules (comma-separated) | `SEED_ONLY=permissions,roles` |
| `SEED_DRY_RUN` | List what would run, write nothing | `SEED_DRY_RUN=true` |
| `SEED_LIST` | Print the module list and exit | `SEED_LIST=true` |
| `SEED_LIST_JSON` | Same list as JSON, for the deploy toolkit | `SEED_LIST_JSON=true` |

## 🏢 Multi-Tenancy Considerations

This project has **multi-tenancy enabled**. The seed system handles this automatically:

1. **Tenant Creation**: The system ensures the tenant exists before creating any other data
2. **System Owner**: The tenant ID is configured as `AGILMIND`
3. **Data Association**: All seeded data is automatically associated with the correct tenant

### Changing the System Owner

To use a different tenant ID:

```bash
SYSTEM_OWNER=MY_COMPANY npm run db:seed
```


## 📝 Common Use Cases

### 1. After Adding New Entity

When you add a new entity to the schema:

```bash
# Regenerate from Haiku
# Then update permissions for the new entity
npm run db:seed:permissions
```

### 2. Updating System Roles

After modifying role definitions:

```bash
npm run db:seed:roles
```

### 3. Fresh Development Setup

Reset all data for development. This is a database operation, not a seed mode:
`db:fresh` drops the migration history, recreates the schema and then seeds.

```bash
npm run db:fresh
```

### 4. Production Initial Setup

First deployment to production. Nothing extra is needed: a plain run seeds
system + custom, and the `demo` modules stay out unless asked for by name.

```bash
NODE_ENV=production npm run db:seed
```

### 5. Selective Update

Update only specific modules:

```bash
SEED_ONLY=permissions,roles npm run db:seed
```

## 🏗️ Creating Custom Seeds

### 1. Create a new seed file

```typescript
// src/prisma/seed/myCustomSeed.ts
import { PrismaClient } from '../generated-client/client';
import { upsertOne } from './utils';

export async function seedMyCustomData(prisma: PrismaClient) {
  const data = [
    { id: 'custom1', name: 'Custom Item 1' },
    { id: 'custom2', name: 'Custom Item 2' }
  ];
  
  for (const item of data) {
    await upsertOne(prisma, 'myEntity', item);
    console.log(`Upserted MyEntity: ${item.id}`);
  }
}
```

### 2. Register in SeedManager

Edit `src/prisma/seed/seedManager.ts`:

```typescript
this.register({
  name: 'myCustomData',
  description: 'My custom seed data',
  category: 'custom',
  dependencies: ['users'], // If depends on users existing
  seed: seedMyCustomData
});
```

### 3. Run your seed

```bash
npm run db:seed:only myCustomData
```

## 🔄 Idempotent Seeds

All seeds use `upsert` operations, making them idempotent:
- Safe to run multiple times
- Won't duplicate data
- Updates existing records
- Creates missing records

Example:

```typescript
await prisma.permission.upsert({
  where: { id: 'user_create' },
  update: { name: 'Create Users' },  // Updates if exists
  create: {                          // Creates if missing
    id: 'user_create',
    name: 'Create Users'
  }
});
```

## 🐳 Docker Usage

### Development

```bash
# Run seeds in Docker container
docker compose exec server npm run db:seed

# Interactive CLI in Docker
docker compose exec -it server npm run db:seed:cli
```

### Production

Seeds run automatically during deployment if database is empty. To run manually:

```bash
# SSH to server
ssh deploy@server

# Run seeds
cd /home/deploy/agilbank
docker compose exec server npm run db:seed
```

## ⚠️ Important Notes

### Production Safety

- Seeds upsert; no seed module deletes rows
- `SEED_DRY_RUN=true` lists what would run without writing, and is the way to
  rehearse a production run
- System seeds (users, permissions, roles) can be run anytime. `users` keeps
  `password` as create-only, so an existing user's credentials are never touched
- Nothing in this system resets data. That is `npm run db:fresh`, which is a
  database command and asks for confirmation

### Email Notifications

If SMTP is configured, the seed system will:
- Send welcome emails to new users with generated passwords
- Log sent emails for audit
- Fall back to file logging if email fails

Configure SMTP:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@example.com
```

### Performance

- Seeds run in transactions when possible
- Batch operations for better performance
- Progress indicators for long operations
- Detailed logging for debugging

## 🔍 Troubleshooting

### "Table does not exist" Error

```bash
# Ensure schema is up to date
npx prisma db push
# Then run seeds
npm run db:seed
```

### Seeds Not Running

Check which modules the manager sees, and what a run would do without writing:

```bash
npm run db:seed:list
npm run db:seed:dry
```

### Permission Denied

```bash
# Ensure correct environment
NODE_ENV=development npm run db:seed
```

### Duplicate Key Errors

This usually means a seed module wrote a row that a unique constraint already
covers, with different key fields than the upsert looks up. It is a bug in that
module, not something an environment variable works around.

## 📚 Best Practices

1. **Always use upsert** for idempotency
2. **Test seeds locally** before deploying
3. **Use dry run** to preview changes
4. **Version control seeds** like migrations
5. **Document custom seeds** for team members
6. **Use transactions** for related data
7. **Log operations** for audit trail
8. **Handle errors gracefully** with rollback

## 🎓 Advanced Topics

### Conditional Seeding

```typescript
if (process.env.ENABLE_FEATURE_X === 'true') {
  await seedFeatureXData(prisma);
}
```

### Parallel Seeding

```typescript
await Promise.all([
  seedIndependentData1(prisma),
  seedIndependentData2(prisma),
  seedIndependentData3(prisma)
]);
```

### Seed Validation

```typescript
const count = await prisma.permission.count();
if (count === 0) {
  throw new Error('Permissions seed failed - no records created');
}
```

---

For more information, see the seed files in `src/prisma/seed/`.
