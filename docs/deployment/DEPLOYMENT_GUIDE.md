# Deployment Guide

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         ARQUITECTURA DE DEPLOYMENT                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  LOCAL (tu máquina)                    SERVIDOR (staging/prod)                │
│  ──────────────────                    ───────────────────────                │
│                                                                               │
│  ┌────────────────┐   SSH tunnel      ┌─────────────────────────────────┐   │
│  │ docker build   │ ────────────────► │ localhost:5000 (Registry)       │   │
│  │ docker push    │   port 5000       │ Almacena imágenes Docker        │   │
│  └────────────────┘                   └───────────────┬─────────────────┘   │
│                                                       │ docker pull          │
│  4 IMÁGENES:                                          ▼                      │
│  ┌────────────────┐                   ┌─────────────────────────────────┐   │
│  │ agilbank-server │ ~300MB            │         Docker Compose          │   │
│  │ (sin Chromium) │                   │                                 │   │
│  ├────────────────┤                   │  ┌─────────────────────────┐    │   │
│  │ agilbank-worker │ ~500MB            │  │ server     :4000        │    │   │
│  │ (con Chromium) │                   │  │ health: /health         │    │   │
│  ├────────────────┤                   │  │ réplicas: 3 (prod)      │    │   │
│  │ agilbank-client │ ~60MB             │  │ vol: /uploads, /backups │    │   │
│  │ (nginx+react)  │                   │  └─────────────────────────┘    │   │
│  ├────────────────┤                   │  ┌─────────────────────────┐    │   │
│  │ agilbank-landing│ ~50MB             │  │ worker     :4001        │    │   │
│  │ (nginx+static) │                   │  │ health: /health         │    │   │
│  └────────────────┘                   │  │ réplicas: 2 (prod)      │    │   │
│                                       │  │ Chromium para PDFs      │    │   │
│                                       │  └─────────────────────────┘    │   │
│                                       │  ┌─────────────────────────┐    │   │
│                                       │  │ client     :80          │    │   │
│                                       │  │ réplicas: 2 (prod)      │    │   │
│                                       │  └─────────────────────────┘    │   │
│                                       │  ┌─────────────────────────┐    │   │
│                                       │  │ landing    :80          │    │   │
│                                       │  └─────────────────────────┘    │   │
│                                       │  ┌─────────────────────────┐    │   │
│                                       │  │ postgres   :5432        │    │   │
│                                       │  │ PGMQ + WAL archiving    │    │   │
│                                       │  └─────────────────────────┘    │   │
│                                       │  ┌─────────────────────────┐    │   │
│                                       │  │ redis      :6379        │    │   │
│                                       │  └─────────────────────────┘    │   │
│                                       │  ┌─────────────────────────┐    │   │
│                                       │  │ pgbouncer  :6432 (prod) │    │   │
│                                       │  └─────────────────────────┘    │   │
│                                       └───────────────┬─────────────────┘   │
│                                                       │                      │
│                                       ┌───────────────▼─────────────────┐   │
│  HTTPS ◄──────────────────────────────│ traefik (reverse proxy)         │   │
│  api.agilbank.ar  → server               │ Let's Encrypt SSL               │   │
│  app.agilbank.ar  → client               │ Sticky sessions (prod)          │   │
│  agilbank.ar      → landing              │ SSE support                     │   │
│                                       └─────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Servicios y Health Checks

| Servicio | Puerto | Health Check | Réplicas (prod) |
|----------|--------|--------------|-----------------|
| server | 4000 | GET /health | 3 |
| worker | 4001 | GET /health | 2 |
| client | 80 | GET /health | 2 |
| landing | 80 | GET / | 1 |
| postgres | 5432 | pg_isready | 1 |
| redis | 6379 | redis-cli ping | 1 |
| pgbouncer | 6432 | - | 1 (solo prod) |

---

## Quick Reference

### Deploy

| Acción | STAGING | PRODUCTION |
|--------|---------|------------|
| **Stack completo** | `npm run deploy:stack:staging` | `npm run deploy:stack:production` |
| **Solo backend** | `npm run deploy:backend:staging` | `npm run deploy:backend:production` |
| **Solo client** | `npm run deploy:client:staging` | `npm run deploy:client:production` |
| **Solo landing** | `npm run deploy:landing:staging` | `npm run deploy:landing:production` |
| **Smart deploy** | `npm run deploy:smart:staging` | `npm run deploy:smart:production` |

### Operaciones

| Acción | STAGING | PRODUCTION |
|--------|---------|------------|
| **Init (primera vez)** | `npm run init:staging` | `npm run init:production` |
| **Logs** | `npm run logs:staging` | `npm run logs:production` |
| **Health check** | `npm run health:staging` | `npm run health:production` |
| **Rollback** | `npm run rollback:staging` | `npm run rollback:production` |
| **Terminal SSH** | `npm run docker:staging:exec` | `npm run docker:production:exec` |
| **Migraciones** | `npm run migrate:staging` | `npm run migrate:production` |
| **Reset total** | `npm run cleanup:init:staging` | `npm run cleanup:init:production` |

---

## Conceptos Fundamentales

### Ambientes
- **STAGING**: `stage.agilbank.ar` - Pruebas y QA
- **PRODUCTION**: `agilbank.ar` - Usuarios finales

### Branches y Destino

| Branch | Despliega a | Restricción |
|--------|-------------|-------------|
| **develop** | STAGING | Obligatorio |
| **main** | PRODUCTION | Obligatorio |
| **test/*** | Cualquiera | Sin restricciones (usar `:branch`) |

**REGLA DE ORO**:
- Siempre merge develop → main para producción
- Nunca rebase develop sobre main

---

## Flujo de Trabajo

### Deploy a Staging
```bash
git checkout develop
git pull origin develop
npm run deploy:stack:staging
```

### Deploy a Production
```bash
git checkout main
git merge develop
git push origin main
npm run deploy:stack:production
```

### Testing (branches test/*)
```bash
git checkout -b test/mi-feature
npm run deploy:stack:staging:branch    # Override de branch
```

---

## Docker Registry

### Imágenes

El sistema usa 4 imágenes Docker separadas:

| Imagen | Contenido | Tamaño |
|--------|-----------|--------|
| `agilbank-server` | API GraphQL, sin Chromium | ~300MB |
| `agilbank-worker` | Jobs PGMQ, con Chromium/Playwright | ~500MB |
| `agilbank-client` | React SPA en nginx | ~60MB |
| `agilbank-landing` | Landing estática en nginx | ~50MB |

### Comandos Registry

| Acción | Comando |
|--------|---------|
| Listar imágenes locales | `npm run registry:list` |
| Listar remotas staging | `npm run registry:remote:staging` |
| Comparar local vs remoto | `npm run registry:compare:staging` |
| Espacio en disco | `npm run registry:disk` |
| Limpiar registry | `npm run registry:prune:staging` |

---

## Backup y Recovery

Los backups y restores de PostgreSQL no se gestionan desde este proyecto. Viven en el repo `infrastructure/postgres-service`, que corre como servicio independiente por host.

Scripts relevantes (`infrastructure/postgres-service/scripts/`):

| Script | Propósito |
|--------|-----------|
| `dump-db.sh <db> [label]` | `pg_dump -Fc` de una DB + upload a Spaces |
| `restore-db.sh <file> [target] [--data-only]` | Restore desde dump local o Spaces |
| `list-dumps.sh [db]` | Lista dumps locales y remotos |
| `backup.sh` | Base backup + WAL archiving |
| `schedule-backups.sh` | Instala cron jobs de backup |

Flujo típico prod → local:

```bash
# En el host de producción
./scripts/dump-db.sh agilbank manual

# En local (con postgres-service corriendo)
./scripts/list-dumps.sh agilbank
./scripts/restore-db.sh agilbank_manual_YYYYMMDD_HHMMSS.dump agilbank
```

---

## Setup Inicial

### Primera vez en un ambiente

1. **Configurar .env**
   ```bash
   cd docker/staging  # o docker/prod
   cp .env.example .env
   # Editar: DATABASE_URL, JWT_SECRET, SMTP_*, etc.
   ```

2. **Inicializar**
   ```bash
   npm run init:staging  # o init:production
   ```

3. **Verificar**
   ```bash
   npm run health:staging
   ```

El init configura: Docker Registry, directorios, BD, seeds, y primer deploy.

---

## Rollback

```bash
# Menú interactivo
npm run rollback:staging

# Versión específica
npm run rollback:staging -- --tag staging-20240103-120000
```

Rollback toma <10 segundos.

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| "Another deployment in progress" | `rm .deploy.lock` |
| "Cannot connect to registry" | `npm run registry:setup-docker` |
| "No space left" | `npm run docker:prune:staging` |
| "Health check failed" | `npm run rollback:staging` |
| Build lento | `npm run deploy:stack:staging -- --clean-cache` |

---

## Casos Especiales

### Seeds manuales en producción
Conviene ensayar primero con `SEED_DRY_RUN=true`, que lista los módulos que
correrían sin escribir nada.
```bash
ssh deploy@agilbank.ar 'cd /home/deploy/Agilbank && \
  docker compose exec server NODE_ENV=production \
  SEED_ONLY=customSeeds npm run db:seed'
```

### Migraciones de BD
Ver [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)

### Mantenimiento Docker
Ver [DOCKER_MAINTENANCE.md](./DOCKER_MAINTENANCE.md)

---

## DNS

| Ambiente | Registros |
|----------|-----------|
| STAGING | stage.agilbank.ar, api.stage.agilbank.ar, app.stage.agilbank.ar |
| PRODUCTION | agilbank.ar, api.agilbank.ar, app.agilbank.ar, www.agilbank.ar |

---

**Branch develop → STAGING | Branch main → PRODUCTION**
