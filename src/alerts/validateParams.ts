/**
 * Validación de los params de una AlertRule contra el AlertParamSpec[] declarado por
 * su tipo de alerta. Reemplaza a zod: el spec ES el schema (declarativo, serializable).
 * Lo usa la customValidation de AlertRule (al guardar) y el motor (antes de evaluar).
 */

import { AlertParamSpec } from "./types";
import { alertRegistry } from "./registry";

export type ParamValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; errors: string[] };

const coerceNumber = (v: unknown): number | undefined => {
  if (typeof v === "number") return Number.isNaN(v) ? undefined : v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
};

/** Valida + coacciona un objeto de params contra los specs. Puro (no toca DB). */
export function validateAlertParams(
  specs: AlertParamSpec[],
  rawParams: unknown
): ParamValidationResult {
  const params =
    rawParams && typeof rawParams === "object" && !Array.isArray(rawParams)
      ? (rawParams as Record<string, unknown>)
      : {};
  const errors: string[] = [];
  const value: Record<string, unknown> = {};

  for (const spec of specs) {
    let raw = params[spec.key];
    if (raw === undefined || raw === null || raw === "") {
      if (spec.default !== undefined) {
        value[spec.key] = spec.default;
        continue;
      }
      if (spec.required) errors.push(`'${spec.key}' es requerido`);
      continue;
    }

    if (spec.type === "int" || spec.type === "number") {
      const n = coerceNumber(raw);
      if (n === undefined) {
        errors.push(`'${spec.key}' debe ser numérico`);
        continue;
      }
      if (spec.type === "int" && !Number.isInteger(n)) {
        errors.push(`'${spec.key}' debe ser entero`);
        continue;
      }
      if (spec.min !== undefined && n < spec.min) errors.push(`'${spec.key}' debe ser ≥ ${spec.min}`);
      if (spec.max !== undefined && n > spec.max) errors.push(`'${spec.key}' debe ser ≤ ${spec.max}`);
      value[spec.key] = n;
    } else if (spec.type === "boolean") {
      value[spec.key] = raw === true || raw === "true";
    } else {
      value[spec.key] = String(raw);
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

/**
 * Resuelve el tipo en el registry y valida los params; tira Error si el tipo no existe
 * o los params son inválidos. Llamado desde la customValidation de AlertRule.
 */
export function assertValidAlertParams(alertType: string, rawParams: unknown): Record<string, unknown> {
  const def = alertRegistry.get(alertType);
  if (!def) {
    throw new Error(`Tipo de alerta desconocido: '${alertType}'. Tipos válidos: ${alertRegistry.ids().join(", ") || "(ninguno registrado)"}`);
  }
  const res = validateAlertParams(def.params, rawParams);
  if (!res.ok) {
    throw new Error(`Parámetros inválidos para la alerta '${alertType}': ${res.errors.join("; ")}`);
  }
  return res.value;
}
