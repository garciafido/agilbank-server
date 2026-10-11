/**
 * Embedding Service
 *
 * High-level service for generating embeddings with text chunking support.
 * Handles document processing and batching.
 * Supports multiple chunking strategies: auto, by_tokens, by_regex, by_structure.
 */

import { IEmbeddingProvider, ChunkingOptions, ChunkResult, ChunkingStrategy, EmbeddingProviderError } from './types';
import { EmbeddingConfig, EmbeddingResult } from '../types';
import { OpenAIEmbeddingProvider } from './openaiEmbeddings';
import { LocalEmbeddingProvider } from './localEmbeddings';

/**
 * Default chunking configuration
 */
const DEFAULT_CHUNKING: Required<Omit<ChunkingOptions, 'separatorRegex'>> & { separatorRegex?: string } = {
  strategy: 'auto',
  maxTokens: 500,
  overlapTokens: 50,
  separator: 'paragraph',
  separatorRegex: undefined,
};

/**
 * Auto-detection patterns for document types
 */
const AUTO_DETECT_PATTERNS = {
  // Legal/regulatory articles: "Art. 1", "Artículo 1", "Article 1"
  articles: /^Art(?:ículo|igo|icle)?\.?\s*\d+/im,
  // Numbered sections: "1.1", "1.2.3"
  numberedSections: /^\d+(?:\.\d+)+\s+/m,
  // Markdown headings: # ## ###
  markdownHeadings: /^#{1,6}\s+/m,
  // Tables (multiple | in consecutive lines)
  tables: /\|.+\|[\r\n]+\|[-:| ]+\|/m,
  // Bullet lists
  bulletLists: /^[\s]*[-*•]\s+/m,
};

/**
 * Get auto-detected strategy and optional regex based on content
 */
function autoDetectStrategy(content: string): { strategy: ChunkingStrategy; regex?: string } {
  // Check for legal documents with articles in markdown format (H3 with "Art.")
  // This should take priority over generic markdown headings
  if (/^###\s+Art/m.test(content)) {
    return { strategy: 'by_legal' };
  }

  // Check for articles (regulations, laws) - non-markdown format
  if (AUTO_DETECT_PATTERNS.articles.test(content) && !AUTO_DETECT_PATTERNS.markdownHeadings.test(content)) {
    return { strategy: 'by_regex', regex: '^Art(?:ículo|igo|icle)?\\.?\\s*\\d+' };
  }

  // Check for numbered sections
  if (AUTO_DETECT_PATTERNS.numberedSections.test(content)) {
    return { strategy: 'by_regex', regex: '^\\d+(?:\\.\\d+)*\\s+' };
  }

  // Check for markdown headings
  if (AUTO_DETECT_PATTERNS.markdownHeadings.test(content)) {
    return { strategy: 'by_regex', regex: '^#{1,6}\\s+' };
  }

  // Check for tables
  if (AUTO_DETECT_PATTERNS.tables.test(content)) {
    return { strategy: 'by_structure' };
  }

  // Default to token-based chunking
  return { strategy: 'by_tokens' };
}

/**
 * Create an embedding provider based on configuration
 */
export function createEmbeddingProvider(config: EmbeddingConfig): IEmbeddingProvider {
  switch (config.providerCode) {
    case 'openai':
      return new OpenAIEmbeddingProvider(config);
    case 'ollama':
      // Ollama uses OpenAI-compatible API
      return new OpenAIEmbeddingProvider({
        ...config,
        baseUrl: config.baseUrl || 'http://localhost:11434/v1',
        apiKey: config.apiKey || 'ollama', // Ollama doesn't require API key
      });
    case 'voyage':
      // Voyage AI uses OpenAI-compatible API
      throw new EmbeddingProviderError(
        'Voyage provider not yet implemented',
        'voyage'
      );
    case 'local':
      return new LocalEmbeddingProvider(config);
    default:
      throw new EmbeddingProviderError(
        `Unknown embedding provider: ${config.providerCode}`,
        config.providerCode
      );
  }
}

/**
 * Embedding Service class
 */
export class EmbeddingService {
  private provider: IEmbeddingProvider;
  private chunkingOptions: Required<ChunkingOptions>;

  constructor(
    provider: IEmbeddingProvider,
    chunkingOptions?: ChunkingOptions
  ) {
    this.provider = provider;
    this.chunkingOptions = { ...DEFAULT_CHUNKING, ...chunkingOptions };
  }

  /**
   * Get embedding dimensions from the provider
   */
  get dimensions(): number {
    return this.provider.dimensions;
  }

  /**
   * Generate embedding for a single text (document/passage)
   */
  async embed(text: string): Promise<EmbeddingResult> {
    return this.provider.embed(text);
  }

  /**
   * Generate embedding for a search query
   * Uses provider's embedQuery if available, otherwise falls back to embed
   */
  async embedQuery(text: string): Promise<EmbeddingResult> {
    if (this.provider.embedQuery) {
      return this.provider.embedQuery(text);
    }
    return this.provider.embed(text);
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return this.provider.embedBatch(texts);
  }

  /**
   * Chunk a document and generate embeddings for each chunk
   */
  async chunkAndEmbed(
    content: string,
    options?: ChunkingOptions
  ): Promise<{
    chunks: ChunkResult['chunks'];
    embeddings: EmbeddingResult[];
  }> {
    const opts = { ...this.chunkingOptions, ...options };
    const chunkResult = this.chunkText(content, opts);

    const embeddings = await this.provider.embedBatch(
      chunkResult.chunks.map((c) => c.content)
    );

    return {
      chunks: chunkResult.chunks,
      embeddings,
    };
  }

  /**
   * Chunk text into smaller pieces based on strategy and options
   */
  chunkText(content: string, options?: ChunkingOptions): ChunkResult {
    const opts = { ...this.chunkingOptions, ...options };

    // Determine effective strategy
    let effectiveStrategy = opts.strategy || 'auto';
    let effectiveRegex = opts.separatorRegex;

    // Auto-detect strategy if set to auto
    if (effectiveStrategy === 'auto') {
      const detected = autoDetectStrategy(content);
      effectiveStrategy = detected.strategy;
      if (detected.regex && !effectiveRegex) {
        effectiveRegex = detected.regex;
      }
    }

    // Route to appropriate chunking method
    switch (effectiveStrategy) {
      case 'by_regex':
        return this.chunkByRegex(content, effectiveRegex, opts);
      case 'by_structure':
        return this.chunkByStructure(content, opts);
      case 'by_legal':
        return this.chunkByLegalHierarchy(content, opts);
      case 'by_tokens':
      default:
        return this.chunkByTokens(content, opts);
    }
  }

  /**
   * Token-based chunking (original algorithm)
   */
  private chunkByTokens(
    content: string,
    opts: Required<Omit<ChunkingOptions, 'separatorRegex'>> & { separatorRegex?: string }
  ): ChunkResult {
    const chunks: ChunkResult['chunks'] = [];

    // Split by separator
    const segments = this.splitBySeparator(content, opts.separator);

    let currentChunk = '';
    let currentTokens = 0;
    let chunkStart = 0;
    let offset = 0;

    for (const segment of segments) {
      const segmentTokens = this.estimateTokens(segment);

      // If adding this segment would exceed max tokens
      if (currentTokens + segmentTokens > opts.maxTokens && currentChunk) {
        // Save current chunk
        chunks.push({
          content: currentChunk.trim(),
          tokenCount: currentTokens,
          startOffset: chunkStart,
          endOffset: offset,
        });

        // Start new chunk with overlap
        const overlap = this.getOverlapText(currentChunk, opts.overlapTokens);
        currentChunk = overlap + segment;
        currentTokens = this.estimateTokens(currentChunk);
        chunkStart = offset - overlap.length;
      } else {
        currentChunk += segment;
        currentTokens += segmentTokens;
      }

      offset += segment.length;
    }

    // Don't forget the last chunk
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        tokenCount: currentTokens,
        startOffset: chunkStart,
        endOffset: offset,
      });
    }

    return {
      chunks,
      totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
    };
  }

  /**
   * Regex-based chunking - splits by custom regex pattern
   */
  private chunkByRegex(
    content: string,
    regexPattern: string | undefined,
    opts: Required<Omit<ChunkingOptions, 'separatorRegex'>> & { separatorRegex?: string }
  ): ChunkResult {
    if (!regexPattern) {
      // Fallback to token-based if no regex provided
      return this.chunkByTokens(content, opts);
    }

    const chunks: ChunkResult['chunks'] = [];
    const regex = new RegExp(regexPattern, 'gm');

    // Find all matches and their positions
    const matches: { index: number; match: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      matches.push({ index: match.index, match: match[0] });
    }

    if (matches.length === 0) {
      // No matches found, fallback to token-based
      return this.chunkByTokens(content, opts);
    }

    // Split content by regex matches
    for (let i = 0; i < matches.length; i++) {
      const startIndex = matches[i].index;
      const endIndex = i < matches.length - 1 ? matches[i + 1].index : content.length;
      const sectionContent = content.slice(startIndex, endIndex).trim();

      if (!sectionContent) continue;

      const sectionTokens = this.estimateTokens(sectionContent);

      // If section is too large, sub-chunk it
      if (sectionTokens > opts.maxTokens) {
        const subChunks = this.chunkByTokens(sectionContent, opts);
        for (const subChunk of subChunks.chunks) {
          chunks.push({
            ...subChunk,
            startOffset: startIndex + subChunk.startOffset,
            endOffset: startIndex + subChunk.endOffset,
            metadata: { section: matches[i].match.trim() },
          });
        }
      } else {
        chunks.push({
          content: sectionContent,
          tokenCount: sectionTokens,
          startOffset: startIndex,
          endOffset: endIndex,
          metadata: { section: matches[i].match.trim() },
        });
      }
    }

    return {
      chunks,
      totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
    };
  }

  /**
   * Structure-based chunking - detects tables, lists, headings
   */
  private chunkByStructure(
    content: string,
    opts: Required<Omit<ChunkingOptions, 'separatorRegex'>> & { separatorRegex?: string }
  ): ChunkResult {
    const chunks: ChunkResult['chunks'] = [];
    const lines = content.split('\n');

    let currentChunk = '';
    let currentTokens = 0;
    let chunkStart = 0;
    let offset = 0;
    let inTable = false;
    let tableContent = '';
    let tableStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineWithNewline = line + '\n';
      const isTableLine = line.includes('|') && line.trim().startsWith('|');
      const isHeading = /^#{1,6}\s+/.test(line);
      const isBulletStart = /^[\s]*[-*•]\s+/.test(line);

      // Handle table detection
      if (isTableLine && !inTable) {
        // Starting a table - save current chunk first
        if (currentChunk.trim()) {
          chunks.push({
            content: currentChunk.trim(),
            tokenCount: currentTokens,
            startOffset: chunkStart,
            endOffset: offset,
          });
          currentChunk = '';
          currentTokens = 0;
        }
        inTable = true;
        tableStart = offset;
        tableContent = lineWithNewline;
      } else if (isTableLine && inTable) {
        // Continue table
        tableContent += lineWithNewline;
      } else if (!isTableLine && inTable) {
        // End of table
        inTable = false;
        const tableTokens = this.estimateTokens(tableContent);
        chunks.push({
          content: tableContent.trim(),
          tokenCount: tableTokens,
          startOffset: tableStart,
          endOffset: offset,
          metadata: { type: 'table' },
        });
        tableContent = '';
        chunkStart = offset;
      }

      // Handle headings as chunk boundaries
      if (isHeading && !inTable) {
        if (currentChunk.trim()) {
          chunks.push({
            content: currentChunk.trim(),
            tokenCount: currentTokens,
            startOffset: chunkStart,
            endOffset: offset,
          });
        }
        currentChunk = lineWithNewline;
        currentTokens = this.estimateTokens(lineWithNewline);
        chunkStart = offset;
      } else if (!inTable) {
        // Regular content
        const lineTokens = this.estimateTokens(lineWithNewline);

        if (currentTokens + lineTokens > opts.maxTokens && currentChunk.trim()) {
          chunks.push({
            content: currentChunk.trim(),
            tokenCount: currentTokens,
            startOffset: chunkStart,
            endOffset: offset,
          });
          const overlap = this.getOverlapText(currentChunk, opts.overlapTokens);
          currentChunk = overlap + lineWithNewline;
          currentTokens = this.estimateTokens(currentChunk);
          chunkStart = offset - overlap.length;
        } else {
          currentChunk += lineWithNewline;
          currentTokens += lineTokens;
        }
      }

      offset += lineWithNewline.length;
    }

    // Handle remaining content
    if (inTable && tableContent.trim()) {
      const tableTokens = this.estimateTokens(tableContent);
      chunks.push({
        content: tableContent.trim(),
        tokenCount: tableTokens,
        startOffset: tableStart,
        endOffset: offset,
        metadata: { type: 'table' },
      });
    } else if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        tokenCount: currentTokens,
        startOffset: chunkStart,
        endOffset: offset,
      });
    }

    return {
      chunks,
      totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
    };
  }

  /**
   * Legal document chunking - optimized for laws and decrees with hierarchical headings.
   *
   * Strategy:
   * - H3 (articles) always become chunks with breadcrumb context from H1 + H2
   * - H1 and H2 only become chunks if they have content beyond their title line
   * - Each chunk includes the first line of its parent headings as context
   */
  private chunkByLegalHierarchy(
    content: string,
    opts: Required<Omit<ChunkingOptions, 'separatorRegex'>> & { separatorRegex?: string }
  ): ChunkResult {
    const chunks: ChunkResult['chunks'] = [];

    // Parse all headings with their positions
    interface Heading {
      level: number;
      title: string;
      fullLine: string;
      startIndex: number;
      endIndex: number;
      contentStart: number;
    }

    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const headings: Heading[] = [];
    let match: RegExpExecArray | null;

    while ((match = headingRegex.exec(content)) !== null) {
      headings.push({
        level: match[1].length,
        title: match[2].trim(),
        fullLine: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        contentStart: match.index + match[0].length,
      });
    }

    if (headings.length === 0) {
      // No headings found, fallback to token-based
      return this.chunkByTokens(content, opts);
    }

    // Build breadcrumb context for each heading
    const getBreadcrumb = (headingIndex: number): { h1?: string; h2?: string } => {
      const currentLevel = headings[headingIndex].level;
      let h1: string | undefined;
      let h2: string | undefined;

      // Look backwards for parent headings
      for (let i = headingIndex - 1; i >= 0; i--) {
        const h = headings[i];
        if (h.level === 1 && !h1) {
          h1 = h.fullLine;
        } else if (h.level === 2 && !h2 && currentLevel > 2) {
          h2 = h.fullLine;
        }
        // Stop if we've found all parents or hit a same/higher level
        if (h1 && (h2 || currentLevel <= 2)) break;
        if (h.level < currentLevel && h.level === 1) break;
      }

      return { h1, h2 };
    };

    // Extract content for each heading (text between this heading and the next)
    const getHeadingContent = (headingIndex: number): string => {
      const heading = headings[headingIndex];
      const nextHeading = headings[headingIndex + 1];
      const endIndex = nextHeading ? nextHeading.startIndex : content.length;
      return content.slice(heading.startIndex, endIndex).trim();
    };

    // Check if heading has content beyond its title line
    const hasContentBeyondTitle = (headingIndex: number): boolean => {
      const heading = headings[headingIndex];
      const nextHeading = headings[headingIndex + 1];
      const endIndex = nextHeading ? nextHeading.startIndex : content.length;
      const contentAfterTitle = content.slice(heading.endIndex, endIndex).trim();
      return contentAfterTitle.length > 0;
    };

    // Check for content before first heading (intro text)
    if (headings[0].startIndex > 0) {
      const introContent = content.slice(0, headings[0].startIndex).trim();
      if (introContent) {
        const introTokens = this.estimateTokens(introContent);
        chunks.push({
          content: introContent,
          tokenCount: introTokens,
          startOffset: 0,
          endOffset: headings[0].startIndex,
          metadata: { type: 'intro' },
        });
      }
    }

    // Process each heading
    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      const level = heading.level;

      // Rules:
      // - H3+ (articles) always become chunks with breadcrumb
      // - H1 and H2 only become chunks if they have content beyond their title
      const shouldChunk = level >= 3 || hasContentBeyondTitle(i);

      if (!shouldChunk) continue;

      // Build the chunk content with breadcrumb context
      const breadcrumb = getBreadcrumb(i);
      const headingContent = getHeadingContent(i);

      let chunkContent = '';
      if (breadcrumb.h1) {
        chunkContent += breadcrumb.h1 + '\n';
      }
      if (breadcrumb.h2) {
        chunkContent += breadcrumb.h2 + '\n';
      }
      chunkContent += headingContent;

      const chunkTokens = this.estimateTokens(chunkContent);
      const nextHeading = headings[i + 1];
      const endIndex = nextHeading ? nextHeading.startIndex : content.length;

      // Build metadata
      const metadata: Record<string, unknown> = {
        type: level >= 3 ? 'article' : 'section_content',
        level,
      };

      if (breadcrumb.h1) {
        metadata.documentTitle = breadcrumb.h1.replace(/^#+\s*/, '');
      }
      if (breadcrumb.h2) {
        metadata.sectionTitle = breadcrumb.h2.replace(/^#+\s*/, '');
      }
      if (level >= 3) {
        // Extract article number if present
        const artMatch = heading.title.match(/^Art\.?\s*(\d+[°º]?\s*(?:bis|ter|quater|quinquies)?)/i);
        if (artMatch) {
          metadata.articleNumber = artMatch[1];
        }
      }

      // If chunk is too large, sub-divide by paragraphs but keep breadcrumb
      if (chunkTokens > opts.maxTokens) {
        const breadcrumbText = (breadcrumb.h1 ? breadcrumb.h1 + '\n' : '') +
                               (breadcrumb.h2 ? breadcrumb.h2 + '\n' : '') +
                               heading.fullLine + '\n';
        const breadcrumbTokens = this.estimateTokens(breadcrumbText);
        const availableTokens = opts.maxTokens - breadcrumbTokens;

        // Get content after the heading line
        const contentAfterHeading = content.slice(heading.endIndex, endIndex).trim();
        const paragraphs = contentAfterHeading.split(/\n\n+/).filter(p => p.trim());

        let currentContent = '';
        let currentTokens = 0;
        let subChunkIndex = 0;

        for (const para of paragraphs) {
          const paraTokens = this.estimateTokens(para);

          if (currentTokens + paraTokens > availableTokens && currentContent) {
            // Save current sub-chunk
            chunks.push({
              content: breadcrumbText + currentContent.trim(),
              tokenCount: breadcrumbTokens + currentTokens,
              startOffset: heading.startIndex,
              endOffset: endIndex,
              metadata: { ...metadata, subChunk: subChunkIndex++ },
            });
            currentContent = para + '\n\n';
            currentTokens = paraTokens;
          } else {
            currentContent += para + '\n\n';
            currentTokens += paraTokens;
          }
        }

        // Don't forget last sub-chunk
        if (currentContent.trim()) {
          chunks.push({
            content: breadcrumbText + currentContent.trim(),
            tokenCount: breadcrumbTokens + currentTokens,
            startOffset: heading.startIndex,
            endOffset: endIndex,
            metadata: subChunkIndex > 0 ? { ...metadata, subChunk: subChunkIndex } : metadata,
          });
        }
      } else {
        chunks.push({
          content: chunkContent,
          tokenCount: chunkTokens,
          startOffset: heading.startIndex,
          endOffset: endIndex,
          metadata,
        });
      }
    }

    return {
      chunks,
      totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
    };
  }

  private splitBySeparator(
    content: string,
    separator: ChunkingOptions['separator']
  ): string[] {
    switch (separator) {
      case 'paragraph':
        // Split by double newlines, keep the separator
        return content.split(/(\n\n+)/).filter(Boolean);
      case 'sentence':
        // Split by sentence-ending punctuation
        return content.split(/(?<=[.!?])\s+/).filter(Boolean);
      case 'token':
        // Split by words (rough approximation)
        return content.split(/(\s+)/).filter(Boolean);
      default:
        return [content];
    }
  }

  private getOverlapText(text: string, overlapTokens: number): string {
    if (overlapTokens <= 0) return '';

    const words = text.split(/\s+/);
    // Approximate: 1 word ≈ 1.3 tokens
    const wordsToTake = Math.ceil(overlapTokens / 1.3);
    const overlapWords = words.slice(-wordsToTake);

    return overlapWords.join(' ') + ' ';
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }
}
