/**
 * Uso de storage por tenant — agnóstico del backend (filesystem, Spaces, etc.):
 * suma los bytes registrados en la base al subir cada archivo (el `size` del
 * JSON `*__server_data`), sin listar el repositorio de archivos.
 *
 * Descubrimiento en runtime vía information_schema: toda columna
 * `*__server_data` de una tabla con `tenant__id__` entra en la medición —
 * cubre cualquier entidad con archivos, presente y futura, sin enumerarlas
 * en el generador. Maneja campos single (objeto) y multi (array de objetos).
 *
 * Salida: gauge Prometheus `tenant_storage_bytes{tenant, source}` donde
 * source = "tabla.campo" (ej. "musical_work.score"). Cardinalidad acotada:
 * tenants x campos file.
 *
 * Limitación conocida: mide lo REGISTRADO en la base — objetos huérfanos del
 * storage (sin fila que los referencie) no aparecen; eso es una reconciliación
 * aparte si algún día hace falta.
 */

import { basePrisma } from '../prisma/client';
import { logger } from '../utils/logger';
import { tenantStorageBytes } from './registry';

type FileColumn = { tableName: string; columnName: string };

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

async function discoverFileColumns(): Promise<FileColumn[]> {
  const rows = await basePrisma.$queryRaw<
    Array<{ table_name: string; column_name: string }>
  >`
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name LIKE '%\\_\\_server\\_data'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns t
        WHERE t.table_schema = 'public'
          AND t.table_name = c.table_name
          AND t.column_name = 'tenant__id__'
      )
    ORDER BY c.table_name, c.column_name
  `;
  return rows
    .filter((r) => IDENTIFIER_RE.test(r.table_name) && IDENTIFIER_RE.test(r.column_name))
    .map((r) => ({ tableName: r.table_name, columnName: r.column_name }));
}

async function collectColumn(col: FileColumn): Promise<Array<{ tenant: string; bytes: bigint }>> {
  // Identificadores validados por regex (y provenientes de information_schema):
  // la interpolación es segura. jsonb_typeof discrimina single/multi/null.
  const sql = `
    SELECT tenant__id__ AS tenant, SUM(
      CASE jsonb_typeof("${col.columnName}"::jsonb)
        WHEN 'object' THEN COALESCE(("${col.columnName}"::jsonb->>'size')::bigint, 0)
        WHEN 'array' THEN COALESCE((
          SELECT SUM((e->>'size')::bigint)
          FROM jsonb_array_elements("${col.columnName}"::jsonb) e
          WHERE jsonb_typeof(e) = 'object'
        ), 0)
        ELSE 0
      END
    )::bigint AS bytes
    FROM "${col.tableName}"
    WHERE "${col.columnName}" IS NOT NULL AND tenant__id__ IS NOT NULL
    GROUP BY 1
  `;
  return basePrisma.$queryRawUnsafe(sql);
}

export async function collectStorageUsageByTenant(): Promise<void> {
  const columns = await discoverFileColumns();

  // reset(): un tenant que borró todos sus archivos debe volver a 0, no
  // quedar clavado en el último valor reportado.
  tenantStorageBytes.reset();

  for (const col of columns) {
    try {
      const rows = await collectColumn(col);
      const source = `${col.tableName}.${col.columnName.replace(/__server_data$/, '')}`;
      for (const row of rows) {
        tenantStorageBytes.set({ tenant: row.tenant, source }, Number(row.bytes ?? 0));
      }
    } catch (error) {
      logger.warn(
        { table: col.tableName, column: col.columnName, error: (error as Error).message },
        '[StorageUsage] Column aggregation failed'
      );
    }
  }
}

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // horario
const BOOT_DELAY_MS = 30 * 1000; // no competir con el arranque

let timer: ReturnType<typeof setInterval> | null = null;

export function startStorageUsageCollector(): void {
  if (timer) return;
  const intervalMs = parseInt(process.env.STORAGE_USAGE_INTERVAL_MS || '', 10) || DEFAULT_INTERVAL_MS;

  const run = () =>
    collectStorageUsageByTenant().catch((error) =>
      logger.warn({ error: (error as Error).message }, '[StorageUsage] Collection failed')
    );

  setTimeout(run, BOOT_DELAY_MS);
  timer = setInterval(run, intervalMs);
  timer.unref?.();
  logger.info({ intervalMs }, '[StorageUsage] Collector started');
}
