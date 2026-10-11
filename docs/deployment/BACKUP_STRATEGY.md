# Backup Strategy: WAL Archiving + Point-in-Time Recovery (PITR)

## Resumen Ejecutivo

Sistema de backups enterprise-grade con:
- **Zero Downtime**: Backups sin interrumpir el servicio
- **100% Consistency**: Garantía de coherencia entre DB y archivos
- **Point-in-Time Recovery**: Restaurar a cualquier timestamp exacto
- **Off-site Storage**: Digital Ocean Spaces (S3-compatible)
- **Automatizado**: Cron jobs + WAL archiving continuo

## Arquitectura del Sistema

### 1. WAL Archiving (Continuo)

PostgreSQL escribe continuamente Write-Ahead Logs (WAL) que capturan TODOS los cambios en la base de datos.

```
PostgreSQL → archive_command → s3cmd → Digital Ocean Spaces
             (cada 5 min o 16MB)
```

**Ventajas**:
- Backup continuo sin impacto en performance
- Granularidad de segundos para recovery
- Base para Point-in-Time Recovery

**Configuración automática**:
```bash
wal_level = replica
archive_mode = on
archive_command = '/var/lib/postgresql/wal_archive/archive-wal.sh %f %p'
archive_timeout = 300  # 5 minutos
```

### 2. Base Backups (Semanal)

Snapshot completo de la base de datos usando `pg_basebackup`.

```
PostgreSQL → pg_basebackup → tar.gz → Digital Ocean Spaces
             (Domingos 1-2 AM)
```

**Ventajas**:
- Punto de partida para restauraciones
- Comprimido y eficiente
- No requiere downtime

**Retención**: 30 días (configurable con `BASE_BACKUP_RETENTION_DAYS`)

### 3. Incremental Files Backup (Diario)

Backup incremental de archivos usando `rsync` con hard links.

```
uploads/ → rsync --link-dest=<previous> → Digital Ocean Spaces
           (Diario 2-3 AM)
```

**Ventajas**:
- Solo copia archivos nuevos o modificados
- Hard links ahorran espacio (archivos sin cambios = 0 bytes)
- Rápido y eficiente

**Retención**: 7 días (configurable con `FILES_BACKUP_RETENTION_DAYS`)

## Timeline de Backups

```
Production:
  Domingo 1:00 AM   →  Base Backup (PostgreSQL completo)
  Diario 2:00 AM    →  Incremental Files Backup
  Continuo          →  WAL files cada 5 min o 16MB

Staging:
  Domingo 2:00 AM   →  Base Backup (PostgreSQL completo)
  Diario 3:00 AM    →  Incremental Files Backup
  Continuo          →  WAL files cada 5 min o 16MB
```

## Setup Inicial

### 1. Configurar Credenciales de Spaces

En `.env` del servidor (o `docker/${ENV}/.env` en desarrollo):

```bash
STORAGE_PROVIDER=spaces
SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
SPACES_REGION=nyc3
SPACES_BUCKET=agilmind.jupiter
SPACES_ENV_PREFIX=staging  # o 'production'
SPACES_ACCESS_KEY=<tu_access_key>
SPACES_SECRET_KEY=<tu_secret_key>
```

### 2. Instalar Dependencias del Host

```bash
# Instala Docker, s3cmd, rsync, gzip
./deployment/scripts/setup-server.sh
```

### 3. Setup WAL Archiving

```bash
# Desde el servidor
cd /home/deploy/jupiter-staging  # o jupiter para production

# Configura PostgreSQL y s3cmd
./deployment/scripts/setup-wal-archiving.sh staging
```

Esto configura automáticamente:
- PostgreSQL con `wal_level=replica` y `archive_mode=on`
- Instala s3cmd en el contenedor PostgreSQL
- Crea script de archivado automático
- Reinicia PostgreSQL para aplicar cambios

### 4. Crear Primer Base Backup

```bash
./deployment/scripts/base-backup.sh staging initial
```

### 5. Programar Backups Automáticos

```bash
./deployment/scripts/schedule-backups.sh staging install
```

## Uso Diario

### Listar Backups Disponibles

```bash
# Ver todos los backups
./deployment/scripts/list-backups.sh staging

# Ver solo base backups
./deployment/scripts/list-backups.sh staging base

# Ver solo files backups
./deployment/scripts/list-backups.sh staging files

# Ver archivos WAL
./deployment/scripts/list-backups.sh staging wal
```

### Backups Manuales

```bash
# Base backup manual
./deployment/scripts/base-backup.sh staging manual

# Files backup manual
./deployment/scripts/incremental-files-backup.sh staging manual
```

### Verificar Status de Cron Jobs

```bash
./deployment/scripts/schedule-backups.sh staging status
```

## Restauración (Point-in-Time Recovery)

### Escenario 1: Restaurar al Último Estado Disponible

```bash
# Listar backups disponibles
./deployment/scripts/list-backups.sh staging

# Restaurar usando el base backup más reciente
./deployment/scripts/restore-pitr.sh staging base_weekly_20251205_020000
```

Esto restaura:
1. Base backup especificado
2. Todos los WAL files hasta el último disponible
3. Files backup correspondiente al timestamp

### Escenario 2: Restaurar a Timestamp Específico

```bash
# Restaurar staging al 5 de Dic 2025 a las 10:30 AM
./deployment/scripts/restore-pitr.sh staging base_weekly_20251201_020000 '2025-12-05 10:30:00'
```

**Importante**: El timestamp debe ser:
- **Posterior** al base backup especificado
- **Anterior** al último WAL file disponible
- Formato: `YYYY-MM-DD HH:MM:SS`

### Proceso de Restauración

1. **Verificación**: Script verifica que backup existe en Spaces
2. **Confirmación**: Solicita escribir 'RESTORE' para continuar
3. **Detención**: Para servidor y base de datos
4. **Limpieza**: Elimina datos actuales de PostgreSQL y uploads/
5. **Descarga**: Trae base backup desde Spaces
6. **Restore Base**: Restaura snapshot PostgreSQL
7. **WAL Replay**: PostgreSQL descarga y aplica WAL files hasta timestamp
8. **Files Restore**: Descarga archivos desde Spaces
9. **Reinicio**: Inicia servidor y verifica health

**Tiempo estimado**: 5-20 minutos (depende del tamaño de datos)

## Estructura de Archivos

### En el Servidor

```
/home/deploy/jupiter-staging/
├── .env                          # Credenciales de Spaces
├── wal-archive/
│   ├── archive-wal.sh            # Script de archivado (generado)
│   └── .s3cfg                    # Config s3cmd (generado)
├── backups/
│   └── staging/
│       └── db/
│           └── base/             # Base backups locales
├── logs/
│   └── backups/
│       ├── base-backup.log       # Logs de base backups
│       └── files-backup.log      # Logs de files backups
└── deployment/
    └── scripts/
        ├── setup-wal-archiving.sh
        ├── base-backup.sh
        ├── incremental-files-backup.sh
        ├── schedule-backups.sh
        ├── list-backups.sh
        ├── restore-pitr.sh
        └── lib/
            └── common.sh         # Funciones compartidas
```

### En Digital Ocean Spaces

```
s3://agilmind.jupiter/
├── staging/
│   ├── wal/                      # WAL files continuos
│   │   ├── 000000010000000000000001
│   │   └── ...
│   └── backups/
│       ├── db/
│       │   └── base/
│       │       ├── base_weekly_20251201_020000/
│       │       └── base_initial_20251205_200939/
│       └── files/
│           └── files_daily_20251205_030000/
└── production/
    └── ... (misma estructura)
```

## Monitoreo y Mantenimiento

### Logs de Backups

```bash
# Ver logs de base backups
tail -f logs/backups/base-backup.log

# Ver logs de files backups
tail -f logs/backups/files-backup.log
```

### Espacio en Spaces

```bash
# Verificar uso de espacio
s3cmd -c wal-archive/.s3cfg du s3://agilmind.jupiter/staging/
```

### Retención Automática

Los scripts incluyen limpieza automática según retención configurada:
- Base backups: 30 días (configurable: `BASE_BACKUP_RETENTION_DAYS`)
- Files backups: 7 días (configurable: `FILES_BACKUP_RETENTION_DAYS`)
- WAL files: Se limpian al eliminar base backup asociado

## Troubleshooting

### WAL Archiving No Funciona

**Síntoma**: No aparecen archivos WAL en Spaces

**Diagnóstico**:
```bash
# Ver logs de PostgreSQL
docker compose logs postgres | grep archive

# Verificar configuración
docker compose exec postgres psql -U postgres -c "SHOW archive_mode;"
docker compose exec postgres psql -U postgres -c "SHOW archive_command;"
docker compose exec postgres psql -U postgres -c "SHOW wal_level;"
```

**Soluciones**:
1. Verificar s3cmd config: `cat wal-archive/.s3cfg`
2. Probar s3cmd manualmente dentro del container
3. Re-ejecutar setup: `./deployment/scripts/setup-wal-archiving.sh staging`

### Base Backup Falla

**Síntoma**: Error al crear base backup

**Diagnóstico**:
```bash
# Verificar que PostgreSQL responde
docker compose exec postgres pg_isready -U postgres

# Verificar espacio en disco
df -h
```

**Soluciones**:
1. Limpiar espacio en disco si necesario
2. Verificar permisos en directorio backups/
3. Verificar conectividad a Spaces

### Restore Falla por WAL Files Faltantes

**Síntoma**: Error durante WAL replay

**Solución**:
1. Usar base backup más reciente
2. Verificar que WAL files existen: `./deployment/scripts/list-backups.sh staging wal`
3. Si faltan WAL files, elegir timestamp anterior al gap

## Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `setup-wal-archiving.sh` | Configura PostgreSQL y s3cmd para WAL archiving |
| `base-backup.sh` | Crea backup base con pg_basebackup |
| `incremental-files-backup.sh` | Backup incremental de uploads/ |
| `schedule-backups.sh` | Instala/desinstala cron jobs |
| `list-backups.sh` | Lista backups disponibles en Spaces |
| `restore-pitr.sh` | Restaura a punto específico en el tiempo |
| `setup-server.sh` | Instala dependencias del host |

## Referencias

- [PostgreSQL WAL Archiving](https://www.postgresql.org/docs/current/continuous-archiving.html)
- [Point-in-Time Recovery](https://www.postgresql.org/docs/current/continuous-archiving.html#BACKUP-PITR-RECOVERY)
- [Digital Ocean Spaces](https://docs.digitalocean.com/products/spaces/)
- [pg_basebackup](https://www.postgresql.org/docs/current/app-pgbasebackup.html)
