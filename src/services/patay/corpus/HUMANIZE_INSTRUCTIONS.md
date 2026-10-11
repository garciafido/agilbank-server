# Test Corpus Humanization Instructions

Use these instructions with any LLM to improve the naturalness of generated test queries.

## Context

The file `test-corpus.json` contains automatically generated queries for testing an AI search system. These queries are syntactically correct but may sound robotic or unnatural.

Your task is to rewrite each query to sound more natural while preserving:
1. The exact semantic meaning
2. The target entity and relationship
3. The language (es/en/pt)

## Input Format

Each test case has queries in 3 languages:

```json
{
  "id": "plural_to_work_1",
  "queries": {
    "es": "los autores del trabajo \"[Work example]\"",
    "en": "the authors of the work \"[Work example]\"",
    "pt": "os autores do trabalho \"[Work example]\""
  }
}
```

## Output Format

Return the same structure with humanized queries:

```json
{
  "id": "plural_to_work_1",
  "queries": {
    "es": "¿Quiénes escribieron la obra \"[Work example]\"?",
    "en": "Who wrote the work \"[Work example]\"?",
    "pt": "Quem escreveu a obra \"[Work example]\"?"
  }
}
```

## Guidelines

### Spanish (es)
- Use question marks: ¿...?
- Vary between formal and informal register
- Use natural word order (not literal translations)
- Examples of natural variations:
  - "los autores de X" → "¿quiénes son los autores de X?" / "¿quién escribió X?"
  - "cuántos trabajos hay" → "¿cuántas obras tenemos?" / "cantidad de trabajos"
  - "trabajos agrupados por género" → "¿cuántos trabajos hay por género?"

### English (en)
- Use question format when appropriate
- Vary sentence structure
- Use contractions naturally
- Examples:
  - "the authors of X" → "who wrote X?" / "who are the authors of X?"
  - "how many works are there" → "what's the total count of works?"
  - "works grouped by genre" → "how many works per genre?"

### Portuguese (pt)
- Use question marks
- Match Brazilian Portuguese conventions
- Examples:
  - "os autores de X" → "quem são os autores de X?" / "quem escreveu X?"
  - "quantos trabalhos existem" → "qual é o total de trabalhos?"

## Constraints

1. **Preserve semantics**: The humanized query MUST trigger the same database operation
2. **Keep placeholders**: Leave `[Entity example]` placeholders unchanged
3. **Match language**: Each language should sound native, not translated
4. **Maintain variety**: Don't use the same pattern for all queries of the same type

## Example Batch

**Input:**
```json
[
  {
    "id": "entity_list_work_1",
    "queries": {
      "es": "listar todos los trabajos",
      "en": "list all works",
      "pt": "listar todos os trabalhos"
    }
  },
  {
    "id": "count_entity_author_1",
    "queries": {
      "es": "¿cuántos autores hay?",
      "en": "how many authors are there?",
      "pt": "quantos autores existem?"
    }
  }
]
```

**Output:**
```json
[
  {
    "id": "entity_list_work_1",
    "queries": {
      "es": "mostrar todas las obras",
      "en": "show me all the works",
      "pt": "mostre todos os trabalhos"
    }
  },
  {
    "id": "count_entity_author_1",
    "queries": {
      "es": "¿cuántos autores tenemos registrados?",
      "en": "what's the total number of authors?",
      "pt": "qual é o número total de autores?"
    }
  }
]
```

## Usage

1. Open the LLM of your choice (Claude, GPT-4, etc.)
2. Paste these instructions
3. Paste the `testCases` array from `test-corpus.json`
4. Request humanization
5. Replace the original queries with the humanized versions
6. Optionally, keep both versions for A/B testing
