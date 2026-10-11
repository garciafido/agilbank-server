/**
 * Content Type Detector
 *
 * Automatically detects the semantic type of document content
 * based on patterns, keywords, and structure.
 */

export type ContentType = 'legal' | 'technical' | 'contract' | 'manual' | 'general';

interface DetectionResult {
  contentType: ContentType;
  confidence: number;
  matchedPatterns: string[];
}

/**
 * Pattern definitions for each content type
 */
const CONTENT_PATTERNS: Record<ContentType, { patterns: RegExp[]; keywords: string[] }> = {
  legal: {
    patterns: [
      /\bArt[íi]culo\s+\d+/gi,
      /\bLey\s+N[°º]?\s*\d+/gi,
      /\bDecreto\s+N[°º]?\s*\d+/gi,
      /\bCONSIDERANDO:/gi,
      /\bVISTO:/gi,
      /\bRESUELVE:/gi,
      /\bDISPONE:/gi,
      /\bPOR TANTO:/gi,
      /\bArt\.\s*\d+[°º]?/gi,
      /\b[Cc]ap[íi]tulo\s+[IVXLCDM]+/gi,
      /\bT[íi]tulo\s+[IVXLCDM]+/gi,
      /\binciso\s+[a-z]\)/gi,
      /\bp[áa]rrafo\s+\d+/gi,
      /\bpropriedad\s+intelectual/gi,
      /\bderechos?\s+de\s+autor/gi,
      /\bcopyright/gi,
      /\bdom[ií]nio\s+p[úu]blico/gi,
    ],
    keywords: [
      'ley', 'decreto', 'resolución', 'artículo', 'disposición',
      'legislación', 'normativa', 'reglamento', 'ordenanza',
      'jurisprudencia', 'código', 'estatuto', 'tribunal',
      'derecho', 'obligación', 'sanción', 'infracción',
    ],
  },
  contract: {
    patterns: [
      /\bENTRE:/gi,
      /\bCL[ÁA]USULA\s+(PRIMERA|SEGUNDA|TERCERA|\d+)/gi,
      /\bPARTE\s+(CONTRATANTE|CEDENTE|CESIONARIO)/gi,
      /\bOBJETO\s+DEL\s+CONTRATO/gi,
      /\bTÉRMINOS\s+Y\s+CONDICIONES/gi,
      /\bEN\s+TESTIMONIO/gi,
      /\bOBLIGACIONES\s+DE\s+LAS\s+PARTES/gi,
      /\bVIGENCIA/gi,
      /\bRESCISI[ÓO]N/gi,
      /\bPENALIDADES/gi,
    ],
    keywords: [
      'contrato', 'convenio', 'acuerdo', 'licencia', 'cesión',
      'partes', 'cláusula', 'estipulación', 'vigencia',
      'rescisión', 'penalidad', 'contraprestación',
    ],
  },
  technical: {
    patterns: [
      /\bAPI\b/g,
      /\bHTTP[S]?\b/g,
      /\bJSON\b/g,
      /\bXML\b/g,
      /\bSQL\b/g,
      /\bfunction\s+\w+\s*\(/g,
      /\bclass\s+\w+/g,
      /\binterface\s+\w+/g,
      /\bconst\s+\w+\s*=/g,
      /```[\w]*\n/g,
      /\bRESTful\b/gi,
      /\bGraphQL\b/gi,
    ],
    keywords: [
      'api', 'endpoint', 'request', 'response', 'server',
      'database', 'query', 'function', 'method', 'class',
      'variable', 'parameter', 'authentication', 'authorization',
    ],
  },
  manual: {
    patterns: [
      /\bPaso\s+\d+:/gi,
      /\bCapítulo\s+\d+/gi,
      /\bSección\s+\d+(\.\d+)?/gi,
      /\bInstrucciones/gi,
      /\bProcedimiento/gi,
      /\bNota:/gi,
      /\bAdvertencia:/gi,
      /\bImportante:/gi,
      /^\s*\d+\.\s+/gm,
      /^\s*[•\-\*]\s+/gm,
    ],
    keywords: [
      'manual', 'guía', 'instructivo', 'procedimiento', 'paso',
      'instrucciones', 'tutorial', 'referencia', 'apéndice',
    ],
  },
  general: {
    patterns: [],
    keywords: [],
  },
};

/**
 * Detect content type from text
 */
export function detectContentType(text: string): DetectionResult {
  const scores: Record<ContentType, { score: number; matches: string[] }> = {
    legal: { score: 0, matches: [] },
    contract: { score: 0, matches: [] },
    technical: { score: 0, matches: [] },
    manual: { score: 0, matches: [] },
    general: { score: 0, matches: [] },
  };

  const lowerText = text.toLowerCase();
  const sampleText = text.slice(0, 10000); // Analyze first 10k chars for performance

  // Check patterns and keywords for each type
  for (const [type, config] of Object.entries(CONTENT_PATTERNS) as [ContentType, typeof CONTENT_PATTERNS['legal']][]) {
    if (type === 'general') continue;

    // Pattern matching (high weight)
    for (const pattern of config.patterns) {
      const matches = sampleText.match(pattern);
      if (matches) {
        scores[type].score += matches.length * 3;
        scores[type].matches.push(`pattern:${pattern.source.slice(0, 20)}(${matches.length})`);
      }
    }

    // Keyword matching (lower weight)
    for (const keyword of config.keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = lowerText.match(regex);
      if (matches) {
        scores[type].score += matches.length;
        if (matches.length >= 3) {
          scores[type].matches.push(`keyword:${keyword}(${matches.length})`);
        }
      }
    }
  }

  // Find the type with highest score
  let maxType: ContentType = 'general';
  let maxScore = 0;

  for (const [type, data] of Object.entries(scores) as [ContentType, typeof scores['legal']][]) {
    if (data.score > maxScore) {
      maxScore = data.score;
      maxType = type;
    }
  }

  // Calculate confidence (0-1)
  const confidence = Math.min(maxScore / 50, 1);

  // If confidence is too low, default to general
  if (confidence < 0.1) {
    return {
      contentType: 'general',
      confidence: 0,
      matchedPatterns: [],
    };
  }

  return {
    contentType: maxType,
    confidence,
    matchedPatterns: scores[maxType].matches.slice(0, 5),
  };
}

/**
 * Detect content type from file mimetype
 * Returns a hint that can be used alongside text analysis
 */
export function getContentTypeHintFromMimetype(mimetype: string): ContentType | null {
  const mimeHints: Record<string, ContentType> = {
    'application/pdf': null as any, // PDFs can be anything
    'text/plain': null as any,
    'application/msword': null as any,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': null as any,
    'text/markdown': 'technical',
    'application/json': 'technical',
    'text/xml': 'technical',
    'application/xml': 'technical',
  };

  return mimeHints[mimetype] ?? null;
}
