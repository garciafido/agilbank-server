// Read model derivado de un snapshot jsonb (`data_`). Des-anida un sub-path del
// JSON congelado y produce filas {sourceKey, displayLabel} para la shadow table
// de proyección. Lógica pura (sin I/O): el SnapshotService generado la invoca con
// los parámetros derivados del modelo en build-time. Ver `.projectFrom` en el DSL.

export interface PathSeg {
  key: string;
  isArray: boolean;
}

export type DisplayPart = { field: string } | { literal: string };

export interface ProjectionRow {
  sourceKey: string;
  displayLabel: string;
}

export function buildProjectionRows(
  root: any,
  segments: PathSeg[],
  parts: DisplayPart[],
): ProjectionRow[] {
  let current: any[] = [root];
  for (const seg of segments) {
    if (seg.isArray) {
      current = current.flatMap((o) =>
        o && Array.isArray(o[seg.key]) ? o[seg.key] : [],
      );
    } else {
      current = current.map((o) => (o ? o[seg.key] : null)).filter(Boolean);
    }
  }

  const seen = new Set<string>();
  const rows: ProjectionRow[] = [];
  for (const obj of current) {
    const id = obj?.id;
    if (typeof id !== "string" || seen.has(id)) continue;
    seen.add(id);
    const displayLabel = parts
      .map((p) => ("literal" in p ? p.literal : obj[p.field] ?? ""))
      .join("")
      .trim();
    rows.push({ sourceKey: id, displayLabel });
  }
  return rows;
}
