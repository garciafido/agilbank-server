import * as path from "path";
import { ValidationError } from "../errors";
import { UPLOAD_TICKET } from "./tempPath";

/**
 * El nombre de un archivo subido, si es un solo tramo de ruta. Lanza
 * ValidationError (INVALID_UPLOAD_FILENAME) si no es texto, si es vacío, `.` o
 * `..`, o si trae `/`, `\` o un byte nulo.
 */
export function assertSafeFileName(name: unknown): string {
  if (
    typeof name !== "string" ||
    name === "" ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\u0000")
  ) {
    throw new ValidationError("Nombre de archivo inválido.", {
      code: "INVALID_UPLOAD_FILENAME",
    });
  }
  return name;
}

/**
 * La clave de storage de un archivo subido: `baseName/uuid/filename`. Valida el
 * nombre (assertSafeFileName) y que el uuid sea un UUID, como el ticket del que
 * sale (UPLOAD_TICKET, de tempPath.ts). Lanza ValidationError; no toca el disco.
 */
export function storageKeyFor(
  baseName: string,
  uuid: string,
  filename: string
): string {
  assertSafeFileName(filename);
  if (typeof uuid !== "string" || !UPLOAD_TICKET.test(uuid)) {
    throw new ValidationError("Identificador de archivo inválido.", {
      code: "INVALID_UPLOAD_UUID",
    });
  }
  return path.join(baseName, uuid, filename);
}
