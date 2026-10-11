// Prometheus metrics for the application
// Usage:
// 1. Import httpMetricsMiddleware and add to Express app
// 2. Import createGraphQLMetricsPlugin and add to Apollo Server
// 3. Add /metrics endpoint using register.metrics()

export { register } from './registry';
export {
  httpRequestsTotal,
  httpRequestDuration,
  graphqlOperationsTotal,
  graphqlOperationDuration,
  activeWebsocketConnections,
  activeSseConnections,
  backgroundJobsTotal,
  backgroundJobDuration,
  dbQueryDuration,
  tenantStorageBytes,
  client,
} from './registry';

export { httpMetricsMiddleware } from './http-metrics';
export { createGraphQLMetricsPlugin } from './graphql-metrics';
export { startStorageUsageCollector, collectStorageUsageByTenant } from './storage-usage';
