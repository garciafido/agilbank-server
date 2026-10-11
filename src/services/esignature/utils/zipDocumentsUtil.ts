import JSZip from 'jszip';

export interface ZipEntry {
  name: string;
  buffer: Buffer;
}

/**
 * Create a ZIP archive from multiple file entries.
 */
export async function zipDocuments(entries: ZipEntry[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.name, entry.buffer);
  }
  const result = await zip.generateAsync({ type: 'nodebuffer' });
  return result;
}

/**
 * Add entries to an existing ZIP archive buffer.
 */
export async function addToZip(existingZip: Buffer, entries: ZipEntry[]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(existingZip);
  for (const entry of entries) {
    zip.file(entry.name, entry.buffer);
  }
  const result = await zip.generateAsync({ type: 'nodebuffer' });
  return result;
}
