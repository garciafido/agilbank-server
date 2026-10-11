/**
 * Document Processing Types
 */

/**
 * Supported document formats
 */
export type DocumentFormat = 'pdf' | 'docx' | 'txt' | 'md';

/**
 * Result of extracting text from a document
 */
export interface ExtractedContent {
  text: string;
  metadata: {
    pageCount?: number;
    wordCount: number;
    format: DocumentFormat;
  };
}

/**
 * Options for document processing
 */
export interface ProcessingOptions {
  /**
   * Maximum tokens per chunk (default: 500)
   */
  maxTokensPerChunk?: number;

  /**
   * Overlap between chunks in tokens (default: 50)
   */
  overlapTokens?: number;

  /**
   * Include page numbers in chunk metadata
   */
  includePageNumbers?: boolean;

  /**
   * Semantic content type (legal, technical, contract, manual, general)
   * Included in chunk metadata for RAG context
   */
  contentType?: string;

  /**
   * Document name for citation in RAG responses
   * Included in chunk metadata
   */
  documentName?: string;
}

/**
 * Status of document indexing
 */
export interface IndexingResult {
  success: boolean;
  documentId: string;
  chunkCount: number;
  totalTokens: number;
  error?: string;
}

/**
 * Error thrown during document processing
 */
export class DocumentProcessingError extends Error {
  constructor(
    message: string,
    public readonly documentId: string,
    public readonly phase: 'extraction' | 'chunking' | 'embedding' | 'storage',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DocumentProcessingError';
  }
}
