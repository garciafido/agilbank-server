#!/bin/bash
set -euo pipefail

# Code Statistics Generator
# Runs the TypeScript code-stats.ts script
#
# Usage:
#   npm run stats
#   npm run stats -- --generator-path /path/to/haiku-generator
#
# Environment variables:
#   HAIKU_GENERATOR_PATH - Path to haiku-generator (default: ../haiku-generator)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Check if npx is available
if ! command -v npx &> /dev/null; then
  echo "Error: npx not found. Please install Node.js."
  exit 1
fi

# Parse arguments
GENERATOR_PATH="${HAIKU_GENERATOR_PATH:-}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --generator-path)
      GENERATOR_PATH="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# Export generator path if provided
if [[ -n "${GENERATOR_PATH}" ]]; then
  export HAIKU_GENERATOR_PATH="${GENERATOR_PATH}"
fi

# Run the TypeScript script (tsx handles tsconfig variations across server/client)
cd "${PROJECT_DIR}"
npx tsx "${SCRIPT_DIR}/code-stats.ts"
