/**
 * Registro opt-in de callbacks de e-signature del PROYECTO (punto de extensión).
 *
 * El singleton ESignatureEventHandler vive por-proceso: en el server los
 * callbacks se registran al montar las rutas de webhooks, pero el WORKER
 * (que procesa el inbox durable `esignature_webhook_inbox`) necesita las
 * mismas registraciones. El proyecto pushea registrars acá desde un módulo
 * propio cargado al boot vía import side-effect (mismo patrón que
 * `schedulers/registry.ts` / `deadLetterHandlers`) — sin tocar archivos
 * generados.
 *
 * Los registrars deben ser idempotentes respecto del handler que reciben
 * (el applier garantiza una sola pasada por proceso).
 */

import type { PrismaClient } from '../../prisma/generated-client/client';
import type { ESignatureEventHandler } from './EsignatureEventHandler';

export type EsignatureCallbackRegistrar = (
  eventHandler: ESignatureEventHandler,
  prisma: PrismaClient
) => void;

export const projectEsignatureCallbacks: EsignatureCallbackRegistrar[] = [];

let applied = false;

/**
 * Aplica los registrars del proyecto UNA vez por proceso (los callbacks del
 * handler se acumulan; una doble pasada duplicaría efectos).
 */
export function applyProjectEsignatureCallbacks(
  eventHandler: ESignatureEventHandler,
  prisma: PrismaClient
): void {
  if (applied) return;
  applied = true;
  for (const register of projectEsignatureCallbacks) {
    register(eventHandler, prisma);
  }
}
