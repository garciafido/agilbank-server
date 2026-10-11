import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createContext, ServiceContext } from '../service-context';
import { Request as ExpressRequest } from '../types/express';
import { sseManager } from '../services/sse/SSEManager';

const router = Router();

router.get('/events', async (req, res) => {
  const token = req.query.token as string;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required: token missing' });
  }

  req.headers.authorization = `Bearer ${token}`;

  let context: ServiceContext | null = null;

  try {
    context = await createContext(req as ExpressRequest);
  } catch (contextError) {
    console.error('[SSE] Auth error:', contextError);
    return res.status(401).json({ error: 'Authentication required: invalid token' });
  }

  if (!context?.currentUser) {
    console.error('[SSE] Authentication failed: no user in context');
    return res.status(401).json({ error: 'Authentication required: no user' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const clientId = uuidv4();
  const userId = context.currentUser.id;
  const tenantId = context.currentUser.tenant_id_;
  const roles = context.currentUser.roles?.map(r => r.id) || [];

  sseManager.addClient({
    id: clientId,
    userId,
    tenantId,
    roles,
    res,
    lastHeartbeat: Date.now()
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);
  res.flush?.();

  // Load pending notifications for reconnecting users
  sseManager.loadUnreadNotifications(userId, tenantId).catch((err) => {
    console.error('[SSE] Error loading unread notifications:', err);
  });

  req.on('close', () => {
    sseManager.removeClient(clientId);
  });
});

export default router;
