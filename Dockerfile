# Multi-stage build optimized for layer caching
# Dependencies stage - cache package installations
FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
# Los módulos externos, antes de instalar: sus dependencias `file:` los necesitan en disco.
COPY modulos ./modulos
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Install production dependencies only with cache mount
RUN --mount=type=cache,target=/root/.npm     npm ci --omit=dev

# Dev dependencies stage - for building
FROM node:22-alpine AS dev-deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
# Los módulos externos, antes de instalar: sus dependencias `file:` los necesitan en disco.
COPY modulos ./modulos
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Install ALL dependencies with cache mount
RUN --mount=type=cache,target=/root/.npm     npm ci

# Prisma generation stage - cache prisma client
FROM dev-deps AS prisma
WORKDIR /app
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate
# Bundle generated client TS → single CJS file (needed by .prisma/client proxy at runtime)
RUN npx esbuild src/prisma/generated-client/client.ts --bundle --format=cjs --platform=node \
    --external:@prisma/client/runtime/client \
    --banner:js='var _importMetaUrl=require("url").pathToFileURL(__filename).href;' \
    --define:import.meta.url=_importMetaUrl \
    --outfile=src/prisma/generated-client/client.js

# GraphQL generation stage - cache generated types
FROM prisma AS graphql
WORKDIR /app
# Copy only what's needed for codegen
COPY codegen.yml ./
COPY src/common/schemas ./src/common/schemas
COPY src/entities ./src/entities
COPY src/pipelines ./src/pipelines
RUN npx graphql-codegen || echo "GraphQL codegen completed with warnings"

# Build stage - uses all previous caches
FROM graphql AS builder
WORKDIR /app
# Copy rest of application
COPY . .
# Build with esbuild (transpile-only): tsc cannot type-check the Prisma 7
# generated client (multi-MB model files) without exhausting the heap.
RUN npm run build:fast

# Verify build output
RUN test -d dist || (echo "Build failed: dist directory not created" && exit 1)

# Production stage - minimal final image
FROM node:22-alpine AS production
# openssl: firma CMS de los pedidos a ARCA. Alpine trae las librerías pero no
# siempre el binario, y sin él la firma falla en runtime con un ENOENT que
# manda a buscar el problema al código.
RUN apk add --no-cache python3 tini postgresql-client openssl

# Install Chromium and dependencies for Puppeteer
RUN apk add --no-cache     chromium     nss     freetype     harfbuzz     ca-certificates     ttf-freefont

# Configure Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Copy package files
COPY package*.json ./
# Los módulos externos, antes de instalar: sus dependencias `file:` los necesitan en disco.
COPY modulos ./modulos

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy prisma config and schema (needed for prisma migrate deploy at runtime)
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/prisma ./prisma

# Copy generated prisma client (required for runtime)
COPY --from=builder /app/src/prisma/generated-client ./src/prisma/generated-client

# Create .prisma/client proxy (Prisma 7 with custom output doesn't generate this)
RUN mkdir -p node_modules/.prisma/client && \
    echo 'module.exports = require("/app/src/prisma/generated-client/client");' > node_modules/.prisma/client/default.js

# Copy built application
COPY --from=builder /app/dist ./dist

# Create backup directories for email fallback
RUN mkdir -p /app/backup/seed /app/backup/emails && \
    chmod -R 777 /app/backup

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

EXPOSE 4000

CMD ["npm", "run", "start:dist"]
