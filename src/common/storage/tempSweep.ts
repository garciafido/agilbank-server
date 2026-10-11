import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Logger } from "pino";
import { uploadTempDir, tempExtension } from "../constants";

/**
 * Barrido de archivos temporales huérfanos. Cada target declara un directorio,
 * un patrón (prefijo y/o sufijo de nombre) y una edad máxima; el scheduler del
 * worker corre el barrido cada hora y borra lo vencido.
 *
 * Las edades son deliberadamente holgadas: un temporal EN USO nunca llega a
 * la edad de barrido (los pipelines viven minutos; una sesión de formulario,
 * horas). El barrido es la red para lo abandonado: descargas de storage que
 * nadie borra, staging de uploads sin Save, restos de bots caídos.
 */
export interface TempSweepTarget {
  dir: string;
  /** El nombre de la entrada debe empezar con este prefijo. */
  prefix?: string;
  /** El nombre de la entrada debe terminar con este sufijo. */
  suffix?: string;
  maxAgeHours: number;
}

const targets: TempSweepTarget[] = [
  // Descargas del storage (SpacesStorage.download): los callers las consumen
  // en minutos y nadie las borra.
  { dir: os.tmpdir(), prefix: "spaces-download-", maxAgeHours: 24 },
  // Staging de uploads de formularios: el Save los consume (moveUploadedFiles
  // los mueve al storage y borra el temporal); sin Save quedan huérfanos.
  // 72h generosas: una sesión de formulario no sobrevive días. Si el temporal
  // expiró, el Save responde UPLOAD_TEMP_EXPIRED y el usuario re-sube.
  { dir: uploadTempDir, suffix: `.${tempExtension}`, maxAgeHours: 72 },
];

/**
 * Registro opt-in para temporales del proyecto (p.ej. directorios de trabajo
 * de bots). Llamar en el módulo que los crea, a nivel de módulo.
 */
export function registerTempSweepTarget(target: TempSweepTarget): void {
  targets.push(target);
}

export async function runTempSweep(logger?: Logger): Promise<void> {
  for (const target of targets) {
    let entries: string[];
    try {
      entries = await fs.promises.readdir(target.dir);
    } catch {
      continue; // directorio inexistente: nada que barrer
    }

    const cutoff = Date.now() - target.maxAgeHours * 60 * 60 * 1000;
    let removed = 0;
    for (const name of entries) {
      if (target.prefix && !name.startsWith(target.prefix)) continue;
      if (target.suffix && !name.endsWith(target.suffix)) continue;
      const fullPath = path.join(target.dir, name);
      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.mtimeMs >= cutoff) continue;
        await fs.promises.rm(fullPath, { recursive: true, force: true });
        removed++;
      } catch (error) {
        // Tolerante por entrada: una carrera (otro proceso la borró) o un
        // permiso no cortan el barrido del resto.
        logger?.warn({ path: fullPath, error }, "Temp sweep: entry skipped");
      }
    }

    if (removed > 0) {
      logger?.info(
        {
          dir: target.dir,
          prefix: target.prefix,
          suffix: target.suffix,
          removed,
          maxAgeHours: target.maxAgeHours,
        },
        "Temp sweep: old temp entries removed"
      );
    }
  }
}
