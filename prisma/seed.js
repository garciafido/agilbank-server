// Prisma seed entry point
// This file tells Prisma where to find the actual compiled seed
// This resolves the deprecation warning about package.json#prisma configuration

// The actual seed is compiled from TypeScript to JavaScript
// Path is relative to /app/prisma/seed.js location
require('../dist/prisma/seed/seed.js');
