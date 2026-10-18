import * as fs from "fs";
import { tempPathForTicket } from "./tempPath";

/**
 * Calcula el CRC32 de un archivo subido usando su ticket.
 * Lee el archivo temporal desde uploadTempDir y retorna el hash CRC32 como hex string.
 * El ticket llega del cliente: tempPathForTicket lo valida (un UUID, con la ruta
 * dentro del directorio temporal; si no, INVALID_UPLOAD_TICKET) antes de leer nada.
 */
export async function calculateUploadedFileCrc(ticket: string): Promise<string> {
  const filePath = tempPathForTicket(ticket);
  const buffer = await fs.promises.readFile(filePath);
  return crc32Hex(buffer);
}

/**
 * Calcula CRC32 de un buffer y retorna como hex string (8 caracteres).
 */
export function crc32Hex(data: Buffer): string {
  return (crc32(data) >>> 0).toString(16).padStart(8, "0").toUpperCase();
}

// CRC32 con tabla precalculada (IEEE 802.3 / ISO 3309)
const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  }
  crc32Table[i] = c;
}

function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return crc ^ 0xFFFFFFFF;
}
