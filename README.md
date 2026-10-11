# Agilbank Server

## Stack Tecnológico

- **Runtime**: Node.js con TypeScript
- **Framework**: Apollo Server (GraphQL)
- **ORM**: Prisma
- **Base de Datos**: PostgreSQL con PGMQ para colas
- **Cache**: Redis
- **Workers**: Background jobs con PGMQ
- **Contenedores**: Docker y Docker Compose
- **Proxy/SSL**: Traefik (producción)
- **Monitoreo**: Prometheus + Grafana (producción)

## 🚀 DESARROLLO

### Desarrollo Híbrido (⭐ RECOMENDADO)
PostgreSQL/Redis en Docker + Node.js local = Hot reload instantáneo

#### Primera vez:
```bash
git clone [tu-repo]
npm install
npm run dev:hybrid:setup  # Levanta BD + crea migración inicial + seeds
npm run dev:hybrid:all    # Inicia servidor + workers con hot reload
```

#### Día a día:
```bash
npm run dev:hybrid:all   # 🎯 RECOMENDADO: BD + Servidor + Workers (todo completo)
npm run dev:hybrid       # BD + Servidor (sin workers)
npm run dev:all          # Servidor + Workers (si BD ya está corriendo)
npm run dev              # Solo servidor (si BD ya está y no necesitas workers)
```

#### Después de cambios en schema.prisma:
```bash
npx prisma db push       # Desarrollo rápido
npx prisma migrate dev   # Cuando necesites archivo de migración
```

### Comandos de Desarrollo

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Solo servidor GraphQL |
| `npm run dev:all` | Servidor + Workers (sin BD) |
| `npm run dev:hybrid` | BD + Servidor (sin workers) |
| `npm run dev:hybrid:all` | 🎯 BD + Servidor + Workers (completo) |
| `npm run dev:setup` | Instalación inteligente (detecta híbrido) |
| `npm run build` | Compilar TypeScript |
| `npm test` | Ejecutar tests |
| `npm run lint:fix` | Corregir formato |
| `npx prisma studio` | GUI para BD |

### Comandos de Base de Datos

| Comando | Descripción | Cuándo usar |
|---------|-------------|-------------|
| `npm run db:fresh` | BD nueva con migración inicial | Reset total con confirmación |
| `npm run db:fresh:hybrid` | BD nueva (con Docker híbrido) | Reset para desarrollo híbrido |
| `npm run db:setup:auto` | Detecta y usa el comando correcto | Inicialización inteligente |
| `npm run db:reset` | Aplica migraciones existentes | Mantener historial |
| `npm run db:seed` | Ejecutar seeds | Cargar datos de prueba |
| `npm run db:status` | Ver estado de migraciones | Diagnóstico |
| `npx prisma migrate dev` | Crear nueva migración | Después de cambiar schema |

### Alternativas de Desarrollo

**Docker Completo**: Todo en contenedores (sin hot reload rápido)
```bash
npm run docker:dev:setup  # Primera vez (crea migraciones)
npm run docker:dev        # Desarrollo
```

**Local Completo**: Requiere PostgreSQL y Redis instalados
```bash
npm run dev:setup  # Primera vez (detecta automáticamente el entorno)
npm run dev        # Desarrollo
```

### Troubleshooting Desarrollo

| Problema | Solución |
|----------|----------|
| Puerto 5432 ocupado | `lsof -i :5432` y mata el proceso |
| "Cannot connect to database" | `npm run dev:hybrid:setup` o `npm run db:setup:auto` |
| Migrations out of sync | `npx prisma migrate reset` |
| Docker sin espacio | `docker system prune -a` |
| Hot reload no funciona | Usa `dev:hybrid` no `docker:dev` |

## 🚀 DEPLOY

### ⚠️ REGLAS ESTRICTAS DE DEPLOYMENT

**PROHIBIDO sin excepciones:**
- `npm run deploy:production` → **SOLO desde branch main**
- `npm run deploy:staging` → **SOLO desde branch develop**

**El sistema RECHAZARÁ intentos de deploy desde branches incorrectos.**

### Deployment Estándar

| Comando | Descripción | Branch OBLIGATORIO |
|---------|-------------|---------------------|
| `npm run deploy:staging` | Deploy a staging | **develop** |
| `npm run deploy:production` | Deploy a production | **main** |

### Testing desde branches feature/test

Para deployar desde branches de desarrollo (test/*, feature/*):

```bash
# Desde branch test/mi-feature
npm run deploy:staging:branch    # Deploy a staging con override
npm run deploy:production:branch # Deploy a production con override (⚠️ PELIGROSO)
```

**Tip:** Los branches `test/*` son ideales para testing local sin push a origin.

**Nota para colaboradores**: Los branches `test/*` son el ÚNICO lugar donde herramientas automatizadas (como Claude) pueden hacer cambios. Nunca permitas modificaciones directas a `develop` o `main`.

### Comandos de Gestión

| Comando | Descripción |
|---------|-------------|
| `npm run rollback:staging` | Rollback interactivo |
| `npm run logs:staging` | Ver logs en tiempo real |
| `npm run health` | Verificar salud del sistema |

### Backup y Restore

| Comando | Descripción |
|---------|-------------|
| `npm run backup:staging` | Backup completo de staging (BD + archivos) |
| `npm run backup:production` | Backup completo de production (BD + archivos) |
| `npm run restore` | Restaurar backup interactivo |
| `npm run staging-to-local` | Sincronizar BD de staging a local |

**Ejemplo de backup:**
```bash
# Crear backup de staging
npm run backup:staging

# Crear backup de production
npm run backup:production
```

**Ejemplo de restore:**
```bash
# Restaurar último backup
npm run restore staging latest

# Restaurar backup específico
npm run restore production 20240115-143022
```

**Sincronizar staging a local (desarrollo):**
```bash
npm run staging-to-local  # Descarga y restaura BD de staging localmente
```

### Primera Instalación

```bash
# Staging
npm run init:staging      # Crea BD + migración inicial + seeds

# Production
npm run init:production   # Crea BD + migración inicial + seeds mínimos
```

**Nota**: El comando `init` detecta automáticamente si no hay migraciones y crea una migración inicial desde el schema actual.

### Reinicialización Completa (⚠️ BORRA TODO)

| Comando | Descripción | Qué hace |
|---------|-------------|----------|
| `npm run cleanup:staging` | Limpia staging | Borra contenedores, volúmenes, datos |
| `npm run cleanup:production` | **🚨 PELIGRO** Limpia prod | Borra TODO en producción |
| `npm run cleanup:init:staging` | Reinicia staging | Cleanup + init (desde cero) |
| `npm run cleanup:init:production` | **🚨 PELIGRO** Reinicia prod | Borra TODO y recrea |

**Flujo de reinicialización:**
1. `cleanup` → Borra contenedores, volúmenes, datos
2. `init` → Crea BD nueva, aplica migración inicial, ejecuta seeds

### Git Flow y Deployment

**Flujo correcto:**
1. Desarrollo en `feature/*` o `test/*`
2. Merge a `develop` → Deploy automático a staging
3. Merge a `main` → Deploy manual a production

| Flujo | Comando | Deployment |
|-------|---------|------------|
| **feature/* → develop** | PR en GitHub | → staging |
| **develop → main** | `git merge develop` | → production |
| **test/* → develop** | PR en GitHub | → staging |

**⚠️ NUNCA:**
- Deploy production desde develop
- Deploy staging desde main
- Rebase entre develop y main


## 🔧 MANEJO DE SERVIDORES

### Health Checks

| Endpoint | Propósito | Uso |
|----------|-----------|-----|
| `/health/live` | Liveness - ¿Proceso vivo? | Docker reinicia si falla |
| `/health/ready` | Readiness - ¿Puede servir? | Load balancer verifica |
| `/health/startup` | Startup - ¿Inicializado? | Espera inicial |
| `/health` | Check completo | Compatibilidad |

### Base de Datos

| Comando | Descripción |
|---------|-------------|
| `npm run db:status` | Estado de migraciones |
| `npm run db:migrate:dev` | Crear nueva migración |
| `npm run db:deploy` | Aplicar migraciones en producción |
| `npm run db:seed` | Ejecutar seeds |
| `npm run db:fresh` | BD nueva con migración inicial (dev) |
| `npm run db:fresh:hybrid` | BD nueva en Docker híbrido |
| `npm run db:setup:auto` | Detecta entorno e inicializa |
| `npm run db:reset` | Aplicar migraciones existentes (dev) |

**Seeds por ambiente:**
- **Desarrollo/Staging**: Datos de prueba completos
- **Production**: Solo datos esenciales (roles, permisos)

### Monitoreo

```bash
npm run monitoring:enable   # Activar Grafana/Prometheus
npm run monitoring:disable  # Desactivar
npm run monitoring:status   # Ver estado
```

**Acceso**: https://grafana.${DOMAIN} (admin/${GRAFANA_PASSWORD})

### Logging

**Sistema**: Pino con Loki/Promtail

```bash
LOG_LEVEL=debug npm run dev   # Cambiar nivel
LOG_PRETTY=false npm run dev  # Sin formato
```

```typescript
// ✅ Usar logger estructurado
logger.info({ userId }, 'Action');
// ❌ Evitar console.log
```

### Servicios Docker

```bash
# Ver logs
npm run docker:dev:logs
docker compose logs -f server

# Acceder a contenedores
npm run docker:dev:exec   # Server
npm run docker:dev:db     # PostgreSQL
```

### Workers y Colas (PGMQ)

**Colas disponibles:**
- pipeline_jobs
- background_tasks
- email_notifications

```bash
npm run worker:dev    # Desarrollo
npm run pgmq:status   # Estado de colas
```

### Comandos de Limpieza

| Comando | Descripción | Impacto |
|---------|-------------|---------|
| `npm run docker:clean:agilbank:safe` | Analiza recursos Docker de Agilbank sin eliminar | Solo Agilbank |
| `npm run docker:clean:agilbank` | Limpia imágenes y contenedores de Agilbank | Solo Agilbank |
| `npm run docker:prune:local` | Limpia imágenes >24h | ⚠️ Todos los proyectos |
| `docker system prune -a` | Limpia todo Docker | ⚠️ Todos los proyectos |
| `npm run registry:prune:staging` | Limpia registry >30d | Solo registry |

## 📁 Estructura del Proyecto

```
├── docker/           # Configuraciones Docker
├── prisma/           # Schema y migraciones
├── src/
│   ├── entities/     # Entidades y resolvers
│   ├── workers/      # Workers asíncronos
│   └── server.ts     # Entrada principal
└── tests/            # Tests
```

## 📚 Documentación Adicional

- [Guía de Deployment](./docs/deployment/DEPLOYMENT_GUIDE.md)
- [Troubleshooting](./docs/TROUBLESHOOTING.md)
- [Workers y Colas](./docs/workers/WORKERS.md)
- [Monitoring](./docs/monitoring/MONITORING.md)

## ⚙️ Variables de Entorno

**Esenciales:**
- `NODE_ENV`: development | staging | production
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret para tokens
- `REDIS_URL`: Redis connection string

**Opcionales:**
- `LOG_LEVEL`: debug | info | warn | error
- `LOG_PRETTY`: true | false
- `WORKER_CONCURRENCY`: Default 5
- `WORKER_POLL_INTERVAL`: Polling de colas en ms. Default 1000; en desarrollo 5000 alcanza
- `GRAFANA_PASSWORD`: Para monitoring
