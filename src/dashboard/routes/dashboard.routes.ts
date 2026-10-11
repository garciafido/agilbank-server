/**
 * Dashboard REST Routes
 *
 * Rutas REST para el sistema de widgets del dashboard.
 * Usa inyección de dependencias y SecurePrismaOps para
 * garantizar seguridad en todos los accesos a datos.
 */

import { Router } from 'express';
import { container, DependencyContainer } from 'tsyringe';
import { createContext, ServiceContext } from '../../service-context';
import { Request as ExpressRequest } from '../../types/express';
import { DashboardDataService, isComputing } from '../services/DashboardDataService';
import { UnauthorizedError, NotFoundError } from '../../common/errors';

const router = Router();

/**
 * Helper para crear un child container con el contexto de la petición
 */
async function createRequestContainer(
  req: ExpressRequest
): Promise<{ context: ServiceContext; requestContainer: DependencyContainer }> {
  const context = await createContext(req);
  const requestContainer = container.createChildContainer();

  requestContainer.register<ServiceContext>('ServiceContext', {
    useValue: context,
  });

  requestContainer.register<DependencyContainer>('DependencyContainer', {
    useValue: requestContainer,
  });

  return { context, requestContainer };
}

/**
 * GET /api/dashboard/widgets
 *
 * Obtiene la lista de widgets disponibles para el usuario actual.
 * Incluye configuración por tenant y por usuario.
 */
router.get('/dashboard/widgets', async (req, res) => {
  try {
    const { context, requestContainer } = await createRequestContainer(
      req as ExpressRequest
    );

    if (!context.currentUser?.id) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const dashboardService = requestContainer.resolve(DashboardDataService);
    const widgets = await dashboardService.getAvailableWidgets();

    return res.json({ widgets });
  } catch (error) {
    console.error('[Dashboard] Error fetching widgets:', error);

    if (error instanceof UnauthorizedError) {
      return res.status(403).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Error obteniendo widgets' });
  }
});

/**
 * GET /api/dashboard/widgets/:widgetKey/data
 *
 * Obtiene los datos para un widget específico.
 * Ejecuta el fetcher asociado al widget con el contexto de seguridad.
 */
router.get('/dashboard/widgets/:widgetKey/data', async (req, res) => {
  try {
    const { context, requestContainer } = await createRequestContainer(
      req as ExpressRequest
    );

    if (!context.currentUser?.id) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { widgetKey } = req.params;
    const queryParams = req.query as Record<string, string>;

    const dashboardService = requestContainer.resolve(DashboardDataService);
    const data = await dashboardService.getWidgetData(widgetKey, queryParams);

    // El server es la única fuente de cache (Redis con invalidación por
    // evento). El browser no debe interponer su propio escalón, así
    // evitamos que muestre datos viejos después de un back/forward o un
    // doble-mount de StrictMode.
    res.set('Cache-Control', 'no-store');
    // 202: la computación sigue en background — el cliente muestra el
    // estado de espera y repregunta (el poll encuentra el cache listo).
    if (isComputing(data)) {
      return res.status(202).json(data);
    }
    return res.json(data);
  } catch (error) {
    console.error('[Dashboard] Error fetching widget data:', error);

    if (error instanceof UnauthorizedError) {
      return res.status(403).json({ error: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Error obteniendo datos del widget' });
  }
});

/**
 * POST /api/dashboard/widgets/data
 *
 * Datos de VARIOS widgets en un solo request (la carga del dashboard
 * pasa de N+1 requests a 2). Body: { requests: [{ widgetKey, queryParams? }] }.
 * Respuesta: { results: { [widgetKey]: WidgetData | {status:'computing'} | {error, code} } }.
 * Los errores por-widget viajan dentro de su entrada — un widget roto
 * u obsoleto no tumba la tanda ni gasta requests extra del cliente.
 */
router.post('/dashboard/widgets/data', async (req, res) => {
  try {
    const { context, requestContainer } = await createRequestContainer(
      req as ExpressRequest
    );

    if (!context.currentUser?.id) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const requests = (req.body?.requests ?? []) as Array<{
      widgetKey: string;
      queryParams?: Record<string, string>;
    }>;
    if (!Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({ error: 'requests vacío' });
    }
    if (requests.length > 50) {
      return res.status(400).json({ error: 'demasiados widgets por request' });
    }

    const dashboardService = requestContainer.resolve(DashboardDataService);
    const results = await dashboardService.getWidgetsData(requests);

    res.set('Cache-Control', 'no-store');
    return res.json({ results });
  } catch (error) {
    console.error('[Dashboard] Error fetching widgets batch:', error);
    return res.status(500).json({ error: 'Error obteniendo datos de widgets' });
  }
});

/**
 * PUT /api/dashboard/widgets/:widgetKey/config
 *
 * Actualiza la configuración de un widget para el usuario actual.
 * Incluye posición, habilitado/deshabilitado, y config overrides.
 */
router.put('/dashboard/widgets/:widgetKey/config', async (req, res) => {
  try {
    const { context, requestContainer } = await createRequestContainer(
      req as ExpressRequest
    );

    if (!context.currentUser?.id) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { widgetKey } = req.params;
    const { enabled, position, configOverride, displayOrder } = req.body;

    const dashboardService = requestContainer.resolve(DashboardDataService);
    await dashboardService.updateUserWidgetConfig(widgetKey, {
      enabled,
      position,
      configOverride,
      displayOrder,
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('[Dashboard] Error updating widget config:', error);

    if (error instanceof UnauthorizedError) {
      return res.status(403).json({ error: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.message });
    }

    return res
      .status(500)
      .json({ error: 'Error actualizando configuración del widget' });
  }
});

export default router;
