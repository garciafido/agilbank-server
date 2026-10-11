# 🐳 Docker Maintenance Guide

## 📊 Quick Reference

| Problema | Comando | Descripción |
|----------|---------|-------------|
| **Poco espacio** | `npm run docker:prune:local` | Limpia imágenes >24h |
| **Build falla** | `npm run deploy -- --clean-cache` | Deploy con limpieza automática |
| **Registry lleno** | `npm run registry:prune:staging` | Limpia imágenes >30 días |
| **Reset total** | `npm run cleanup:staging` | ⚠️ BORRA TODO |

## 🧹 Políticas de Retención

| Ubicación | Retención | Limpieza Automática |
|-----------|-----------|---------------------|
| **Local** | 24 horas | Después de cada deploy exitoso |
| **Registry Staging** | 30 días | Manual mensual |
| **Registry Production** | 30 días | Manual mensual |

## 📋 Comandos de Mantenimiento

### Limpieza Segura
```bash
# Local
npm run docker:prune:local      # Imágenes >24h
npm run docker:prune:local:all  # Todo sin usar

# Registry
npm run registry:prune:staging     # Staging >30 días
npm run registry:prune:production  # Production >30 días
```

### Limpieza Peligrosa ⚠️
```bash
npm run cleanup:staging     # BORRA TODO en staging
npm run cleanup:production  # BORRA TODO en production
```

## 🔍 Troubleshooting

| Problema | Solución Rápida | Solución Nuclear |
|----------|-----------------|------------------|
| **No space left** | `npm run docker:prune:local:all` | `docker system prune -af --volumes` |
| **npm ci timeout** | `npm run deploy -- --clean-cache` | Aumentar recursos Docker Desktop |
| **Registry down** | `npm run registry:status` | Reiniciar registry en servidor |

## 📊 Monitoreo de Espacio

```bash
# Local
docker system df

# Server
ssh deploy@server 'df -h && docker system df'
```

## 🔄 Limpieza Automática

**Automático:**
- Deploy exitoso → limpia imágenes locales >24h
- Registry GC → ejecuta asincrónicamente

**Manual requerido:**
- Volúmenes Docker locales
- Contenedores detenidos  
- Redes sin usar
- Build cache

## 🎯 Mejores Prácticas

**Sí hacer:**
- ✅ Limpieza local semanal
- ✅ Monitorear espacio regularmente
- ✅ Usar `--clean-cache` si falla build

**NO hacer:**
- ❌ `cleanup:production` sin backup
- ❌ Borrar imágenes < 7 días
- ❌ Limpiar durante deployments
- ❌ Remover volúmenes con datos

## 🚨 Procedimientos de Emergencia

### Sin espacio (local)
```bash
docker stop $(docker ps -q)
docker system prune -af --volumes
# Reiniciar Docker Desktop
```

### Sin espacio (servidor)
```bash
npm run registry:prune:production
ssh deploy@server 'docker system prune -f'
```

---

**📦 Ver DEPLOYMENT_GUIDE.md para comandos completos de deployment**
