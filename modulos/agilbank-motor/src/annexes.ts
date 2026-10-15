import type { Grid, StatementLine } from "./types";
import { roleOf } from "./columns";
import { counterpartyOf } from "./counterparty";
import { isoDate, parseCents, textOf } from "./values";

/** Una fila de un anexo que nombra a la otra parte de un movimiento. */
export interface AnnexEntry {
  date: string;
  amountCents: number;
  cuit: string;
  name: string | null;
  reference: string | null;
}

const AMOUNT_ROLES = ["amount", "credit", "debit"];

/** Las filas del anexo con fecha, importe y un CUIT válido fuera de la referencia. */
export const annexEntries = (annex: Grid): AnnexEntry[] => {
  const roles = (annex.rows[0] ?? []).map((v) => (typeof v === "string" ? roleOf(v) : null));
  const dateCol = roles.indexOf("date");
  const amountCol = roles.findIndex((r) => r !== null && AMOUNT_ROLES.includes(r));
  const refCol = roles.indexOf("reference");
  if (dateCol < 0 || amountCol < 0) return [];
  const out: AnnexEntry[] = [];
  for (const row of annex.rows.slice(1)) {
    const date = isoDate(row[dateCol] ?? null);
    const cents = parseCents(row[amountCol] ?? null, "ar");
    if (date === null || cents === null) continue;
    const party = row
      .map((v, c) => (c === dateCol || c === amountCol || c === refCol ? null : counterpartyOf(textOf(v ?? null), [])))
      .find((p) => p?.cuit != null);
    if (!party?.cuit) continue;
    const reference = refCol >= 0 ? textOf(row[refCol] ?? null) : "";
    out.push({ date, amountCents: Math.abs(cents), cuit: party.cuit, name: party.name, reference: reference === "" ? null : reference });
  }
  return out;
};

const keyOf = (date: string, amountCents: number): string => `${date}|${Math.abs(amountCents)}`;

/**
 * La contraparte que trae un anexo, en el renglón con la misma fecha y el mismo importe sin signo
 * (RF-06). Se agrupa por (fecha, importe) y se completa solo sin adivinar: con una entrada y un renglón
 * en el grupo, o cuando la referencia empareja una entrada con un renglón de manera única de los dos
 * lados. Los renglones cuentan todos, también los que ya traen CUIT, que nunca se pisa.
 */
export const applyAnnexes = (lines: StatementLine[], entries: AnnexEntry[]): StatementLine[] => {
  const entriesBy = new Map<string, AnnexEntry[]>();
  for (const e of entries) entriesBy.set(keyOf(e.date, e.amountCents), [...(entriesBy.get(keyOf(e.date, e.amountCents)) ?? []), e]);
  const linesBy = new Map<string, number[]>();
  lines.forEach((l, i) => linesBy.set(keyOf(l.date, l.amountCents), [...(linesBy.get(keyOf(l.date, l.amountCents)) ?? []), i]));

  const out = [...lines];
  for (const [key, group] of entriesBy) {
    const indexes = linesBy.get(key) ?? [];
    for (const i of indexes) {
      const l = lines[i];
      let e: AnnexEntry | undefined;
      if (group.length === 1 && indexes.length === 1) e = group[0];
      else {
        const byReference = group.filter((x) => x.reference !== null && x.reference === l.reference);
        const sameReference = indexes.filter((j) => lines[j].reference === l.reference);
        if (byReference.length === 1 && sameReference.length === 1) e = byReference[0];
      }
      if (e === undefined || l.counterparty?.cuit) continue;
      out[i] = { ...l, counterparty: { cuit: e.cuit, name: e.name, cbu: l.counterparty?.cbu ?? null } };
    }
  }
  return out;
};
