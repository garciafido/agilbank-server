/**
 * Stub editable del PROYECTO: registrar acá los evaluadores de tipos de alerta.
 * Vacío por default (opt-in, cost-zero). El generador re-emite este archivo vacío;
 * el merge base→develop preserva el contenido que agregue el proyecto.
 *
 * Ejemplo:
 *   import { alertRegistry } from "./registry";
 *   export function registerAlertEvaluators(): void {
 *     alertRegistry.register({
 *       id: "unsignedContracts",
 *       labels: { es: "Contratos sin firmar", en: "Unsigned contracts", pt: "Contratos sem assinar" },
 *       scope: "tenant",
 *       cadence: "daily",
 *       params: [{ key: "days", type: "int", label: {es:"Días",en:"Days",pt:"Dias"}, default: 7, min: 1 }],
 *       async evaluate(ctx, params) { return [...triggers]; },
 *     });
 *   }
 */

export function registerAlertEvaluators(): void {
  // El proyecto registra sus evaluadores acá (ver ejemplo arriba).
}
