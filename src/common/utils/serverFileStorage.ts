/**
 * Utilidad para guardar archivos desde el servidor directamente al storage.
 * Centraliza el patrón: buffer → temp → metadatos → storage final
 */

import { createTempFileFromBuffer } from './fileHelpers';
import { fileServerDataSetter, fileClientDataSetter, getDatePath } from './fileSetter';
import { moveUploadedFiles } from './moveUploadedFiles';
import type { UploadedFile } from '../../graphql/types';

export interface SaveFileFromServerOptions {
  /** Buffer con el contenido del archivo */
  buffer: Buffer;
  /** Nombre del archivo (ej: "documento.pdf") */
  filename: string;
  /** Tipo MIME (ej: "application/pdf", "image/png") */
  mimetype: string;
  /** Nombre de la entidad Prisma (ej: "BotStep", "BotPhase") */
  entityName: string;
  /** Nombre del campo de archivo (ej: "downloadedFile", "screenshots") */
  fieldName: string;
  /** ID de la entidad para organizar en storage */
  entityId: string;
}

export interface SaveFileFromServerResult {
  /** Nombre del archivo guardado */
  filename: string;
  /** Datos del servidor para el campo _server_data */
  serverData: Record<string, unknown>;
  /** Datos del cliente para el campo _data */
  clientData: Record<string, unknown>;
  /** Ticket UUID del archivo temporal (para referencia) */
  ticket: string;
}

/**
 * Guarda un archivo desde un buffer directamente al storage.
 *
 * Flujo:
 * 1. Crea archivo temporal en .tmp/{ticket}.temp
 * 2. Genera metadatos (serverData, clientData)
 * 3. Mueve al storage final: {entityName}.{fieldName}/{YYYY}/{MM}/{DD}/{ticket}/{filename}
 *
 * @example
 * // Guardar un screenshot
 * const result = await saveFileFromServer({
 *   buffer: await page.screenshot(),
 *   filename: 'phase_complete.png',
 *   mimetype: 'image/png',
 *   entityName: 'BotPhase',
 *   fieldName: 'screenshots',
 *   entityId: phaseId
 * });
 *
 * // Actualizar entidad con los metadatos
 * await prisma.botPhase.update({
 *   where: { id: phaseId },
 *   data: {
 *     screenshots: result.filename,
 *     screenshots_server_data: result.serverData,
 *     screenshots_data: result.clientData
 *   }
 * });
 */
export async function saveFileFromServer(
  options: SaveFileFromServerOptions
): Promise<SaveFileFromServerResult> {
  const { buffer, filename, mimetype, entityName, fieldName, entityId } = options;
  const now = new Date();

  // 1. Crear archivo temporal
  const uploadedFile = createTempFileFromBuffer(buffer, filename, mimetype);

  // 2. Preparar metadatos
  const filesToMove: Array<{ name: string; uploadedFile: UploadedFile; uuid: string }> = [];
  const baseName = `${entityName}.${fieldName}/${getDatePath(now)}/`;
  const serverData = fileServerDataSetter(baseName, uploadedFile, filesToMove);
  const clientData = fileClientDataSetter(`${entityName}.${fieldName}`, uploadedFile);

  // 3. Mover al storage final
  await moveUploadedFiles(entityId, filesToMove);

  return {
    filename,
    serverData,
    clientData,
    ticket: uploadedFile.ticket
  };
}

/**
 * Guarda un archivo existente del filesystem al storage.
 * Útil para archivos descargados por bots u otros procesos.
 *
 * @example
 * // Guardar un PDF descargado por el bot
 * const result = await saveExistingFileToStorage(
 *   '/tmp/downloads/documento.pdf',
 *   {
 *     filename: 'contrato.pdf',
 *     mimetype: 'application/pdf',
 *     entityName: 'BotStep',
 *     fieldName: 'downloadedFile',
 *     entityId: stepId
 *   }
 * );
 */
export async function saveExistingFileToStorage(
  filePath: string,
  options: Omit<SaveFileFromServerOptions, 'buffer'>
): Promise<SaveFileFromServerResult> {
  const fs = await import('fs/promises');
  const buffer = await fs.readFile(filePath);
  return saveFileFromServer({ ...options, buffer });
}

/**
 * Guarda múltiples archivos y retorna un array de resultados.
 * Útil para campos de tipo `files` (múltiples archivos).
 *
 * @example
 * const results = await saveMultipleFilesToStorage([
 *   { buffer: screenshot1, filename: 'step1.png', mimetype: 'image/png' },
 *   { buffer: screenshot2, filename: 'step2.png', mimetype: 'image/png' }
 * ], {
 *   entityName: 'BotPhase',
 *   fieldName: 'screenshots',
 *   entityId: phaseId
 * });
 */
export async function saveMultipleFilesToStorage(
  files: Array<{ buffer: Buffer; filename: string; mimetype: string }>,
  commonOptions: Pick<SaveFileFromServerOptions, 'entityName' | 'fieldName' | 'entityId'>
): Promise<SaveFileFromServerResult[]> {
  const results: SaveFileFromServerResult[] = [];

  for (const file of files) {
    const result = await saveFileFromServer({
      ...file,
      ...commonOptions
    });
    results.push(result);
  }

  return results;
}
