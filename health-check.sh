#!/usr/bin/env bash
# Health check for agilbank — outputs [PASS]/[FAIL]/[WARN]/[INFO] format

PASS=0; FAIL=0

check() {
  if eval "$2" &>/dev/null; then
    echo "[PASS] $1"; ((PASS++))
  else
    echo "[FAIL] $1"; ((FAIL++))
  fi
}

# Reintenta el comando hasta ~30s: el post-deploy puede correr apenas reiniciado
# el contenedor, antes de que el server escuche (su healthcheck Docker tiene
# start_period 30s). Sin esto, un boot en curso da un [FAIL] falso.
check_endpoint() {
  for _ in $(seq 1 10); do
    if eval "$2" &>/dev/null; then
      echo "[PASS] $1"; ((PASS++)); return
    fi
    sleep 3
  done
  echo "[FAIL] $1"; ((FAIL++))
}

echo "=== agilbank Health Check ==="
check "Server container running"  "docker compose -f docker-compose.prod.yml ps server --format '{{.State}}' | grep -q running"
check "Worker container running"  "docker compose -f docker-compose.prod.yml ps worker --format '{{.State}}' | grep -q running"
check "Client container running"  "docker compose -f docker-compose.prod.yml ps client --format '{{.State}}' | grep -q running"
check "Redis container running"   "docker compose -f docker-compose.prod.yml ps redis --format '{{.State}}' | grep -q running"
check_endpoint "Server /health endpoint"   "docker compose -f docker-compose.prod.yml exec -T server curl -sf http://localhost:4000/health"
# El worker escucha en WORKER_HEALTH_PORT (4001 por defecto). El puerto lo expande
# el sh del contenedor, con el entorno del worker: el shell de acá no lee el .env.
check_endpoint "Worker /health endpoint"   "docker compose -f docker-compose.prod.yml exec -T worker sh -c 'curl -sf http://localhost:\${WORKER_HEALTH_PORT:-4001}/health'"
check_endpoint "Client nginx responding"   "docker compose -f docker-compose.prod.yml exec -T client curl -sf http://localhost:80/ || docker compose -f docker-compose.prod.yml exec -T client wget -qO- http://localhost:80/"

ERRORS=$(docker compose -f docker-compose.prod.yml logs --since 1h 2>&1 | grep -ci error || true)
echo "[INFO] Errors in last hour: ${ERRORS}"
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[ "$FAIL" -eq 0 ]
