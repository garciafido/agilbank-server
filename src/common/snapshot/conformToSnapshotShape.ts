// Conforma el JSON congelado de un snapshot (`data_`) al shape declarado, al LEER.
// Tolera snapshots viejos cuando el schema evolucionó: coacciona scalars numéricos
// (string/""→num/null), completa listas ausentes con [], recursea objetos. `data_`
// NO se modifica; esto solo ajusta el valor que se devuelve a GraphQL. Defensivo:
// nunca tira; ante mismatch degrada a passthrough/null. Ver snapshotShapes.ts (descriptor
// generado) y el resolver de data_. Un `date` (día de calendario) se devuelve como
// "AAAA-MM-DD": un snapshot de antes de la fecha sin hora lo tiene con hora.

import { diaDeCalendario } from "../utils/calendarDate";

export type ScalarTypeName =
  | "string" | "number" | "integer" | "boolean" | "date" | "dateTime" | "decimal" | "json";

export type ShapeDescriptor =
  | { kind: "scalar"; type: ScalarTypeName }
  | { kind: "object"; fields: Record<string, ShapeDescriptor> }
  | { kind: "list"; itemShape: ShapeDescriptor }
  | { kind: "ref" }
  | { kind: "enum" }
  | { kind: "multilang"; suffixes: string[] }
  | { kind: "file" };

const NUMERIC = new Set<ScalarTypeName>(["number", "integer", "decimal"]);

export function conformToSnapshotShape(value: any, shape: ShapeDescriptor): any {
  switch (shape.kind) {
    case "scalar": {
      if (NUMERIC.has(shape.type)) {
        if (value === null || value === undefined || value === "") return null;
        if (typeof value === "number") return value;
        const n = Number(value);
        return Number.isNaN(n) ? null : n;
      }
      if (shape.type === "date") {
        return value instanceof Date || typeof value === "string" ? diaDeCalendario(value) : null;
      }
      return value ?? null;
    }
    case "list":
      // Los ítems de lista del snapshot son non-null en el schema (`[T!]!`), así que se
      // descartan los elementos que conformen a null (objeto nulo en data viejo, o scalar
      // inválido como "" en [Int!]) para no violar el tipo.
      return Array.isArray(value)
        ? value.map((v) => conformToSnapshotShape(v, shape.itemShape)).filter((v) => v !== null)
        : [];
    case "object": {
      if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
        return null;
      }
      const out: Record<string, any> = { ...value }; // preserva claves extra
      for (const [k, fieldShape] of Object.entries(shape.fields)) {
        // Los campos multilang viven en `data_` como claves sufijadas (name_es, name_en, ...),
        // no bajo la clave base; las preserva el spread de arriba. No agregar la clave base.
        if (fieldShape.kind === "multilang") continue;
        out[k] = conformToSnapshotShape(value[k], fieldShape);
      }
      return out;
    }
    case "ref":
    case "enum":
    case "multilang":
    case "file":
    default:
      return value ?? null;
  }
}
