import type { Balances, Grid } from "./types";
import type { BankEntry, Catalog } from "./catalog/catalog";
import type { Table } from "./columns";
import { roleOf } from "./columns";
import type { Judgement } from "./judge";
import { chronologicalOrder } from "./judge";
import type { BuiltRows } from "./rows";
import { CBU_PATTERN, isValidCbu } from "./counterparty";
import { normalizeConcept } from "./values";

export interface Bank {
  code: string;
  name: string | null;
}

/**
 * El banco por los tres primeros dígitos del CBU, esté o no en la tabla y aunque los verificadores no
 * validen (un CBU mal cargado en ProntoNet sigue diciendo de qué banco es): el nombre sale de la tabla
 * o queda null, nunca del nombre que mandaron, que puede ser el de otro banco. Sin tres cifras
 * adelante, o con el banco 000 de los ceros de relleno, por el nombre.
 */
export const bankOf = (cbu: string | null, bankName: string | null, catalog: Catalog): Bank | null => {
  if (cbu !== null && /^\d{3}/.test(cbu) && !cbu.startsWith("000")) {
    const code = cbu.slice(0, 3);
    return { code, name: catalog.banks.find((b) => b.code === code)?.name ?? null };
  }
  const name = ` ${normalizeConcept(bankName ?? "")} `;
  if (name.trim() === "") return null;
  const matches = catalog.banks
    .flatMap((b) => b.aliases.map((alias) => ({ b, alias })))
    .filter(({ alias }) => name.includes(` ${alias} `))
    .sort((a, b) => b.alias.length - a.alias.length);
  const found: BankEntry | undefined = matches[0]?.b;
  return found ? { code: found.code, name: found.name } : null;
};

/** El CBU como lo manda ProntoNet puede traer guiones o espacios: se compara por sus cifras. */
export const normalizeCbu = (cbu: string | null | undefined): string | null => {
  const digits = (cbu ?? "").replace(/\D/g, "");
  return digits === "" ? null : digits;
};

/**
 * Los CBU impresos en el título y en el pie, antes del primer movimiento y después del último. Son los
 * de la cuenta del archivo. Lo que está entre los movimientos (un bloque de detalle con el CBU de
 * origen de una transferencia) es de la contraparte y no cuenta.
 */
export const cbusOutsideMovements = (grid: Grid, rows: BuiltRows): string[] => {
  const first = rows.movements[0]?.fromRow ?? Infinity;
  const last = rows.movements[rows.movements.length - 1]?.toRow ?? -1;
  const found = new Set<string>();
  grid.rows.forEach((row, r) => {
    if (r >= first && r <= last) return;
    for (const v of row) {
      if (v === null) continue;
      for (const m of String(v).matchAll(CBU_PATTERN)) if (isValidCbu(m[0])) found.add(m[0]);
    }
  });
  return [...found];
};

/**
 * Si la tabla tiene una columna que su encabezado rotula como saldo y entró en alguna de las maneras
 * de leerla. Sirve para distinguir un archivo sin saldos de uno cuyo saldo no encadena con los importes.
 */
export const hasLabeledBalanceColumn = (grid: Grid, table: Table): boolean => {
  const header = table.headerRow === null ? null : grid.rows[table.headerRow];
  if (!header) return false;
  return table.interpretations.some((i) => {
    const label = i.balance === null ? null : header[i.balance];
    return typeof label === "string" && roleOf(label) === "balance";
  });
};

/** Los saldos inicial y final que salen del primer y del último saldo de renglón, en orden cronológico. */
export const lineBalancesOf = (j: Judgement): Balances => {
  let opening: number | null = null;
  let closing: number | null = null;
  if (j.balanceIs !== null) {
    const ms = j.rows.movements;
    const order = chronologicalOrder(ms.length, j.direction);
    let before = 0;
    for (const k of order) {
      const m = ms[k];
      if (m.balanceCents !== null) {
        opening = j.balanceIs === "after" ? m.balanceCents - before - m.amountCents : m.balanceCents - before;
        break;
      }
      before += m.amountCents;
    }
    let after = 0;
    for (const k of [...order].reverse()) {
      const m = ms[k];
      if (m.balanceCents !== null) {
        closing = j.balanceIs === "after" ? m.balanceCents + after : m.balanceCents + m.amountCents + after;
        break;
      }
      after += m.amountCents;
    }
  }
  return { openingCents: opening, closingCents: closing };
};

/**
 * Los saldos inicial y final leídos. Primero los impresos, resueltos por el juez para el sentido del
 * archivo; si no hay, los que salen del primer y del último saldo de renglón.
 */
export const balancesOf = (j: Judgement): Balances => {
  const lines = lineBalancesOf(j);
  return { openingCents: j.openingCents ?? lines.openingCents, closingCents: j.closingCents ?? lines.closingCents };
};
