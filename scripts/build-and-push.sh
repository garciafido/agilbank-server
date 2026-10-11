#!/usr/bin/env bash
set -euo pipefail

# Build Docker images and push to remote registry via SSH tunnel.
# Called by deploy-toolkit preDeploy hook. Can also be run standalone.
# Usage: ./scripts/build-and-push.sh <ssh-target> [--skip-build] [--backend-only] [--client-only]

SSH_TARGET="${1:?Usage: $0 <ssh-target>}"
shift || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGE_TAG="${IMAGE_TAG:-latest}"

BACKEND_ONLY=false; CLIENT_ONLY=false; SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --backend-only) BACKEND_ONLY=true ;;
    --client-only)  CLIENT_ONLY=true ;;
    --skip-build)   SKIP_BUILD=true ;;
  esac
done

# ─── Disk cleanup ────────────────────────────────────────────────────────────
DOCKER_USED=$(docker system df --format '{{.Type}}	{{.Size}}	{{.Reclaimable}}' 2>/dev/null)
echo "Docker disk usage:"
echo "${DOCKER_USED}"
echo ""

# Limpieza automática ACOTADA antes del build (sin prompt): con BuildKit el
# cache de build es INDEPENDIENTE de las imágenes — borrar imágenes locales no
# enfría los builds. Por eso:
#  - imágenes no usadas por contenedores (image prune -af): ya están pusheadas
#    al registry y se re-crean del cache en segundos; cada deploy deja :latest
#    viejas y tags :<sha> que solo ocupan la VM.
#  - build cache POR PRESUPUESTO: conserva los GB más recientes (builds
#    calientes) y poda el excedente histórico. Presupuesto configurable vía
#    DEPLOY_BUILD_CACHE_BUDGET_GB (default 18). --max-used-space es el flag
#    actual; --keep-storage el fallback para engines viejos.
# NO usamos `docker system prune`: ese borra CONTENEDORES PARADOS (p.ej. tu
# stack de dev detenido) y redes. Volúmenes JAMÁS se tocan (DBs locales).
CACHE_BUDGET_GB="${DEPLOY_BUILD_CACHE_BUDGET_GB:-18}"
echo "Limpieza acotada de Docker (imágenes no usadas + cache >${CACHE_BUDGET_GB}GB; conserva cache reciente, volúmenes y contenedores)..."
docker image prune -af 2>/dev/null || true
docker builder prune -f --max-used-space "${CACHE_BUDGET_GB}GB" 2>/dev/null   || docker builder prune -f --keep-storage "${CACHE_BUDGET_GB}GB" 2>/dev/null || true
docker system df 2>/dev/null || true

# ─── Build ───────────────────────────────────────────────────────────────────
if [[ "${SKIP_BUILD}" = false ]]; then
    if [[ -n "${DEPLOY_SERVICE:-}" ]]; then
        echo "Building ${DEPLOY_SERVICE} only..."
        case "${DEPLOY_SERVICE}" in
            server)
                docker build -t agilbank-server:"${IMAGE_TAG}" -f "${PROJECT_ROOT}/Dockerfile.server" "${PROJECT_ROOT}" ;;
            worker)
                docker build -t agilbank-worker:"${IMAGE_TAG}" -f "${PROJECT_ROOT}/Dockerfile.worker" "${PROJECT_ROOT}" ;;
            client)
                CLIENT_DIR="${PROJECT_ROOT}/../agilbank-client"
                CLIENT_ENV="${CLIENT_DIR}/docker/production/.env.production"
                BUILD_ARGS=""
                if [[ -f "${CLIENT_ENV}" ]]; then
                    while IFS='=' read -r key value; do
                        [[ -z "$key" || "$key" =~ ^# ]] && continue
                        value=$(echo "$value" | sed 's/^["'\'']//;s/["'\'']$//')
                        BUILD_ARGS="${BUILD_ARGS} --build-arg ${key}=${value}"
                    done < "${CLIENT_ENV}"
                fi
                docker build -t agilbank-client:"${IMAGE_TAG}" \
                  ${BUILD_ARGS} \
                  -f "${CLIENT_DIR}/Dockerfile.production" \
                  "${CLIENT_DIR}" ;;
            *) echo "Unknown service: ${DEPLOY_SERVICE}"; exit 1 ;;
        esac
    else
        echo "Building Docker images..."
        if [[ "${CLIENT_ONLY}" = false ]]; then
            docker build -t agilbank-server:"${IMAGE_TAG}" -f "${PROJECT_ROOT}/Dockerfile.server" "${PROJECT_ROOT}"
            # Liberar entre builds: imágenes huérfanas (las :latest reemplazadas)
            # y cache excedente — evita ENOSPC en VMs de disco acotado.
            docker image prune -f >/dev/null 2>&1 || true
            docker builder prune -f --keep-storage 8GB >/dev/null 2>&1 || true
            docker build -t agilbank-worker:"${IMAGE_TAG}" -f "${PROJECT_ROOT}/Dockerfile.worker" "${PROJECT_ROOT}"
            docker image prune -f >/dev/null 2>&1 || true
            docker builder prune -f --keep-storage 8GB >/dev/null 2>&1 || true
        fi
        if [[ "${BACKEND_ONLY}" = false ]]; then
            CLIENT_DIR="${PROJECT_ROOT}/../agilbank-client"
            CLIENT_ENV="${CLIENT_DIR}/docker/production/.env.production"
            BUILD_ARGS=""
            if [[ -f "${CLIENT_ENV}" ]]; then
                while IFS='=' read -r key value; do
                    [[ -z "$key" || "$key" =~ ^# ]] && continue
                    value=$(echo "$value" | sed 's/^["'\'']//;s/["'\'']$//')
                    BUILD_ARGS="${BUILD_ARGS} --build-arg ${key}=${value}"
                done < "${CLIENT_ENV}"
            fi
            docker build -t agilbank-client:"${IMAGE_TAG}" \
              ${BUILD_ARGS} \
              -f "${CLIENT_DIR}/Dockerfile.production" \
              "${CLIENT_DIR}"
        fi
    fi
else
    echo "Skipping build (--skip-build)"
fi

# ─── SSH tunnel + push ───────────────────────────────────────────────────────
echo "Pushing images to registry via SSH tunnel..."
pkill -f "ssh.*-L 5000:localhost:5000.*${SSH_TARGET}" 2>/dev/null || true
sleep 1
ssh -f -N -L 5000:localhost:5000 "${SSH_TARGET}"
sleep 2

if ! curl -s http://localhost:5000/v2/ > /dev/null 2>&1; then
    echo "ERROR: Cannot reach registry via SSH tunnel" >&2
    exit 1
fi

PUSH_URL="host.docker.internal:5000"
[[ "$(uname)" = "Linux" ]] && PUSH_URL="localhost:5000"

GIT_SHA=$(cd "${PROJECT_ROOT}" && git rev-parse --short HEAD)

push_image() {
    local name="$1"
    # Push with git SHA tag (for rollback)
    docker tag "${name}:${IMAGE_TAG}" "${PUSH_URL}/${name}:${GIT_SHA}"
    docker push "${PUSH_URL}/${name}:${GIT_SHA}"
    # Push as latest (for docker compose pull)
    docker tag "${name}:${IMAGE_TAG}" "${PUSH_URL}/${name}:latest"
    docker push "${PUSH_URL}/${name}:latest"
}

if [[ -n "${DEPLOY_SERVICE:-}" ]]; then
    push_image "agilbank-${DEPLOY_SERVICE}"
else
    if [[ "${CLIENT_ONLY}" = false ]]; then
        push_image "agilbank-server"
        push_image "agilbank-worker"
    fi
    if [[ "${BACKEND_ONLY}" = false ]]; then
        push_image "agilbank-client"
    fi
fi

pkill -f "ssh.*-L 5000:localhost:5000.*${SSH_TARGET}" 2>/dev/null || true
echo "Images pushed successfully"
