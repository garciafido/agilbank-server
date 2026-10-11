import { describe, it, expect } from '@jest/globals';
import JSZip from 'jszip';
import { zipDocuments, addToZip, ZipEntry } from '../utils/zipDocumentsUtil';

describe('zipDocuments', () => {
  it('should create a ZIP with multiple entries', async () => {
    const entries: ZipEntry[] = [
      { name: 'file1.pdf', buffer: Buffer.from('content1') },
      { name: 'file2.pdf', buffer: Buffer.from('content2') },
    ];

    const result = await zipDocuments(entries);
    const zip = await JSZip.loadAsync(result);

    expect(Object.keys(zip.files).sort()).toEqual(['file1.pdf', 'file2.pdf']);
    const content1 = await zip.file('file1.pdf')!.async('nodebuffer');
    expect(content1.toString()).toBe('content1');
  });

  it('should handle single entry', async () => {
    const entries: ZipEntry[] = [
      { name: 'only.pdf', buffer: Buffer.from('solo') },
    ];

    const result = await zipDocuments(entries);
    const zip = await JSZip.loadAsync(result);

    expect(Object.keys(zip.files)).toEqual(['only.pdf']);
  });

  it('should handle empty entries', async () => {
    const result = await zipDocuments([]);
    const zip = await JSZip.loadAsync(result);

    expect(Object.keys(zip.files)).toEqual([]);
  });
});

describe('addToZip', () => {
  it('should add entries to an existing ZIP', async () => {
    // Create initial ZIP
    const initial = await zipDocuments([
      { name: 'original.pdf', buffer: Buffer.from('original') },
    ]);

    // Add new entry
    const updated = await addToZip(initial, [
      { name: 'added.pdf', buffer: Buffer.from('added') },
    ]);

    const zip = await JSZip.loadAsync(updated);
    expect(Object.keys(zip.files).sort()).toEqual(['added.pdf', 'original.pdf']);

    const addedContent = await zip.file('added.pdf')!.async('nodebuffer');
    expect(addedContent.toString()).toBe('added');

    const originalContent = await zip.file('original.pdf')!.async('nodebuffer');
    expect(originalContent.toString()).toBe('original');
  });

  it('should overwrite existing entry with same name', async () => {
    const initial = await zipDocuments([
      { name: 'file.pdf', buffer: Buffer.from('v1') },
    ]);

    const updated = await addToZip(initial, [
      { name: 'file.pdf', buffer: Buffer.from('v2') },
    ]);

    const zip = await JSZip.loadAsync(updated);
    const content = await zip.file('file.pdf')!.async('nodebuffer');
    expect(content.toString()).toBe('v2');
  });
});
