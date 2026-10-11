import { Router } from 'express';
import { basePrisma } from '../prisma/client';
import { createContext, ServiceContext } from '../service-context';
import { Request as ExpressRequest } from '../types/express';
import { sseManager } from '../services/sse/SSEManager';

const router = Router();

router.get('/system-status', async (_req, res) => {
  try {
    if (!basePrisma) {
      console.error('[SystemStatus] basePrisma not initialized');
      return res.status(503).json({ error: 'Database not ready' });
    }

    const status = await basePrisma.systemStatus.findUnique({
      where: { id: 'system' }
    });

    res.json(status || {
      id: 'system',
      status: 'operational',
      message: null,
      scheduledAt: null,
      startedAt: null,
      estimatedEnd: null,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('[SystemStatus] Fetch error:', error);
    res.status(500).json({ error: 'Error fetching system status' });
  }
});

router.put('/system-status', async (req, res) => {
  if (!basePrisma) {
    console.error('[SystemStatus] basePrisma not initialized');
    return res.status(503).json({ error: 'Database not ready' });
  }

  let tempContext: ServiceContext | null = null;

  try {
    tempContext = await createContext(req as ExpressRequest);
  } catch (contextError) {
    console.error('[SystemStatus] Auth error:', contextError);
    return res.status(401).json({ error: 'Authentication error' });
  }

  if (!tempContext?.hasRole('SysAdmin')) {
    return res.status(403).json({ error: 'Forbidden: SysAdmin role required' });
  }

  try {
    const { status, message, scheduledAt, startedAt, estimatedEnd } = req.body;

    const updatedStatus = await basePrisma.systemStatus.upsert({
      where: { id: 'system' },
      update: {
        status,
        message,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        startedAt: startedAt ? new Date(startedAt) : null,
        estimatedEnd: estimatedEnd ? new Date(estimatedEnd) : null
      },
      create: {
        id: 'system',
        status,
        message,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        startedAt: startedAt ? new Date(startedAt) : null,
        estimatedEnd: estimatedEnd ? new Date(estimatedEnd) : null
      }
    });

    sseManager.publish({
      type: 'system.status',
      payload: {
        status: updatedStatus.status,
        message: updatedStatus.message,
        scheduledAt: updatedStatus.scheduledAt,
        startedAt: updatedStatus.startedAt,
        estimatedEnd: updatedStatus.estimatedEnd,
        updatedAt: updatedStatus.updatedAt
      }
    });

    res.json(updatedStatus);
  } catch (error) {
    console.error('[SystemStatus] Update error:', error);
    res.status(500).json({ error: 'Error updating system status' });
  }
});

export default router;
