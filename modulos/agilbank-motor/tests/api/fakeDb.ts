import { randomUUID } from "crypto";

type Row = Record<string, any>;
type Where = Record<string, unknown>;

/** Igualdad de columna como en la base: `null` es la columna vacía (en el fake, también ausente) y una fecha vale por su instante. */
const same = (value: unknown, condition: unknown): boolean => {
  if (condition === null) return value === null || value === undefined;
  if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
  return value === condition;
};

/** Un valor del `where` como lo entiende Prisma, en lo que usa el motor: igualdad, `not`, `in`; `undefined` omite. */
const matches = (row: Row, where: Where): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (condition !== null && typeof condition === "object" && !Array.isArray(condition) && !(condition instanceof Date)) {
      const c = condition as { not?: unknown; in?: unknown[] };
      if ("not" in c) return !same(row[key], c.not);
      if ("in" in c) return (c.in ?? []).includes(row[key]);
    }
    return same(row[key], condition);
  });

/** El `data` de un update, con `increment` y `decrement` de Prisma sobre una columna numérica (ausente cuenta como 0, el default). */
const apply = (row: Row, data: Row): void => {
  for (const [key, value] of Object.entries(data)) {
    const op = value as { increment?: number; decrement?: number } | null;
    if (op && typeof op === "object" && "increment" in op) row[key] = (row[key] ?? 0) + (op.increment as number);
    else if (op && typeof op === "object" && "decrement" in op) row[key] = (row[key] ?? 0) - (op.decrement as number);
    else row[key] = value;
  }
};

/** `connect` de Prisma a columna: `tenant_: { connect: { id } }` → `tenant_id_`. */
const flatten = (data: Row): Row => {
  const out: Row = {};
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "connect" in value) out[`${key}id_`] = (value as { connect: { id: string } }).connect.id;
    else out[key] = value;
  }
  return out;
};

/** `select` de Prisma: solo las columnas pedidas; sin `select`, la fila entera. Siempre una copia, como la base real. */
const project = (row: Row, select?: Record<string, unknown>): Row =>
  select ? Object.fromEntries(Object.entries(select).filter(([, on]) => on).map(([key]) => [key, row[key]])) : { ...row };

/** Los argumentos van como `never` para que un test pueda envolver un método con cualquier forma de argumentos. */
interface Model {
  findFirst(args: never): Promise<Row | null>;
  findMany(args: never): Promise<Row[]>;
  create(args: never): Promise<Row>;
  updateMany(args: never): Promise<{ count: number }>;
}

const model = (rows: Row[], wheres: Where[], unique?: (a: Row, b: Row) => boolean): Model => ({
  findFirst: async ({ where, select }: any): Promise<Row | null> => {
    wheres.push(where);
    const found = rows.find((r) => matches(r, where));
    return found ? project(found, select) : null;
  },
  findMany: async ({ where, orderBy, select }: any): Promise<Row[]> => {
    wheres.push(where);
    const found = rows.filter((r) => matches(r, where));
    const [key, dir] = (Object.entries(orderBy ?? {}) as Array<[string, "asc" | "desc"]>)[0] ?? [];
    if (key) found.sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (dir === "desc" ? -1 : 1));
    return found.map((r) => project(r, select));
  },
  create: async ({ data, select }: any): Promise<Row> => {
    const row = { id: randomUUID(), ...flatten(data) };
    if (unique && rows.some((r) => unique(r, row))) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    rows.push(row);
    return project(row, select);
  },
  updateMany: async ({ where, data }: any): Promise<{ count: number }> => {
    wheres.push(where);
    const hit = rows.filter((r) => matches(r, where));
    for (const r of hit) apply(r, data);
    return { count: hit.length };
  },
});

export const fakeDb = (seed: { abStatement?: Row[]; abConceptCorrection?: Row[]; workerEvent?: Row[] } = {}) => {
  const rows = { abStatement: [...(seed.abStatement ?? [])], abConceptCorrection: [...(seed.abConceptCorrection ?? [])], workerEvent: [...(seed.workerEvent ?? [])] };
  const wheres: Where[] = [];
  const db = {
    abStatement: model(rows.abStatement, wheres, (a, b) => a.tenant_id_ === b.tenant_id_ && a.contentHash === b.contentHash),
    abConceptCorrection: model(rows.abConceptCorrection, wheres),
    workerEvent: model(rows.workerEvent, wheres),
  };
  return { db, rows, wheres };
};
