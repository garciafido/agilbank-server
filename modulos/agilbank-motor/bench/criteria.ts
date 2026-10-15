// Lo que el banco exige de cada archivo, separado de la E/S de measure.ts para poder probarlo.
import { classify } from "../src/classify";
import type { Catalog } from "../src/catalog/catalog";
import type { BenchFile, PendingConcept } from "./files";

export interface Observed {
  lines: number;
  withCuit: number;
  chained: number;
  verdict: string;
  codes: string[];
  ms: number;
}

/**
 * Las fallas de un archivo y las advertencias de tiempo. Con la máquina cargada el tiempo mide la carga
 * y no la lectura: el techo solo es criterio con la carga al empezar menor que 2, y si no, se informa.
 * Pasar el doble del techo falla siempre: con cualquier carga, eso ya no es la máquina.
 */
export const checkFile = (f: BenchFile & { label: string }, o: Observed, load: number): { failures: string[]; timeWarnings: string[] } => {
  const failures: string[] = [];
  const timeWarnings: string[] = [];
  if (f.expectedLines !== undefined && o.lines !== f.expectedLines) failures.push(`${f.label}: ${o.lines} renglones, se esperaban ${f.expectedLines}`);
  if (f.minLines !== undefined && o.lines < f.minLines) failures.push(`${f.label}: ${o.lines} renglones, se esperaban ${f.minLines} o más`);
  if (o.verdict !== f.expectedVerdict) failures.push(`${f.label}: ${o.verdict}, se esperaba ${f.expectedVerdict}`);
  for (const w of f.expectedWarnings ?? []) if (!o.codes.includes(w)) failures.push(`${f.label}: falta el aviso ${w}`);
  if (o.codes.includes("lectura-parcial") && !(f.expectedWarnings ?? []).includes("lectura-parcial")) failures.push(`${f.label}: salió el aviso lectura-parcial y no se esperaba`);
  if (f.minLinesWithCuit !== undefined && o.withCuit < f.minLinesWithCuit) failures.push(`${f.label}: ${o.withCuit} renglones con CUIT, se esperaban ${f.minLinesWithCuit} o más`);
  if (f.minLinesThatChain !== undefined && o.chained < f.minLinesThatChain) failures.push(`${f.label}: encadenan ${o.chained} renglones, se esperaban ${f.minLinesThatChain} o más`);
  if (f.maxSeconds !== undefined) {
    const seconds = Math.round(o.ms / 1000);
    if (o.ms > 2 * f.maxSeconds * 1000) failures.push(`${f.label}: ${seconds} s, más del doble del techo de ${f.maxSeconds} s (carga ${load.toFixed(2)} al empezar)`);
    else if (o.ms > f.maxSeconds * 1000) {
      const over = `${f.label}: ${seconds} s, el techo es ${f.maxSeconds} s`;
      if (load < 2) failures.push(over);
      else timeWarnings.push(over);
    }
  }
  return { failures, timeWarnings };
};

/**
 * Los pendientes que la tabla ya cubre. Un pendiente es un concepto que la tabla no tiene: si entró,
 * hay que sacarlo de PENDING_CONCEPTS, porque si no el banco lo seguiría informando como pendiente.
 * Se pregunta a classify con los dos signos, que es lo que haría la lectura.
 */
export const pendingInTable = (pending: PendingConcept[], catalog: Catalog): PendingConcept[] =>
  pending.filter((p) =>
    [100, -100].some((amountCents) => classify({ text: p.text, code: null, amountCents }, { previous: null, next: null }, p.bank, catalog, []).type.source === "table"),
  );
