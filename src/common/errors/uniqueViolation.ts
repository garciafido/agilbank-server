// Qué restricción de unicidad saltó en un P2002 de Prisma, y el mensaje que la
// nombra ("Ya existe un fonograma con ese ISRC.").
//
// Funciones puras: los datos del modelo (UNIQUE_CONSTRAINTS, generado desde el
// schema.prisma de cada proyecto) llegan por parámetro.
//
// Con driver adapters Prisma no llena meta.target: lo que hay está en
// meta.driverAdapterError.cause. Y meta.modelName es el modelo de la operación
// de ARRIBA, no el dueño de la restricción: un update de una obra que choca en
// el ISRC de un fonograma anidado llega con modelName "MusicalWork". Por eso el
// dueño se busca por el nombre de la restricción, y el modelName es el último
// recurso.

export type UniqueLabel = { s: string; g?: "M" | "F" };

export type UniqueTable = {
  /** Modelo de Prisma (nombre de la entidad). */
  model: string;
  /** Etiqueta de la entidad por idioma. */
  labels: Record<string, UniqueLabel>;
  /** Columna de la base → campos lógicos; null para tenant, id y la FK al padre. */
  columns: Record<string, string[] | null>;
  /** Nombre de la restricción en la base → campos lógicos. */
  constraints: Record<string, string[]>;
  /** Campo lógico → etiqueta por idioma. */
  fieldLabels: Record<string, Record<string, UniqueLabel>>;
};

export type UniqueConstraintsData = {
  defaultLanguage: string;
  /** Por nombre de tabla en la base. */
  tables: Record<string, UniqueTable>;
};

export type UniqueViolation = { model: string; fields: string[]; table: UniqueTable };

type RawViolation = { constraint?: string; table?: string; columns: string[]; modelName?: string };

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;

/** Los datos crudos del P2002, en la forma de Prisma con o sin driver adapter. */
export function readUniqueViolation(meta: unknown): RawViolation {
  const m = asRecord(meta) ?? {};
  const cause = asRecord(asRecord(m.driverAdapterError)?.cause) ?? {};
  const constraintInfo = asRecord(cause.constraint) ?? {};
  const message = typeof cause.originalMessage === "string" ? cause.originalMessage : "";

  // Postgres: duplicate key value violates unique constraint "x" (o «x» con la base en castellano).
  const quoted = message.match(/["«]([^"«»]+)["»]/)?.[1];
  const constraint =
    quoted ??
    (typeof constraintInfo.index === "string" ? constraintInfo.index : undefined) ??
    (typeof m.target === "string" ? m.target : undefined);
  // SQLite: UNIQUE constraint failed: tabla.columna, tabla.columna
  const table = message.match(/constraint failed: (\w+)\./)?.[1];
  const rawColumns = Array.isArray(constraintInfo.fields)
    ? constraintInfo.fields
    : Array.isArray(m.target)
      ? m.target
      : [];
  // Postgres cita las columnas con mayúsculas: "signed_edition__signingPublishers__id".
  const columns = rawColumns
    .filter((c): c is string => typeof c === "string")
    .map((c) => (/^".*"$/.test(c) ? c.slice(1, -1).replace(/""/g, '"') : c));
  const modelName = typeof m.modelName === "string" ? m.modelName : undefined;
  return { constraint, table, columns, modelName };
}

const unique = (values: string[]) => Array.from(new Set(values));

const fieldsFromColumns = (t: UniqueTable, columns: string[]) =>
  unique(columns.flatMap((c) => t.columns[c] ?? []));

const fits = (t: UniqueTable, columns: string[]) => columns.length > 0 && columns.every((c) => c in t.columns);

/** Dueño y campos de la restricción que saltó; undefined si no se puede saber. */
export function resolveUniqueViolation(meta: unknown, data: UniqueConstraintsData): UniqueViolation | undefined {
  const raw = readUniqueViolation(meta);
  const tables = Object.entries(data.tables);

  // 1. El nombre de la restricción, tal cual: alcanza aunque no haya columnas.
  if (raw.constraint) {
    for (const [, t] of tables) {
      const fields = t.constraints[raw.constraint];
      if (fields) return { model: t.model, fields, table: t };
    }
  }

  // 2. La tabla: la del mensaje de SQLite, o la de nombre más largo que sea prefijo
  // de la restricción y tenga todas las columnas (musical_work_link antes que musical_work).
  let owner = raw.table ? data.tables[raw.table] : undefined;
  if (!owner && raw.constraint) {
    const candidates = tables
      .filter(([name, t]) => raw.constraint!.startsWith(`${name}_`) && fits(t, raw.columns))
      .sort(([a], [b]) => b.length - a.length);
    owner = candidates[0]?.[1];
  }
  if (owner && fits(owner, raw.columns)) {
    return { model: owner.model, fields: fieldsFromColumns(owner, raw.columns), table: owner };
  }

  // 3. El modelo de la operación, si las columnas son suyas.
  const byModel = tables.find(([, t]) => t.model === raw.modelName)?.[1];
  if (byModel && fits(byModel, raw.columns)) {
    return { model: byModel.model, fields: fieldsFromColumns(byModel, raw.columns), table: byModel };
  }
  return undefined;
}

// Minúscula inicial de cada palabra que no sea una sigla: "Obra Musical" → "obra
// musical", "Autor/Compositor" → "autor/compositor", "ISRC" queda "ISRC".
const lower = (text: string) => text.replace(/(^|[\s/(-])(\p{Lu})(?=\p{Ll})/gu, (_m, sep: string, ch: string) => sep + ch.toLowerCase());

const join = (items: string[], and: string) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;

/** "Ya existe un fonograma con ese ISRC." en el idioma pedido (o el default del proyecto). */
export function uniqueViolationMessage(
  v: UniqueViolation,
  data: UniqueConstraintsData,
  language?: string | null
): string {
  const lang = language && v.table.labels[language] ? language : data.defaultLanguage;
  const entity = v.table.labels[lang] ?? v.table.labels[data.defaultLanguage] ?? { s: v.model };
  const labels = v.fields.map((f) => v.table.fieldLabels[f]?.[lang] ?? { s: f });
  const names = labels.map((l) => lower(l.s));
  const ent = lower(entity.s);
  const female = entity.g === "F";
  const fieldFemale = labels[0]?.g === "F";

  if (lang === "en") {
    if (names.length === 0) return `Another ${ent} already has that data.`;
    if (names.length === 1) return `Another ${ent} already has that ${names[0]}.`;
    return `Another ${ent} already has that combination of ${join(names, "and")}.`;
  }
  if (lang === "pt") {
    const article = female ? "uma" : "um";
    if (names.length === 0) return `Já existe ${article} ${ent} com esses dados.`;
    if (names.length === 1) return `Já existe ${article} ${ent} com ${fieldFemale ? "essa" : "esse"} ${names[0]}.`;
    return `Já existe ${article} ${ent} com essa combinação de ${join(names, "e")}.`;
  }
  const article = female ? "una" : "un";
  if (names.length === 0) return `Ya existe ${article} ${ent} con esos datos.`;
  if (names.length === 1) return `Ya existe ${article} ${ent} con ${fieldFemale ? "esa" : "ese"} ${names[0]}.`;
  return `Ya existe ${article} ${ent} con esa combinación de ${join(names, "y")}.`;
}
