/**
 * Document Processor
 *
 * TXT and Markdown work. PDF and DOCX go through dynamic imports of `pdf-parse`
 * and `mammoth`, which no template declares as dependencies: in a generated
 * project those two throw DocumentProcessingError on the first document.
 *
 * The aiSearch module is out of service pending replacement, so the two missing
 * dependencies are not being added.
 */

import { DocumentFormat, ExtractedContent, DocumentProcessingError } from './types';

// Dynamic imports for optional dependencies
let pdfParse: typeof import('pdf-parse') | null = null;
let mammoth: typeof import('mammoth') | null = null;

/**
 * Detect document format from filename or MIME type
 */
export function detectFormat(filename: string, mimeType?: string): DocumentFormat {
  const ext = filename.toLowerCase().split('.').pop();

  if (mimeType) {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (mimeType === 'text/plain') return 'txt';
    if (mimeType === 'text/markdown') return 'md';
  }

  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'docx':
      return 'docx';
    case 'txt':
      return 'txt';
    case 'md':
    case 'markdown':
      return 'md';
    default:
      return 'txt'; // Default to plain text
  }
}

/**
 * Extract text from a PDF file
 */
async function extractFromPdf(
  buffer: Buffer,
  documentId: string
): Promise<ExtractedContent> {
  if (!pdfParse) {
    try {
      pdfParse = (await import('pdf-parse')).default;
    } catch {
      throw new DocumentProcessingError(
        'pdf-parse library not installed. Run: npm install pdf-parse',
        documentId,
        'extraction'
      );
    }
  }

  try {
    const data = await pdfParse(buffer);

    return {
      text: data.text,
      metadata: {
        pageCount: data.numpages,
        wordCount: countWords(data.text),
        format: 'pdf',
      },
    };
  } catch (error) {
    throw new DocumentProcessingError(
      `Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
      documentId,
      'extraction',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Extract text from a DOCX file
 */
async function extractFromDocx(
  buffer: Buffer,
  documentId: string
): Promise<ExtractedContent> {
  if (!mammoth) {
    try {
      mammoth = await import('mammoth');
    } catch {
      throw new DocumentProcessingError(
        'mammoth library not installed. Run: npm install mammoth',
        documentId,
        'extraction'
      );
    }
  }

  try {
    const result = await mammoth.extractRawText({ buffer });

    return {
      text: result.value,
      metadata: {
        wordCount: countWords(result.value),
        format: 'docx',
      },
    };
  } catch (error) {
    throw new DocumentProcessingError(
      `Failed to parse DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`,
      documentId,
      'extraction',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Extract text from plain text or markdown
 */
function extractFromText(
  buffer: Buffer,
  format: 'txt' | 'md'
): ExtractedContent {
  const text = buffer.toString('utf-8');

  return {
    text,
    metadata: {
      wordCount: countWords(text),
      format,
    },
  };
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Extract text content from a document buffer
 */
export async function extractContent(
  buffer: Buffer,
  filename: string,
  documentId: string,
  mimeType?: string
): Promise<ExtractedContent> {
  const format = detectFormat(filename, mimeType);

  switch (format) {
    case 'pdf':
      return extractFromPdf(buffer, documentId);
    case 'docx':
      return extractFromDocx(buffer, documentId);
    case 'txt':
    case 'md':
      return extractFromText(buffer, format);
    default:
      throw new DocumentProcessingError(
        `Unsupported document format: ${format}`,
        documentId,
        'extraction'
      );
  }
}

/**
 * Document Processor class for more control
 */
export class DocumentProcessor {
  /**
   * Extract content from a file buffer
   */
  async extract(
    buffer: Buffer,
    filename: string,
    documentId: string,
    mimeType?: string
  ): Promise<ExtractedContent> {
    return extractContent(buffer, filename, documentId, mimeType);
  }

  /**
   * Check if a format is supported
   */
  isSupported(filename: string): boolean {
    const format = detectFormat(filename);
    return ['pdf', 'docx', 'txt', 'md'].includes(format);
  }

  /**
   * Get supported formats
   */
  getSupportedFormats(): DocumentFormat[] {
    return ['pdf', 'docx', 'txt', 'md'];
  }
}
