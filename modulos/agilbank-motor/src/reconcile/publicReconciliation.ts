import type { Coincidence, Confidence, Mark, Proposal } from "./types";

// La salida del contrato, en castellano, armada clave por clave: lo que el motor lleve de más no sale.

export interface StoredProposal { id: string; proposal: Proposal }
export interface PropuestaPublica {
  idPropuesta: string;
  idRenglon: string;
  tipo: "apareo" | "a-revisar" | "pendiente";
  valores: Array<string | number> | null;
  renglones: string[] | null;
  confianza: Confidence | null;
  coincidencias: Record<string, unknown> | null;
  marcas: string[];
  motivo: string | null;
  candidatos: Array<{ valores: Array<string | number> }> | null;
}
export interface ConciliacionPublica { idConciliacion: string; propuestas: PropuestaPublica[] }

const MARCAS: Record<Mark, string> = { interchangeable: "intercambiable", "own-accounts": "cuentas-propias", "unchecked-line": "renglon-sin-control", "reading-warning": "lectura-con-aviso", "single-amount": "importe-unico", "third-party": "pago-de-un-tercero" };

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

export const toPublicReconciliation = (id: string, stored: StoredProposal[], originalIds: Record<string, string | number>): ConciliacionPublica => {
  // `hasOwn`: un id que se llame como una propiedad heredada («constructor») no puede devolver la función.
  const original = (valueId: string): string | number => (Object.hasOwn(originalIds, valueId) ? originalIds[valueId] : valueId);
  return {
    idConciliacion: id,
    propuestas: stored.map(({ id: idPropuesta, proposal: p }): PropuestaPublica => {
      const base = { idPropuesta, idRenglon: p.lineId };
      if (p.kind === "match") {
        return { ...base, tipo: "apareo", valores: p.valueIds.map(original), renglones: p.groupLineIds, confianza: p.confidence, coincidencias: coincidencias(p.coincidence), marcas: marcas(p.marks), motivo: null, candidatos: null };
      }
      if (p.kind === "review") {
        return { ...base, tipo: "a-revisar", valores: null, renglones: null, confianza: null, coincidencias: null, marcas: [], motivo: p.reason, candidatos: p.candidates.map((c) => ({ valores: c.map(original) })) };
      }
      return { ...base, tipo: "pendiente", valores: null, renglones: null, confianza: null, coincidencias: null, marcas: marcas(p.marks), motivo: p.reason, candidatos: null };
    }),
  };
};
