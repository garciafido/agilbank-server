#!/usr/bin/env bash
set -euo pipefail

# Generate gRPC TLS certificates for Satellite if they don't exist.
# Idempotent — safe to run on every deploy.

CERT_DIR="./certs"

if [[ -f "${CERT_DIR}/ca.crt" && -f "${CERT_DIR}/server.crt" && -f "${CERT_DIR}/server.key" ]]; then
    echo "Certificates already exist, skipping generation."
    exit 0
fi

echo "Generating gRPC TLS certificates..."
mkdir -p "${CERT_DIR}"

# CA
openssl genrsa -out "${CERT_DIR}/ca.key" 4096 2>/dev/null
openssl req -new -x509 -key "${CERT_DIR}/ca.key" -out "${CERT_DIR}/ca.crt" \
    -days 3650 -subj '/CN=Satellite CA' 2>/dev/null

# Server cert signed by CA
openssl genrsa -out "${CERT_DIR}/server.key" 2048 2>/dev/null
openssl req -new -key "${CERT_DIR}/server.key" -out "${CERT_DIR}/server.csr" \
    -subj '/CN=satellite-grpc' 2>/dev/null
openssl x509 -req -in "${CERT_DIR}/server.csr" \
    -CA "${CERT_DIR}/ca.crt" -CAkey "${CERT_DIR}/ca.key" -CAcreateserial \
    -out "${CERT_DIR}/server.crt" -days 3650 2>/dev/null

rm -f "${CERT_DIR}/server.csr" "${CERT_DIR}/ca.srl"
echo "Certificates generated in ${CERT_DIR}"
