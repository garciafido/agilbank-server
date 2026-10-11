
# Pipeline Best Practices

## ⚠️ REGLAS CRÍTICAS

### 1. NUNCA usar Prisma directamente en stages

❌ **MAL - Bypasea seguridad y auditoría:**
```typescript
export async function myStage(
  context: MyApolloContext,
  prisma: PrismaClient, // NO USAR
  schemaMetaStore,
  ...params
) {
  // ❌ NUNCA hacer esto
  await prisma.entity.update({ ... });
}
```

✅ **BIEN - Usa servicios que manejan todo correctamente:**
```typescript
export async function myStage(
  context: MyApolloContext,
  _prisma: PrismaClient, // Prefijo _ indica que no se usa
  _schemaMetaStore,
  ...params
) {
  // ✅ Usar servicio del container
  const service = context.container.resolve(EntityUpdateService);
  await service.updateEntity({ ... });
}
```

### 2. Por qué NO usar Prisma directamente

Los servicios manejan automáticamente:
- **SecurePrismaOps**: Validación multi-tenant
- **Auditoría**: createdBy_, lastUpdatedBy_, version_
- **Permisos**: Validación de acceso
- **Transacciones**: Manejo correcto de rollback
- **Validaciones de negocio**: Reglas específicas

### 3. Usar utilidades para archivos

```typescript
import { createTempFileFromString, createTempFileFromBuffer } from '../../common/utils/fileHelpers';

// Para HTML, JSON, XML, texto, etc.
const file = createTempFileFromString(
  htmlContent,
  'document.html',
  'text/html'
);

// Para PDFs, imágenes, binarios, etc.
const file = createTempFileFromBuffer(
  pdfBuffer,
  'document.pdf',
  'application/pdf'
);
```

### 4. Obtener servicios de forma segura

```typescript
import { getEntityService } from '../../common/utils/serviceHelpers';

// Obtener servicio tipado
const editionService = getEntityService<EditionUpdateService>(
  context,
  'EditionUpdateService'
);
```

## Arquitectura de un Pipeline

### Estructura estándar
```
src/pipelines/
├── myPipeline/
│   ├── myPipelineService.ts      # Orquestador (generado)
│   ├── myPipelineResolver.ts     # GraphQL resolver (generado)
│   ├── myPipeline.graphql        # Schema (generado)
│   └── stages/
│       ├── index.ts               # Exports de stages
│       ├── validateData.ts       # Stage 1 - validación
│       ├── processData.ts        # Stage 2 - procesamiento
│       └── saveResults.ts        # Stage 3 - persistencia
└── utils/                         # DEPRECATED - usar common/utils
```

### Flujo de datos con transacción

1. **Workflow** llama al pipeline vía resolver
2. **Pipeline Service** envuelve TODO en `$transaction` para atomicidad
3. **Cada Stage** recibe `txPrisma` (cliente transaccional) como parámetro
4. **Stages** usan servicios del container o SecurePrismaOps con el cliente transaccional
5. **SecurePrismaOps** respeta multi-tenancy y permisos del usuario actual
6. **Solo usar `isSystemMode = true`** en casos MUY específicos donde se necesita bypasear tenant

## Template para nuevos stages

```typescript
import { MyApolloContext } from "../../../server";
import { PrismaClient } from "../../../prisma/generated-client/client";
import { SecurePrismaOps } from "../../../common/services/securePrismaOps";
import { SchemaMetadataStore } from "../../../common/services/schemaMetadata";
import { getEntityService } from "../../../common/utils/serviceHelpers";

export async function myStage(
  context: MyApolloContext,
  txPrisma: PrismaClient, // Cliente transaccional del pipeline
  schemaMetaStore: SchemaMetadataStore,
  // tus parámetros aquí
): Promise<{ /* tipo de retorno */ }> {
  
  // Opción A: Usar servicios del container (recomendado para la mayoría de casos)
  const service = getEntityService<YourService>(
    context,
    'YourServiceName'
  );
  
  // Opción B: Usar SecurePrismaOps con el cliente transaccional
  // (para casos especiales con campos .onlyOnServer)
  const db = new SecurePrismaOps(
    context, // Respeta tenant y permisos del usuario actual
    txPrisma,
    schemaMetaStore,
    "YourEntity",
    {}
  );
  
  // Tu lógica aquí
  const result = await service.yourMethod(...);
  
  return {
    // tus resultados
  };
}
```

## Patrones Comunes

### Crear y actualizar entidades con nested relations

```typescript
// Usar EditionUpdateService para manejar EditionDocumentation
const editionService = getEntityService<EditionUpdateService>(
  context,
  'EditionUpdateService'
);

await editionService.updateEdition({
  id: edition.id,
  version_: edition.version_,
  documentation: {
    deleteMany: true, // Borrar existentes
    create: documentsToCreate // Crear nuevos
  }
}, null);
```

### Manejo de archivos temporales

```typescript
import { createTempFileFromString } from '../../../common/utils/fileHelpers';

// Crear archivo temporal que será movido automáticamente
const htmlFile = createTempFileFromString(
  renderedHtml,
  `contrato-${contractNumber}.html`,
  'text/html'
);

// El servicio maneja moveUploadedFiles automáticamente
await service.create({
  draftDocument: htmlFile,
  // otros campos...
});
```

## Testing

Cada stage debe:
1. **Validar inputs** - Verificar parámetros requeridos
2. **Usar servicios mockeables** - Facilita testing unitario
3. **Retornar tipos consistentes** - Definir interfaces claras
4. **Manejar errores apropiadamente** - Try/catch con contexto

## Cuándo usar isSystemMode

**⚠️ IMPORTANTE**: `isSystemMode = true` bypasea validaciones de tenant y auditoría.
Solo usar en casos MUY específicos:

### ✅ Casos válidos para isSystemMode:
- Procesos de migración de datos entre tenants
- Tareas de mantenimiento del sistema
- Reportes consolidados multi-tenant (solo lectura)
- Inicialización de datos del sistema

### ❌ NO usar isSystemMode para:
- Operaciones normales del pipeline
- Crear/actualizar datos de usuario
- Cualquier operación que deba respetar multi-tenancy

### Ejemplo correcto (caso excepcional):
```typescript
// Solo si necesitas leer un reporte global del sistema
export async function getSystemReport(
  context: MyApolloContext,
  txPrisma: PrismaClient,
  schemaMetaStore: SchemaMetadataStore,
  reportId: string
) {
  // Temporalmente activar modo sistema SOLO para esta operación específica
  const originalMode = context.isSystemMode;
  context.isSystemMode = true;
  
  try {
    const service = context.container.resolve(ReportOneService);
    const report = await service.getOne({ id: reportId });
    return { reportInfo: report };
  } finally {
    // SIEMPRE restaurar el modo original
    context.isSystemMode = originalMode;
  }
}
```

## Anti-patterns a evitar

### ❌ Usar prisma directamente
```typescript
// MAL - bypasea toda la seguridad
await prisma.edition.update({ ... });
```

### ❌ Crear archivos sin utilidades
```typescript
// MAL - manejo manual propenso a errores
fs.writeFileSync('/tmp/file.txt', content);
```

### ❌ Lógica de negocio en stages
```typescript
// MAL - la lógica debe estar en servicios
if (edition.status === 'draft' && user.role === 'admin') {
  // validación de negocio aquí
}
```

### ❌ Manejo manual de transacciones
```typescript
// MAL - los servicios ya manejan transacciones
await prisma.$transaction(async (tx) => { ... });
```

### ❌ Hardcodear tenant o user IDs
```typescript
// MAL - usar context
const tenantId = 'hardcoded-tenant-id';
```

## Debugging

### Logs útiles
```typescript
console.log('[Pipeline] Stage starting:', {
  stage: 'myStage',
  params: { /* sanitized params */ },
  user: context.currentUser?.email
});
```

### Verificar contexto
```typescript
if (!context.currentUser) {
  throw new Error('User not authenticated');
}
if (!context.tenant) {
  throw new Error('Tenant not available');
}
```

## Stages con Worker: Mejores Prácticas de Job Queues

Cuando un stage tiene `.execution("worker")` en el haiku, se ejecuta de forma asíncrona en un proceso separado. Esto sigue las mejores prácticas de sistemas de colas como [Sidekiq](https://github.com/sidekiq/sidekiq/wiki/Best-Practices) y [BullMQ](https://github.com/taskforcesh/bullmq).

### Regla fundamental: Pasar IDs, no objetos

> "Don't save state to Sidekiq, save simple identifiers. Look up the objects once you actually need them in your perform method."
> — Sidekiq Best Practices

**En el haiku:**
```
// ❌ MAL - pasar objeto completo
convertAndReplace: task
  .execution("worker")
  .params(edition = getDocumentsToConvert.edition)  // Object Edition

// ✅ BIEN - pasar solo ID
convertAndReplace: task
  .execution("worker")
  .params(editionId = pipeline.editionId)  // String ID
```

**En el stage:**
```typescript
// ✅ BIEN - el stage recibe ID y hace su propia query
export async function convertAndReplace(
  context: StageContext,
  editionId: string,  // Recibe ID, no objeto
  workerEventId?: string
) {
  // El stage es responsable de obtener los datos que necesita
  const documents = await context.txPrisma.editionDocumentation.findMany({
    where: { Edition_documentation_id: editionId },
    select: { id: true, draftDocument: true, contractNumber: true }
  });

  // Procesar...
}
```

### Por qué pasar IDs

1. **Datos frescos**: El worker obtiene el estado actual cuando ejecuta
2. **Payloads pequeños**: IDs (strings) vs objetos JSON grandes
3. **Sin problemas de serialización**: Solo tipos primitivos JSON-serializables
4. **Idempotencia**: Jobs pueden re-ejecutarse con datos actualizados

### Consideraciones de consistencia

| Enfoque | Pros | Contras |
|---------|------|---------|
| Pasar ID | Datos frescos, payload pequeño | El objeto puede haber cambiado |
| Pasar objeto | Snapshot del momento de encolar | Datos pueden estar desactualizados |

**Decisión de diseño:** Para la mayoría de casos, usar IDs es preferible. Si necesitas un snapshot específico, considera guardarlo en la base de datos con un estado "pending" antes de encolar.

---

## Restricciones Técnicas para Workers

Cuando un pipeline tiene `execution: "worker"` en su definición, el código se **bundlea con esbuild** y ejecuta en un proceso separado. Esto impone restricciones importantes.

### ❌ NO HACER en código de worker:

1. **Importar de `server.ts`** - Arrastra Apollo Server y todas sus dependencias
   ```typescript
   // ❌ MAL
   import { MyApolloContext } from "../../server";

   // ✅ BIEN - usar import type
   import type { MyApolloContext } from "../../server";
   ```

2. **Importar de `pipelines/index.ts`** - Ejecuta `readFileSync` de GraphQL typeDefs
   ```typescript
   // ❌ MAL - index.ts tiene readFileSync que falla en bundle
   import { something } from '../../pipelines';

   // ✅ BIEN - usar registry.ts (sin side effects)
   import { pipelineServiceRegistry } from '../../pipelines/registry';
   ```

3. **Usar `require()` dinámico** - esbuild no puede resolverlo
   ```typescript
   // ❌ MAL
   const module = require('./dynamicPath');

   // ✅ BIEN - import estático
   import { module } from './staticPath';
   ```

4. **Usar DI container (`tsyringe`)** - No está disponible en worker
   ```typescript
   // ❌ MAL - container no existe en worker
   const service = container.resolve(MyService);

   // ✅ BIEN - instanciar manualmente
   const service = new MyService(prisma, schemaMetaStore);
   ```

5. **`readFileSync` en tiempo de importación** - Los archivos no existen en el bundle
   ```typescript
   // ❌ MAL - se ejecuta al importar el módulo
   export const typeDefs = readFileSync('schema.graphql');

   // ✅ BIEN - leer dentro de función (si es necesario)
   export function getTypeDefs() {
     return readFileSync('schema.graphql');
   }
   ```

### ✅ HACER en código de worker:

1. **Usar `import type`** para interfaces/tipos
2. **Importar de `pipelines/registry`** para obtener servicios de pipeline
3. **Usar `basePrisma` directamente** - Sin wrapper de DI
4. **Funciones puras** sin side effects al importar
5. **Crear instancias manualmente** - `new ServiceClass(prisma, schemaMetaStore)`

### Ejemplo correcto de stage para worker:

```typescript
// stages/convertAndReplace.ts
import type { StageContext } from '../pipeline/types';
import { basePrisma } from '../../../prisma/client';

export async function convertAndReplace(
  context: StageContext,
  editionId: string,
  workerEventId?: string
): Promise<{ convertedCount: number }> {
  // Usar context.txPrisma para transacciones (viene del service)
  const edition = await context.txPrisma.edition.findUnique({
    where: { id: editionId },
    include: { documentation: true }
  });

  if (!edition) {
    throw new Error(`Edition ${editionId} not found`);
  }

  // Procesar documentos...
  let convertedCount = 0;
  for (const doc of edition.documentation) {
    // Lógica de conversión
    convertedCount++;
  }

  return { convertedCount };
}
```

### Arquitectura Server vs Worker

```
Server (Apollo, GraphQL):
├── Importa: pipelines/index.ts (con typeDefs, resolvers)
├── Tiene: DI container (tsyringe)
└── Usa: context.container.resolve()

Worker (esbuild bundle):
├── Importa: pipelines/registry.ts (solo servicios)
├── NO tiene: DI container
└── Usa: new ServiceClass(prisma, schemaMetaStore)
```

## Referencias

- **Servicios disponibles**: Ver `src/core/dependencyContainer.ts`
- **Utilidades comunes**: Ver `src/common/utils/`
- **Ejemplos de pipelines**: Ver otros pipelines en `src/pipelines/`
- **Documentación de workflows**: Ver `docs/workflows/`
- **Registry de pipelines para worker**: Ver `src/pipelines/registry.ts`

---
*Última actualización: 2025-12-01*
*Versión: 1.2.0 - Agregada sección de mejores prácticas para workers (IDs vs objetos)*
