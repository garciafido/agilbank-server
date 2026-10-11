#!/bin/bash
# Build Docker images for server and worker in parallel
# Validates image sizes match targets

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${1}"
}

# Targets (realistic based on dependencies)
# Server: ~760MB (node_modules ~580MB + dist ~130MB + base ~50MB)
# Worker: ~1550MB (server + Chromium ~800MB)
SERVER_TARGET_MB=900
WORKER_TARGET_MB=1700

# Get commit hash for tagging
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TAG="${TIMESTAMP}-${COMMIT_HASH}"

log "${YELLOW}🐳 Building Docker images${NC}"
log "Tag: ${TAG}"
log ""

# Build server in background
log "${YELLOW}Building server image...${NC}"
(
    cd "$PROJECT_ROOT"
    docker build \
        -f Dockerfile.server \
        -t jupiter-server:${TAG} \
        -t jupiter-server:latest \
        . 2>&1 | sed 's/^/[SERVER] /'
) &
SERVER_PID=$!

# Build worker in background
log "${YELLOW}Building worker image...${NC}"
(
    cd "$PROJECT_ROOT"
    docker build \
        -f Dockerfile.worker \
        -t jupiter-worker:${TAG} \
        -t jupiter-worker:latest \
        . 2>&1 | sed 's/^/[WORKER] /'
) &
WORKER_PID=$!

# Wait for both builds
log ""
log "${YELLOW}Waiting for builds to complete...${NC}"

wait $SERVER_PID
SERVER_EXIT=$?

wait $WORKER_PID
WORKER_EXIT=$?

if [ $SERVER_EXIT -ne 0 ]; then
    log "${RED}✗ Server build failed${NC}"
    exit 1
fi

if [ $WORKER_EXIT -ne 0 ]; then
    log "${RED}✗ Worker build failed${NC}"
    exit 1
fi

log "${GREEN}✓ Both builds completed successfully${NC}"
log ""

# Validate image sizes
log "${YELLOW}Validating image sizes...${NC}"
log ""

# Get sizes in MB
SERVER_SIZE_BYTES=$(docker inspect jupiter-server:latest --format='{{.Size}}')
WORKER_SIZE_BYTES=$(docker inspect jupiter-worker:latest --format='{{.Size}}')

SERVER_SIZE_MB=$((SERVER_SIZE_BYTES / 1024 / 1024))
WORKER_SIZE_MB=$((WORKER_SIZE_BYTES / 1024 / 1024))

# Display results
printf "%-20s %-15s %-15s %-10s\n" "IMAGE" "SIZE" "TARGET" "STATUS"
printf "%s\n" "$(printf '─%.0s' {1..65})"

# Server
if [ $SERVER_SIZE_MB -le $SERVER_TARGET_MB ]; then
    SERVER_STATUS="${GREEN}✓ OK${NC}"
else
    SERVER_STATUS="${RED}✗ EXCEEDS${NC}"
fi
echo -e "$(printf "%-20s %-15s %-15s" "jupiter-server" "${SERVER_SIZE_MB}MB" "<${SERVER_TARGET_MB}MB") $SERVER_STATUS"

# Worker
if [ $WORKER_SIZE_MB -le $WORKER_TARGET_MB ]; then
    WORKER_STATUS="${GREEN}✓ OK${NC}"
else
    WORKER_STATUS="${RED}✗ EXCEEDS${NC}"
fi
echo -e "$(printf "%-20s %-15s %-15s" "jupiter-worker" "${WORKER_SIZE_MB}MB" "<${WORKER_TARGET_MB}MB") $WORKER_STATUS"

log ""

# Check if targets met
if [ $SERVER_SIZE_MB -gt $SERVER_TARGET_MB ] || [ $WORKER_SIZE_MB -gt $WORKER_TARGET_MB ]; then
    log "${RED}⚠️  Warning: One or more images exceed target size${NC}"
    log ""
    exit 1
fi

log "${GREEN}✅ All images built successfully and meet size targets${NC}"
log ""
log "Next steps:"
log "  - Test locally: docker-compose -f docker/dev/docker-compose.yml up"
log "  - Tag for registry: ./scripts/tag-images.sh ${TAG}"
log "  - Deploy: npm run deploy:stack:staging"
log ""
