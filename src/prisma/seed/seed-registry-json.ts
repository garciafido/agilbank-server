#!/usr/bin/env tsx
// Outputs SEED_REGISTRY as JSON for use by deployment scripts
// Usage: npx tsx src/prisma/seed/seed-registry-json.ts

import { SEED_REGISTRY } from "./seedManager";

console.log(JSON.stringify(SEED_REGISTRY));
