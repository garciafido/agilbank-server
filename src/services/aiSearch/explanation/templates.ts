/**
 * Query Explanation Templates
 *
 * Localized templates for generating human-readable explanations
 * of AI Search tool calls.
 */

type SupportedLanguage = 'es' | 'en' | 'pt';

// ============================================
// Operator Labels
// ============================================

export const OPERATOR_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  es: {
    equals: 'igual a',
    contains: 'que contiene',
    startsWith: 'que comienza con',
    endsWith: 'que termina con',
    gt: 'mayor que',
    gte: 'mayor o igual a',
    lt: 'menor que',
    lte: 'menor o igual a',
    in: 'uno de',
    isNull: 'vacío',
    isNotNull: 'con valor',
  },
  en: {
    equals: 'equal to',
    contains: 'containing',
    startsWith: 'starting with',
    endsWith: 'ending with',
    gt: 'greater than',
    gte: 'greater than or equal to',
    lt: 'less than',
    lte: 'less than or equal to',
    in: 'one of',
    isNull: 'empty',
    isNotNull: 'with value',
  },
  pt: {
    equals: 'igual a',
    contains: 'contendo',
    startsWith: 'começando com',
    endsWith: 'terminando com',
    gt: 'maior que',
    gte: 'maior ou igual a',
    lt: 'menor que',
    lte: 'menor ou igual a',
    in: 'um de',
    isNull: 'vazio',
    isNotNull: 'com valor',
  },
};

// ============================================
// Relation Mode Labels
// ============================================

export const RELATION_MODE_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  es: {
    some: 'al menos uno',
    every: 'todos',
    none: 'ninguno',
  },
  en: {
    some: 'at least one',
    every: 'all',
    none: 'none',
  },
  pt: {
    some: 'pelo menos um',
    every: 'todos',
    none: 'nenhum',
  },
};

// ============================================
// Tool Labels
// ============================================

export const TOOL_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  es: {
    query_entities: 'Consultar registros',
    count_entities: 'Contar registros',
    get_lookup_values: 'Obtener valores de catálogo',
    search_documents: 'Buscar en documentos',
    next_page: 'Siguiente página',
  },
  en: {
    query_entities: 'Query records',
    count_entities: 'Count records',
    get_lookup_values: 'Get catalog values',
    search_documents: 'Search documents',
    next_page: 'Next page',
  },
  pt: {
    query_entities: 'Consultar registros',
    count_entities: 'Contar registros',
    get_lookup_values: 'Obter valores de catálogo',
    search_documents: 'Buscar em documentos',
    next_page: 'Próxima página',
  },
};

// ============================================
// Action Templates
// ============================================

interface ActionTemplates {
  query_entities: {
    base: string;
    withIncludes: string;
    withFilters: string;
    result: string;
    resultWithMore: string;
  };
  count_entities: {
    base: string;
    withGroupBy: string;
    withCountRelation: string;
    withHaving: string;
    result: string;
    resultGrouped: string;
  };
  get_lookup_values: {
    base: string;
    result: string;
  };
  search_documents: {
    base: string;
    result: string;
  };
  next_page: {
    base: string;
    result: string;
  };
}

export const ACTION_TEMPLATES: Record<SupportedLanguage, ActionTemplates> = {
  es: {
    query_entities: {
      base: 'Busqué {entityLabel}',
      withIncludes: 'incluyendo {includeChain}',
      withFilters: 'que cumplan: {filterList}',
      result: 'Encontré {count} {entityLabel}',
      resultWithMore: 'Encontré {count} {entityLabel} (hay más resultados)',
    },
    count_entities: {
      base: 'Conté {entityLabel}',
      withGroupBy: 'agrupados por {fieldLabel}',
      withCountRelation: 'contando sus {relationLabel}',
      withHaving: 'filtrando los que tienen {operatorLabel} {value}',
      result: '{count} {entityLabel} en total',
      resultGrouped: '{count} grupos encontrados',
    },
    get_lookup_values: {
      base: 'Consulté valores de {entityLabel}',
      result: 'Obtuve {count} opciones disponibles',
    },
    search_documents: {
      base: 'Busqué en documentos: "{query}"',
      result: 'Encontré {count} fragmentos relevantes',
    },
    next_page: {
      base: 'Cargué la siguiente página',
      result: 'Obtuve {count} resultados adicionales',
    },
  },
  en: {
    query_entities: {
      base: 'Searched for {entityLabel}',
      withIncludes: 'including {includeChain}',
      withFilters: 'matching: {filterList}',
      result: 'Found {count} {entityLabel}',
      resultWithMore: 'Found {count} {entityLabel} (more results available)',
    },
    count_entities: {
      base: 'Counted {entityLabel}',
      withGroupBy: 'grouped by {fieldLabel}',
      withCountRelation: 'counting their {relationLabel}',
      withHaving: 'filtering those with {operatorLabel} {value}',
      result: '{count} {entityLabel} total',
      resultGrouped: '{count} groups found',
    },
    get_lookup_values: {
      base: 'Retrieved {entityLabel} values',
      result: 'Got {count} available options',
    },
    search_documents: {
      base: 'Searched documents for: "{query}"',
      result: 'Found {count} relevant fragments',
    },
    next_page: {
      base: 'Loaded next page',
      result: 'Got {count} additional results',
    },
  },
  pt: {
    query_entities: {
      base: 'Busquei {entityLabel}',
      withIncludes: 'incluindo {includeChain}',
      withFilters: 'que atendam: {filterList}',
      result: 'Encontrei {count} {entityLabel}',
      resultWithMore: 'Encontrei {count} {entityLabel} (há mais resultados)',
    },
    count_entities: {
      base: 'Contei {entityLabel}',
      withGroupBy: 'agrupados por {fieldLabel}',
      withCountRelation: 'contando seus {relationLabel}',
      withHaving: 'filtrando os que têm {operatorLabel} {value}',
      result: '{count} {entityLabel} no total',
      resultGrouped: '{count} grupos encontrados',
    },
    get_lookup_values: {
      base: 'Consultei valores de {entityLabel}',
      result: 'Obtive {count} opções disponíveis',
    },
    search_documents: {
      base: 'Busquei em documentos: "{query}"',
      result: 'Encontrei {count} fragmentos relevantes',
    },
    next_page: {
      base: 'Carreguei a próxima página',
      result: 'Obtive {count} resultados adicionais',
    },
  },
};

// ============================================
// Summary Templates
// ============================================

export const SUMMARY_TEMPLATES: Record<SupportedLanguage, Record<string, string>> = {
  es: {
    singleQuery: 'Busqué {entityLabel}',
    singleCount: 'Conté {entityLabel}',
    multipleTools: 'Realicé {count} consultas',
    withLookup: 'Consulté catálogos y busqué {entityLabel}',
    documentSearch: 'Busqué en documentos',
  },
  en: {
    singleQuery: 'Searched for {entityLabel}',
    singleCount: 'Counted {entityLabel}',
    multipleTools: 'Performed {count} queries',
    withLookup: 'Checked catalogs and searched for {entityLabel}',
    documentSearch: 'Searched documents',
  },
  pt: {
    singleQuery: 'Busquei {entityLabel}',
    singleCount: 'Contei {entityLabel}',
    multipleTools: 'Realizei {count} consultas',
    withLookup: 'Consultei catálogos e busquei {entityLabel}',
    documentSearch: 'Busquei em documentos',
  },
};

// ============================================
// Helper Functions
// ============================================

/**
 * Get operator label for a given language
 */
export function getOperatorLabel(operator: string, language: string): string {
  const lang = (language as SupportedLanguage) || 'es';
  return OPERATOR_LABELS[lang]?.[operator] || OPERATOR_LABELS.es[operator] || operator;
}

/**
 * Get relation mode label for a given language
 */
export function getRelationModeLabel(mode: string, language: string): string {
  const lang = (language as SupportedLanguage) || 'es';
  return RELATION_MODE_LABELS[lang]?.[mode] || RELATION_MODE_LABELS.es[mode] || mode;
}

/**
 * Get tool label for a given language
 */
export function getToolLabel(toolName: string, language: string): string {
  const lang = (language as SupportedLanguage) || 'es';
  return TOOL_LABELS[lang]?.[toolName] || TOOL_LABELS.es[toolName] || toolName;
}

/**
 * Get action templates for a given language
 */
export function getActionTemplates(language: string): ActionTemplates {
  const lang = (language as SupportedLanguage) || 'es';
  return ACTION_TEMPLATES[lang] || ACTION_TEMPLATES.es;
}

/**
 * Get summary templates for a given language
 */
export function getSummaryTemplates(language: string): Record<string, string> {
  const lang = (language as SupportedLanguage) || 'es';
  return SUMMARY_TEMPLATES[lang] || SUMMARY_TEMPLATES.es;
}

/**
 * Interpolate template with values
 */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? key));
}
