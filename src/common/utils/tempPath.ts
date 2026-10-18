import * as path from "path";
import { uploadTempDir, tempExtension } from "../constants";
import { ValidationError } from "../errors";

/** Un ticket de subida: el UUID que generó singleUpload. Es también el uuid de la clave de storage (storageKey.ts). */
export const UPLOAD_TICKET =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La ruta del temporal del ticket, dentro de uploadTempDir.
 * Lanza ValidationError (INVALID_UPLOAD_TICKET) si el ticket no es un UUID o si la
 * ruta no queda dentro del directorio temporal; no toca el disco.
 */
export function tempPathForTicket(ticket: unknown): string {
  if (typeof ticket !== "string" || !UPLOAD_TICKET.test(ticket)) {
    throw new ValidationError("Ticket de archivo inválido.", {
      code: "INVALID_UPLOAD_TICKET",
    });
  }
  const resolved = path.resolve(uploadTempDir, `${ticket}.${tempExtension}`);
  if (!resolved.startsWith(path.resolve(uploadTempDir) + path.sep)) {
    throw new ValidationError("Ticket de archivo inválido.", {
      code: "INVALID_UPLOAD_TICKET",
    });
  }
  return resolved;
}
