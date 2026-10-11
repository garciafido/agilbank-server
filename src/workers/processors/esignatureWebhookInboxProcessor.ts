/**
 * Processor del inbox durable de webhooks de e-signature.
 *
 * Con ESIGNATURE_WEBHOOK_INBOX=queued el receiver verifica la firma inline,
 * encola el evento normalizado en `esignature_webhook_inbox` y responde 200.
 * Este processor lo consume en el worker con dedupe + reintentos + DLQ:
 *  - Dedupe por (provider, externalEventId) contra EsignatureWebhookEvent
 *    (reintentos y re-drives del productor entregan el mismo eventId lógico).
 *  - Los errores de procesamiento se relanzan como RecoverableBotError
 *    (recoverable=true) → retry clásico del worker (5 intentos con backoff)
 *    y después `esignature_webhook_inbox_dlq` + notifyDeadLetter.
 *
 * Requiere que el proyecto declare la entidad EsignatureWebhookEvent en su
 * haiku de sistema (mismo contrato que EsignatureDocument).
 */

import { basePrisma } from '../../prisma/client';
import type { Logger } from 'pino';
import { createHash } from 'crypto';
import {
  getESignatureEventHandler,
  ESignatureEventHandler,
} from '../../services/esignature/EsignatureEventHandler';
import { registerCompletionHandler } from '../../services/esignature/esignatureCompletionHandler';
import { applyProjectEsignatureCallbacks } from '../../services/esignature/callbackRegistry';
import { ESignatureEvent } from '../../services/esignature/types';
import { RecoverableBotError } from '../../bots/core/types';

interface ProcessorContext {
  prisma: typeof basePrisma;
  logger: Logger;
}

export interface EsignatureWebhookInboxPayload {
  provider: string;
  tenantId: string;
  // Serializado vía pgmq (JSON): timestamp llega como string.
  event: Omit<ESignatureEvent, 'timestamp'> & { timestamp: string | Date };
  receivedAt?: string;
  _retryAttempt?: number;
}

// Código de provider (URL/evento) → valor del enum Prisma EsignatureProvider.
const providerToPrismaEnum: Record<string, string> = {
  agilsign: 'agilSign',
  docusign: 'docuSign',
  pandadoc: 'pandaDoc',
  signnow: 'signNow',
};

// El worker es un proceso distinto del server: su singleton de eventHandler
// necesita las mismas registraciones (built-in + las del proyecto vía registry).
// Exportado para que otros consumidores del worker (p.ej. schedulers de
// reconciliación) reusen el MISMO handler configurado sin doble registro.
let handlerInstance: ESignatureEventHandler | null = null;
export function getConfiguredEventHandler(): ESignatureEventHandler {
  if (!handlerInstance) {
    handlerInstance = getESignatureEventHandler(basePrisma);
    registerCompletionHandler(handlerInstance, basePrisma);
    applyProjectEsignatureCallbacks(handlerInstance, basePrisma);
  }
  return handlerInstance;
}

export async function processEsignatureWebhookInbox(
  payload: EsignatureWebhookInboxPayload,
  context: ProcessorContext
): Promise<void> {
  const { prisma, logger } = context;
  const { provider, tenantId } = payload;

  // El delegate se resuelve una vez y por `any`, porque un proyecto que no
  // declaró EsignatureWebhookEvent (ver el encabezado) no lo tiene ni en el
  // cliente ni en los tipos. Sin la entidad no hay dónde deduplicar ni
  // persistir: se corta con un motivo que se pueda leer en el DLQ, en vez del
  // TypeError que este processor tiraba y que no dice qué falta.
  const inbox = (prisma as any).esignatureWebhookEvent;
  if (!inbox) {
    throw new Error(
      'EsignatureWebhookEvent no está declarada en este proyecto: el inbox durable de ' +
        'webhooks de firma no puede deduplicar ni persistir. Declarala en el haiku de ' +
        'sistema, o poné ESIGNATURE_WEBHOOK_INBOX=inline para procesar en el request.'
    );
  }

  const event: ESignatureEvent = {
    ...payload.event,
    timestamp: new Date(payload.event.timestamp),
  };

  // Fallback para providers cuyo normalizeWebhook no setea externalEventId:
  // hash del rawPayload (estable — las re-entregas mandan el body idéntico).
  const externalEventId =
    event.externalEventId ||
    createHash('sha256')
      .update(JSON.stringify(event.rawPayload ?? event))
      .digest('hex');

  const prismaProvider = (providerToPrismaEnum[provider] || provider) as any;
  const logContext = {
    provider,
    tenantId,
    eventType: event.type,
    documentId: event.documentId,
    externalEventId,
  };

  // Dedupe: el mismo evento lógico ya fue procesado (retry del productor,
  // re-drive, o re-entrega de pgmq por visibility timeout).
  const existing = await inbox.findFirst({
    where: {
      provider: prismaProvider,
      externalEventId,
      tenant_id_: tenantId,
      processedAt: { not: null },
    },
    select: { id: true },
  });
  if (existing) {
    logger.info(logContext, 'E-signature webhook event already processed — skipping (dedupe)');
    return;
  }

  const now = new Date();
  const auditFields = {
    version_: '0',
    createdAt_: now,
    createdBy_: { connect: { id: 'SYSADMIN' } },
    lastUpdatedAt_: now,
    lastUpdatedBy_: { connect: { id: 'SYSADMIN' } },
    tenant_: { connect: { id: tenantId } },
  };

  // Fila de auditoría/dedupe (una por evento lógico; reintentos la reutilizan).
  let inboxRow = await inbox.findFirst({
    where: { provider: prismaProvider, externalEventId, tenant_id_: tenantId },
    select: { id: true },
  });
  if (!inboxRow) {
    try {
      inboxRow = await inbox.create({
        data: {
          ...auditFields,
          provider: prismaProvider,
          externalEventId,
          eventType: event.type,
          documentExternalId: event.documentId,
          payload: (event.rawPayload ?? null) as any,
        },
        select: { id: true },
      });
    } catch (createError: any) {
      // Carrera: otro mensaje del MISMO evento lógico pasó el findFirst en
      // paralelo y ganó el unique (tenant, provider, externalEventId).
      // Reintentar más tarde converge: o el ganador terminó (dedupe-skip) o
      // reutilizamos su fila.
      if (createError?.code === 'P2002') {
        throw new RecoverableBotError(
          'Concurrent duplicate e-signature webhook event — retrying later',
          'esignature_webhook',
          true
        );
      }
      throw createError;
    }
  }

  try {
    await getConfiguredEventHandler().processNormalizedEvent(event, tenantId, {
      rethrowErrors: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await inbox
      .update({
        where: { id: inboxRow.id },
        data: { error: message.slice(0, 1000), lastUpdatedAt_: new Date() },
      })
      .catch(() => {});
    // recoverable=true → retry del worker (backoff) y DLQ al agotar intentos.
    throw new RecoverableBotError(
      `E-signature webhook processing failed: ${message}`,
      'esignature_webhook',
      true
    );
  }

  await inbox.update({
    where: { id: inboxRow.id },
    data: { processedAt: new Date(), error: null, lastUpdatedAt_: new Date() },
  });

  logger.info(logContext, 'E-signature webhook event processed from inbox');
}
