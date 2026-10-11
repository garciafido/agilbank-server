/**
 * Tipos del sistema de alertas (framework genérico).
 *
 * Un "tipo de alerta" es un evaluador de código registrado en el AlertRegistry. El
 * catálogo de tipos = lo que está registrado (fuente de verdad única). El admin de
 * un tenant crea AlertRule (elige un tipo + params); los usuarios se suscriben
 * (AlertSubscription) y reciben UserNotification(type='alert') cuando el evaluador
 * dispara. Ver alerts/engine.ts (motor) y alerts/registry.ts.
 */

import type { PrismaClient } from "../prisma/generated-client/client";
import type { Logger } from "pino";

export type I18nLabel = { es: string; en: string; pt: string };

/**
 * Descriptor declarativo y SERIALIZABLE de un parámetro configurable de un tipo de
 * alerta. Es el "schema" de los params: alimenta tanto la validación (server) como
 * el form del admin (cliente, vía el query availableAlertTypes). Sin zod para poder
 * serializarlo al cliente.
 */
export type AlertParamSpec = {
  key: string;
  type: "int" | "number" | "string" | "boolean";
  label: I18nLabel;
  required?: boolean;
  default?: number | string | boolean;
  min?: number;
  max?: number;
};

/** Un disparo concreto del evaluador = un ítem ofensor → una notificación por suscriptor. */
export type AlertTrigger = {
  /** Clave estable del ítem ofensor (sin el usuario); el motor compone la dedup key final. */
  dedupKey: string;
  title: string;
  body?: string;
  objectType?: string;
  objectId?: string;
  actionUrl?: string;
  priority?: "high" | "medium" | "low";
  metadata?: Record<string, unknown>;
};

/** Contexto que recibe el evaluador: prisma sin filtro de tenant + el tenant a evaluar. */
export type AlertEvaluatorContext = {
  prisma: PrismaClient;
  tenantId: string;
  logger: Logger;
};

export type AlertEvaluatorDefinition = {
  /** Id estable; debe coincidir con AlertRule.alertType. */
  id: string;
  labels: I18nLabel;
  description?: I18nLabel;
  scope: "tenant";
  cadence: "hourly" | "daily";
  params: AlertParamSpec[];
  /** Evalúa la condición para un tenant y devuelve un trigger por ítem ofensor. */
  evaluate: (
    ctx: AlertEvaluatorContext,
    params: Record<string, unknown>
  ) => Promise<AlertTrigger[]>;
};
