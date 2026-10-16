import type { Origin } from "../dbg/types";
import type { Coincidence, Confidence, Mark, Proposal } from "./types";

// La salida del contrato, en castellano, armada clave por clave: lo que el motor lleve de más no sale.

export interface StoredProposal { id: string; proposal: Proposal }
export interface PropuestaPublica {
  idPropuesta: string;
  idRenglon: string;
  tipo: "apareo" | "a-revisar" | "pendiente" | "dbg";
  valores: Array<string | number> | null;
  renglones: string[] | null;
  confianza: Confidence | null;
  coincidencias: Record<string, unknown> | null;
  marcas: string[];
  motivo: string | null;
  candidatos: Array<{ valores: Array<string | number> }> | null;
  tipoMovimiento: { id: string } | null;
  cuenta: CuentaPublica | null;
  cuentaIva: CuentaPublica | null;
  cuentaPercepcion: CuentaPublica | null;
  /** En pesos, con signo desde el banco. */
  importe: number | null;
  iva: number | null;
  percepcion: number | null;
  claveAgrupacion: string | null;
  origen: "decision" | "historia" | "catalogo" | "ninguno" | null;
}
export interface CuentaPublica { id: string; codigo: string | null }
export interface ConciliacionPublica { idConciliacion: string; propuestas: PropuestaPublica[] }

const MARCAS: Record<Mark, string> = { interchangeable: "intercambiable", "own-accounts": "cuentas-propias", "unchecked-line": "renglon-sin-control", "reading-warning": "lectura-con-aviso", "single-amount": "importe-unico", "third-party": "pago-de-un-tercero" };

const ORIGENES: Record<Origin, "decision" | "historia" | "catalogo" | "ninguno"> = { decision: "decision", history: "historia", catalog: "catalogo", none: "ninguno" };
const pesos = (cents: number): number => cents / 100;
const SIN_DBG = { tipoMovimiento: null, cuenta: null, cuentaIva: null, cuentaPercepcion: null, importe: null, iva: null, percepcion: null, claveAgrupacion: null, origen: null };

const coincidencias = (c: Coincidence): Record<string, unknown> => ({
  importe: true,
  ...(c.number !== undefined ? { numero: c.number } : {}),
  ...(c.days !== undefined ? { fecha: { dias: c.days } } : {}),
  ...(c.cuit !== undefined ? { cuit: c.cuit } : {}),
  ...(c.cbu !== undefined ? { cbu: c.cbu } : {}),
  ...(c.deposit !== undefined ? { boleta: c.deposit } : {}),
  ...(c.batch !== undefined ? { lote: c.batch } : {}),
});

const marcas = (marks: Mark[]): string[] => marks.map((m) => MARCAS[m]);

export const toPublicReconciliation = (id: string, stored: StoredProposal[], originalIds: Record<string, string | number>, accountCodes: Record<string, string> = {}): ConciliacionPublica => {
  // `hasOwn`: un id que se llame como una propiedad heredada («constructor») no puede devolver la función.
  const original = (valueId: string): string | number => (Object.hasOwn(originalIds, valueId) ? originalIds[valueId] : valueId);
  // Los ids de cuenta son los del catálogo que llegó en el pedido; uno que ya no esté sale sin código.
  const cuenta = (accountId: string | null): CuentaPublica | null => (accountId === null ? null : { id: accountId, codigo: Object.hasOwn(accountCodes, accountId) ? accountCodes[accountId] : null });
  return {
    idConciliacion: id,
    propuestas: stored.map(({ id: idPropuesta, proposal: p }): PropuestaPublica => {
      const base = { idPropuesta, idRenglon: p.lineId };
      if (p.kind === "match") {
        return { ...base, tipo: "apareo", valores: p.valueIds.map(original), renglones: p.groupLineIds, confianza: p.confidence, coincidencias: coincidencias(p.coincidence), marcas: marcas(p.marks), motivo: null, candidatos: null, ...SIN_DBG };
      }
      if (p.kind === "review") {
        return { ...base, tipo: "a-revisar", valores: null, renglones: null, confianza: null, coincidencias: null, marcas: [], motivo: p.reason, candidatos: p.candidates.map((c) => ({ valores: c.map(original) })), ...SIN_DBG };
      }
      if (p.kind === "dbg") {
        return {
          ...base, tipo: "dbg", valores: null, renglones: p.groupLineIds, confianza: p.confidence, coincidencias: null, marcas: marcas(p.marks), motivo: null, candidatos: null,
          tipoMovimiento: p.pair.movementTypeId === null ? null : { id: p.pair.movementTypeId },
          cuenta: cuenta(p.pair.accountId), cuentaIva: cuenta(p.pair.vatAccountId), cuentaPercepcion: cuenta(p.pair.perceptionAccountId),
          importe: pesos(p.amountCents), iva: pesos(p.vatCents), percepcion: pesos(p.perceptionCents), claveAgrupacion: p.groupKey, origen: ORIGENES[p.origin],
        };
      }
      return { ...base, tipo: "pendiente", valores: null, renglones: null, confianza: null, coincidencias: null, marcas: marcas(p.marks), motivo: p.reason, candidatos: null, ...SIN_DBG };
    }),
  };
};
