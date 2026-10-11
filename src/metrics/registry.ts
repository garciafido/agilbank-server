import client, { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Create a custom registry
export const register = new Registry();

// Add default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register });

// HTTP Request metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// GraphQL metrics
export const graphqlOperationsTotal = new Counter({
  name: 'graphql_operations_total',
  help: 'Total number of GraphQL operations',
  // tenant: dimensión de supervisión de uso por cliente (cardinalidad acotada:
  // decenas de tenants x cientos de operaciones). El usuario NO va en labels
  // (cardinalidad alta) — el detalle por usuario vive en el log de auditoría.
  labelNames: ['operation_type', 'operation_name', 'status', 'tenant'],
  registers: [register],
});

// Bytes de storage registrados por tenant y fuente (tabla.campo). Lo llena el
// colector de storage-usage.ts desde los metadatos de la base — agnóstico del
// backend de archivos (filesystem, Spaces, etc.).
export const tenantStorageBytes = new Gauge({
  name: 'tenant_storage_bytes',
  help: 'Bytes of stored files per tenant and source field (from DB metadata)',
  labelNames: ['tenant', 'source'],
  registers: [register],
});

export const graphqlOperationDuration = new Histogram({
  name: 'graphql_operation_duration_seconds',
  help: 'Duration of GraphQL operations in seconds',
  labelNames: ['operation_type', 'operation_name', 'tenant'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// Application-specific metrics
export const activeWebsocketConnections = new Gauge({
  name: 'app_websocket_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [register],
});

export const activeSseConnections = new Gauge({
  name: 'app_sse_connections_active',
  help: 'Number of active SSE connections',
  registers: [register],
});

export const backgroundJobsTotal = new Counter({
  name: 'app_background_jobs_total',
  help: 'Total number of background jobs processed',
  labelNames: ['queue', 'status'],
  registers: [register],
});

export const backgroundJobDuration = new Histogram({
  name: 'app_background_job_duration_seconds',
  help: 'Duration of background job processing in seconds',
  labelNames: ['queue'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

// Database metrics (can be populated from Prisma middleware)
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'model'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

export { client };
