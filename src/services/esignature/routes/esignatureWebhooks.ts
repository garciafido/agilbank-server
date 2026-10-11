import { Router, Request, Response, json } from 'express';
import { basePrisma as prisma } from '../../../prisma/client';
import { pgmq } from '../../../utils/pgmq';
import { getESignatureEventHandler } from '../EsignatureEventHandler';
import { registerCompletionHandler } from '../esignatureCompletionHandler';
import { ESignatureError } from '../providers/types';
import { logger } from '../../../utils/logger';

const router = Router();

// Body parser — this router is mounted before the global json() middleware.
// `verify` captura los bytes originales: la firma HMAC se verifica sobre el
// body recibido, no sobre un re-stringify del JSON parseado.
router.use(
  json({
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
    },
  })
);

// Register completion handler (download + merge signed PDF on completion)
const eventHandler = getESignatureEventHandler(prisma);
registerCompletionHandler(eventHandler, prisma);

// Provider URL code → Prisma enum value
const providerToPrisma: Record<string, string> = {
  agilsign: 'agilSign',
  docusign: 'docuSign',
  pandadoc: 'pandaDoc',
  signnow: 'signNow',
};

function extractDocumentId(provider: string, payload: unknown): string | null {
  try {
    const data = payload as any;
    if (!data) return null;
    switch (provider) {
      case 'agilsign':
        return data.documentId ? String(data.documentId) : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function extractHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers[key.toLowerCase()] = value;
    } else if (Array.isArray(value)) {
      headers[key.toLowerCase()] = value[0];
    }
  }
  return headers;
}

async function processWebhook(
  provider: string,
  tenantId: string,
  req: Request,
  res: Response
): Promise<void> {
  const logContext = { provider, tenantId, path: req.path };
  // Inbox durable por DEFAULT: dedup + persistencia + retry/DLQ. El modo
  // inline (histórico: procesar en el request, errores tragados con 200 →
  // eventos perdidos) queda solo como opt-out explícito de emergencia.
  const queued = process.env.ESIGNATURE_WEBHOOK_INBOX !== 'inline';

  try {
    logger.debug(logContext, 'E-signature webhook received');

    const headers = extractHeaders(req);
    const rawBody = (req as Request & { rawBody?: string }).rawBody;

    if (queued) {
      const event = await eventHandler.verifyAndNormalize(
        provider,
        tenantId,
        req.body,
        headers,
        rawBody
      );

      if (event) {
        await pgmq.send('esignature_webhook_inbox', {
          provider,
          tenantId,
          event,
          receivedAt: new Date().toISOString(),
        });
        logger.info(
          { ...logContext, eventType: event.type, documentId: event.documentId },
          'E-signature webhook queued'
        );
      }

      res.sendStatus(200);
      return;
    }

    const event = await eventHandler.handleWebhook(
      provider,
      tenantId,
      req.body,
      headers,
      rawBody
    );

    if (event) {
      logger.info(
        { ...logContext, eventType: event.type, documentId: event.documentId },
        'E-signature webhook processed'
      );
    }

    res.sendStatus(200);
  } catch (error) {
    if (error instanceof ESignatureError && error.statusCode === 401) {
      logger.warn(
        { ...logContext, error: (error as Error).message },
        'E-signature webhook authentication failed'
      );
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    logger.error(
      { ...logContext, error },
      'E-signature webhook processing failed'
    );
    // Modo inbox: el evento NO quedó persistido → 500 para que el productor
    // reintente la entrega. Modo inline: 200 histórico.
    res.sendStatus(queued ? 500 : 200);
  }
}

/**
 * POST /api/webhooks/esignature/:provider
 * Tenant-less webhook — resolves tenantId from the document in DB.
 * Must be registered BEFORE /:provider/:tenantId so Express doesn't
 * treat the second segment as tenantId.
 */
router.post(
  '/:provider',
  async (req: Request, res: Response) => {
    const { provider } = req.params;

    const documentId = extractDocumentId(provider, req.body);
    if (!documentId) {
      logger.warn({ provider }, 'Webhook: could not extract documentId from payload');
      return res.sendStatus(200);
    }

    const prismaProvider = (providerToPrisma[provider] || provider) as any;
    const doc = await prisma.esignatureDocument.findFirst({
      where: { externalId: documentId, provider: prismaProvider },
      select: { tenant_id_: true },
    });
    if (!doc) {
      logger.warn({ provider, documentId }, 'Webhook: no document found for externalId');
      return res.sendStatus(200);
    }

    await processWebhook(provider, doc.tenant_id_, req, res);
  }
);

/**
 * POST /api/webhooks/esignature/:provider/:tenantId
 * Legacy route — tenantId in URL. Kept for backward compatibility.
 */
router.post(
  '/:provider/:tenantId',
  async (req: Request, res: Response) => {
    const { provider, tenantId } = req.params;
    await processWebhook(provider, tenantId, req, res);
  }
);

/**
 * GET /api/webhooks/esignature/:provider/verify
 * Handles provider verification challenges (tenant-less).
 */
router.get(
  '/:provider/verify',
  async (req: Request, res: Response) => {
    const { provider } = req.params;

    logger.info({ provider }, 'E-signature webhook verification request');

    if (req.query.challenge) {
      return res.send(req.query.challenge);
    }

    return res.sendStatus(200);
  }
);

/**
 * GET /api/webhooks/esignature/:provider/:tenantId/verify
 * Legacy verification route — kept for backward compatibility.
 */
router.get(
  '/:provider/:tenantId/verify',
  async (req: Request, res: Response) => {
    const { provider, tenantId } = req.params;

    logger.info(
      { provider, tenantId },
      'E-signature webhook verification request'
    );

    if (req.query.challenge) {
      return res.send(req.query.challenge);
    }

    return res.sendStatus(200);
  }
);

export default router;
