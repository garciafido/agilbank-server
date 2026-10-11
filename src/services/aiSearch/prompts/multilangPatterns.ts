/**
 * GENERATED FILE - DO NOT EDIT
 *
 * Multilingual navigation patterns for AI Search.
 * Contains pre-built examples in es, en, pt.
 *
 * Usage:
 *   import { getPatterns, SupportedLang } from './multilangPatterns';
 *   const patterns = getPatterns('es'); // or 'en', 'pt'
 */

export type SupportedLang = "es" | "en" | "pt";

export interface PatternExample {
  patternId: string;
  userQuery: string;
  think: string;
  correctCall: string;
  because: string;
}

export interface LangPatterns {
  examples: PatternExample[];
  criticalDistinctions: string[];
  sectionHeader: string;
}

const patterns: Record<SupportedLang, LangPatterns> = {
  es: {
    examples: [],
    criticalDistinctions: [
      'CRÍTICO: "X de Y de Z" → UNA query con filters + include anidado',
      "INCORRECTO: Múltiples queries secuenciales",
      'CORRECTO: query_entities(entity="Z", filters=[...], include=[{field: "Y.X"}])',
    ],
    sectionHeader: "## Patrones de Navegación",
  },
  en: {
    examples: [],
    criticalDistinctions: [
      'CRITICAL: "X of Y of Z" → ONE query with filters + nested include',
      "WRONG: Multiple sequential queries",
      'RIGHT: query_entities(entity="Z", filters=[...], include=[{field: "Y.X"}])',
    ],
    sectionHeader: "## Navigation Patterns",
  },
  pt: {
    examples: [],
    criticalDistinctions: [
      'CRÍTICO: "X de Y de Z" → UMA query com filters + include aninhado',
      "ERRADO: Múltiplas queries sequenciais",
      'CERTO: query_entities(entity="Z", filters=[...], include=[{field: "Y.X"}])',
    ],
    sectionHeader: "## Padrões de Navegação",
  },
};

/**
 * Get patterns for a specific language.
 * Defaults to 'es' if language is not recognized.
 */
export function getPatterns(lang?: SupportedLang | string): LangPatterns {
  if (lang === "en" || lang === "pt") {
    return patterns[lang];
  }
  return patterns.es;
}

/**
 * Format patterns as prompt text for a specific language.
 */
export function formatPatternsAsPrompt(lang?: SupportedLang | string): string {
  const p = getPatterns(lang);
  const lines: string[] = [];

  lines.push(p.sectionHeader);
  lines.push("");

  for (const ex of p.examples) {
    lines.push(`### ${ex.patternId}`);
    lines.push(`Query: "${ex.userQuery}"`);
    lines.push(`Think: ${ex.think}`);
    lines.push(`✓ ${ex.correctCall}`);
    lines.push(`Because: ${ex.because}`);
    lines.push("");
  }

  if (p.criticalDistinctions.length > 0) {
    lines.push("**Critical Distinctions:**");
    for (const d of p.criticalDistinctions) {
      lines.push(`- ${d}`);
    }
  }

  return lines.join("\n");
}
