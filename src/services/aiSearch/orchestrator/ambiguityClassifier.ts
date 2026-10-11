/**
 * Ambiguity Classifier for AI Search
 *
 * Pre-processes user queries to detect ambiguity BEFORE the main LLM executes.
 * Based on AmbiSQL research (Alibaba, 2025) which achieved 87.2% precision.
 *
 * DESIGN DECISION (2025-01):
 * We chose Option A (LLM-based classifier) over rule-based detection because:
 * 1. Higher precision - LLM understands semantic ambiguity, not just patterns
 * 2. Adaptable - works across different project schemas without custom rules
 * 3. Cost acceptable - ~0.001 USD per classification with fast models (Haiku/Flash)
 * 4. Latency acceptable - +200-400ms is negligible for user experience
 *
 * Alternative considered but rejected:
 * - Rule-based classifier: Fast but limited to predefined patterns, misses semantic ambiguity
 * - Hybrid approach: Added complexity without significant benefit
 *
 * References:
 * - AmbiSQL: https://arxiv.org/html/2508.15276
 * - PRACTIQ: https://arxiv.org/html/2410.11076v1
 * - Google Cloud NL2SQL: https://cloud.google.com/blog/products/databases/techniques-for-improving-text-to-sql
 */

import { ILlmProvider } from '../llmProviders';
import { VisibleSchema } from '../security/types';
import { buildRichSchemaContext } from '../../patay';

/**
 * Ambiguity dimension based on AmbiSQL bidimensional taxonomy
 *
 * DB-related: Schema/data-centric issues detectable via heuristics
 * LLM-related: Reasoning/knowledge issues requiring LLM analysis
 */
export type AmbiguityDimension = 'db_related' | 'llm_related' | null;

/**
 * Types of ambiguity based on AmbiSQL + PRACTIQ bidimensional taxonomy
 *
 * DB-related types (deterministic detection):
 * - unclear_schema_ref: Label maps to multiple fields (was: column_ambiguity)
 * - unclear_value_ref: Value doesn't match catalog (was: value_ambiguity)
 * - missing_sql_keywords: Ambiguous operation without keywords like "ordenados", "agrupados"
 *
 * LLM-related types (requires LLM analysis):
 * - unclear_knowledge_source: Query needs external knowledge vs DB data
 * - insufficient_reasoning: Subjective qualifiers without criteria (was: unknown_term)
 * - conflicting_knowledge: User assumption contradicts known facts
 * - temporal_spatial_scope: Vague temporal/spatial references ("reciente", "cerca")
 *
 * Special types:
 * - chart_grouping: Chart requested without groupBy dimension
 * - none: Query is clear
 */
export type AmbiguityType =
  // DB-related (can be detected deterministically)
  | 'unclear_schema_ref'      // Label → multiple fields (was: column_ambiguity)
  | 'unclear_value_ref'       // Value doesn't match catalog (was: value_ambiguity)
  | 'missing_sql_keywords'    // "por fecha" without ORDER BY/GROUP BY context
  // LLM-related (requires semantic understanding)
  | 'unclear_knowledge_source' // Query needs external vs DB knowledge
  | 'insufficient_reasoning'   // Subjective qualifier without criteria (was: unknown_term)
  | 'conflicting_knowledge'    // User assumption contradicts facts
  | 'temporal_spatial_scope'   // "reciente", "cerca" without specifics
  // Special
  | 'chart_grouping'          // Chart requested without groupBy
  // Legacy (kept for backward compatibility)
  | 'unknown_term'            // Alias for insufficient_reasoning
  | 'column_ambiguity'        // Alias for unclear_schema_ref
  | 'value_ambiguity'         // Alias for unclear_value_ref
  | 'operation_ambiguity'     // Alias for missing_sql_keywords
  | 'none';                   // Query is clear

/**
 * Result of ambiguity classification
 */
export interface AmbiguityClassification {
  isAmbiguous: boolean;
  dimension: AmbiguityDimension;  // New: which dimension the ambiguity belongs to
  type: AmbiguityType;
  ambiguousTerm?: string;
  reason?: string;
  suggestedOptions?: string[];
  clarificationQuestion?: string;
}

/**
 * Map legacy types to new taxonomy
 */
function normalizeAmbiguityType(type: AmbiguityType): { type: AmbiguityType; dimension: AmbiguityDimension } {
  switch (type) {
    // DB-related
    case 'column_ambiguity':
    case 'unclear_schema_ref':
      return { type: 'unclear_schema_ref', dimension: 'db_related' };
    case 'value_ambiguity':
    case 'unclear_value_ref':
      return { type: 'unclear_value_ref', dimension: 'db_related' };
    case 'operation_ambiguity':
    case 'missing_sql_keywords':
      return { type: 'missing_sql_keywords', dimension: 'db_related' };
    // LLM-related
    case 'unknown_term':
    case 'insufficient_reasoning':
      return { type: 'insufficient_reasoning', dimension: 'llm_related' };
    case 'unclear_knowledge_source':
      return { type: 'unclear_knowledge_source', dimension: 'llm_related' };
    case 'conflicting_knowledge':
      return { type: 'conflicting_knowledge', dimension: 'llm_related' };
    case 'temporal_spatial_scope':
      return { type: 'temporal_spatial_scope', dimension: 'llm_related' };
    // Special
    case 'chart_grouping':
      return { type: 'chart_grouping', dimension: 'db_related' };
    default:
      return { type: 'none', dimension: null };
  }
}

/**
 * Build the classification prompt
 */
function buildClassificationPrompt(
  query: string,
  schema: VisibleSchema,
  glossaryTerms: string[]
): string {
  // Build rich schema context using PATAY (includes ALL entities, relations, lookups)
  const schemaContext = buildRichSchemaContext(schema);

  return `You are a CONSERVATIVE ambiguity classifier for a data query system.

TASK: Analyze if the user query is GENUINELY ambiguous and CANNOT be executed without clarification.

CRITICAL: Default to isAmbiguous: false. Only flag truly problematic queries.

SCHEMA CONTEXT:
${schemaContext.text}
${glossaryTerms.length > 0 ? `\nADDITIONAL TERMS: ${glossaryTerms.join(', ')}` : ''}

AMBIGUITY TAXONOMY (AmbiSQL bidimensional):

== DB-RELATED (schema/data issues) ==

1. UNCLEAR_SCHEMA_REF: Query maps to multiple EQUALLY valid fields
   AMBIGUOUS: "género" → MusicalWork.genre (musical) vs Author.gender (person)
   NOT AMBIGUOUS: "autores de obras" - navigation path is clear

2. UNCLEAR_VALUE_REF: Filter value clearly incomplete or misspelled
   AMBIGUOUS: "obras de NYC" when system has "New York City"
   NOT AMBIGUOUS: "obras de la edición X" - specific value, system will search

3. MISSING_SQL_KEYWORDS: Operation unclear without context keywords
   AMBIGUOUS: "usuarios por fecha" - ORDER BY? GROUP BY? FILTER?
   NOT AMBIGUOUS: "contar obras agrupadas por género" - "agrupadas" = GROUP BY
   NOT AMBIGUOUS: "obras ordenadas por fecha" - "ordenadas" = ORDER BY

== LLM-RELATED (reasoning issues) ==

4. INSUFFICIENT_REASONING: Subjective qualifier without criteria
   AMBIGUOUS: "autores principales" - what makes an author "principal"?
   AMBIGUOUS: "mejores obras" - by what metric? sales? rating? duration?
   NOT AMBIGUOUS: "autores más prolíficos" - can count works

5. UNCLEAR_KNOWLEDGE_SOURCE: Query needs external knowledge
   AMBIGUOUS: "obras de la guerra fría" - DB doesn't have historical period field
   NOT AMBIGUOUS: "obras de 1985" - year is a filterable field

6. TEMPORAL_SPATIAL_SCOPE: Vague temporal/spatial reference
   AMBIGUOUS: "obras recientes" - recent = last week? month? year?
   AMBIGUOUS: "autores cercanos" - close to what?
   NOT AMBIGUOUS: "obras de 2024" - specific year

7. CONFLICTING_KNOWLEDGE: User assumption contradicts known facts
   AMBIGUOUS: "el único autor de la obra" when work has multiple authors
   NOT AMBIGUOUS: factual queries about existing data

== SPECIAL ==

8. CHART_GROUPING: Chart/graph requested without groupBy dimension
   AMBIGUOUS: "gráfico de obras" - chart needs grouping
   NOT AMBIGUOUS: "gráfico de obras por género" - genre is the grouping

EXAMPLES OF CLEAR QUERIES (respond isAmbiguous: false):
- "Listar las relaciones entre autores y obras con sus roles" → Clear
- "Listar autores de obras de una edición" → Clear navigation
- "Contar obras por género" → Clear groupBy
- "Obras del género Rock" → Clear filter
- "Mostrar ediciones con sus obras" → Clear include
- "Máximo número de obras en una edición" → Clear aggregation

USER QUERY: "${query}"

Respond in JSON format:
{
  "isAmbiguous": boolean,
  "type": "insufficient_reasoning" | "unclear_schema_ref" | "unclear_value_ref" | "missing_sql_keywords" | "unclear_knowledge_source" | "temporal_spatial_scope" | "conflicting_knowledge" | "chart_grouping" | "none",
  "ambiguousTerm": "the problematic term if any",
  "reason": "brief explanation",
  "suggestedOptions": ["option1", "option2", "option3"],
  "clarificationQuestion": "Question to ask the user"
}

IMPORTANT - BE CONSERVATIVE:
- When in doubt, respond isAmbiguous: false - let the main LLM handle it
- Only flag queries that GENUINELY cannot be interpreted
- Navigation queries ("X de Y", "X con Y") are almost always clear
- Specific entity references are clear even if the value might not exist
- The main LLM is smart enough to handle most queries - only intervene when truly needed

LANGUAGE RULES:
- ALL output must be in the SAME language as the user query
- If user writes in Spanish, respond ENTIRELY in Spanish`;
}

/**
 * Parse LLM response to AmbiguityClassification
 */
function parseClassificationResponse(response: string): AmbiguityClassification {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { isAmbiguous: false, dimension: null, type: 'none' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const rawType = parsed.type || 'none';

    // Normalize to bidimensional taxonomy
    const { type, dimension } = normalizeAmbiguityType(rawType as AmbiguityType);

    return {
      isAmbiguous: Boolean(parsed.isAmbiguous),
      dimension: parsed.isAmbiguous ? dimension : null,
      type,
      ambiguousTerm: parsed.ambiguousTerm,
      reason: parsed.reason,
      suggestedOptions: parsed.suggestedOptions,
      clarificationQuestion: parsed.clarificationQuestion,
    };
  } catch (error) {
    console.warn('[AmbiguityClassifier] Failed to parse response:', error);
    return { isAmbiguous: false, dimension: null, type: 'none' };
  }
}

/**
 * Classify if a user query is ambiguous
 *
 * @param query - User's natural language query
 * @param llmProvider - LLM provider to use for classification
 * @param schema - Visible schema for context
 * @param glossaryTerms - Additional known terms from project glossary
 * @param signal - AbortSignal for cancelling the request
 * @returns Classification result with clarification question if ambiguous
 */
export async function classifyAmbiguity(
  query: string,
  llmProvider: ILlmProvider,
  schema: VisibleSchema,
  glossaryTerms: string[] = [],
  signal?: AbortSignal
): Promise<AmbiguityClassification> {
  const startTime = Date.now();

  try {
    const prompt = buildClassificationPrompt(query, schema, glossaryTerms);

    const response = await llmProvider.generateCompletion(
      [
        { role: 'system', content: 'You are a precise ambiguity classifier. Respond only in JSON.' },
        { role: 'user', content: prompt },
      ],
      {
        maxTokens: 300,
        temperature: 0.1, // Low temperature for consistent classification
        signal,
      }
    );

    const classification = parseClassificationResponse(response.content);

    const durationMs = Date.now() - startTime;
    const dimStr = classification.dimension ? ` (${classification.dimension})` : '';
    console.log(`[AmbiguityClassifier] Classified in ${durationMs}ms: ${classification.type}${dimStr}`);

    return classification;
  } catch (error) {
    console.error('[AmbiguityClassifier] Classification failed:', error);
    // On error, assume not ambiguous to avoid blocking queries
    return { isAmbiguous: false, dimension: null, type: 'none' };
  }
}

/**
 * Format clarification response for user
 */
export function formatClarificationResponse(classification: AmbiguityClassification): string {
  if (!classification.isAmbiguous || !classification.clarificationQuestion) {
    return '';
  }

  let response = classification.clarificationQuestion;

  // Add options as a simple list (no letters) so user responds naturally
  if (classification.suggestedOptions && classification.suggestedOptions.length > 0) {
    const options = classification.suggestedOptions
      .map(opt => `- ${opt}`)
      .join('\n');
    response += `\n\n${options}`;
  }

  return response;
}
