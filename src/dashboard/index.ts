/**
 * Dashboard Module Index
 *
 * Exporta todos los componentes del sistema de dashboard.
 * Este módulo debe ser importado en server.ts para registrar las rutas.
 */

// Tipos
export * from './types';

// Registry de fetchers
export { fetcherRegistry } from './widgets/registry';

// Fetchers genéricos
export {
  createCountFetcher,
  createGroupByFetcher,
  GroupByResult,
} from './widgets/fetchers';

// Servicio principal
export { DashboardDataService } from './services/DashboardDataService';

// Rutas REST
export { default as dashboardRoutes } from './routes/dashboard.routes';
