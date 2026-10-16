# Pipelines

Documentacion de todos los pipelines del sistema.

## Indice

- [AbStatementRead](#abstatementread)

---

## AbStatementRead {#abstatementread}



### Parametros

| Parametro | Tipo |
|-----------|------|
| fields | [{"name":"statementId","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[256,18],"end":[256,24],"line":"    statementId = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"statementId","start":[256,4],"end":[256,15],"line":"    statementId = string"}}] |
| fieldsByName | {"statementId":{"name":"statementId","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[256,18],"end":[256,24],"line":"    statementId = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"statementId","start":[256,4],"end":[256,15],"line":"    statementId = string"}}} |
### Retorno

| Campo | Tipo |
|-------|------|
| fields | [{"name":"status","typeDefinition":{"type":"Identifier","name":"read","sourceToken":{"string":"read","start":[259,13],"end":[259,17],"line":"    status = read.status"}},"baseType":"read","attributes":{"status":{"type":"BooleanLiteral","value":true,"sourceToken":{"string":"status","start":[259,18],"end":[259,24],"line":"    status = read.status"}}},"sourceToken":{"string":"status","start":[259,4],"end":[259,10],"line":"    status = read.status"}}] |
| fieldsByName | {"status":{"name":"status","typeDefinition":{"type":"Identifier","name":"read","sourceToken":{"string":"read","start":[259,13],"end":[259,17],"line":"    status = read.status"}},"baseType":"read","attributes":{"status":{"type":"BooleanLiteral","value":true,"sourceToken":{"string":"status","start":[259,18],"end":[259,24],"line":"    status = read.status"}}},"sourceToken":{"string":"status","start":[259,4],"end":[259,10],"line":"    status = read.status"}}} |
### Tasks

#### 1. read

**Ejecucion:** `worker` (asincrono)
**Parametros:**
- `statementId` = ref
**Retorno:**
- `fields`: [{"name":"status","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[280,17],"end":[280,23],"line":"        status = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"status","start":[280,8],"end":[280,14],"line":"        status = string"}}]
- `fieldsByName`: {"status":{"name":"status","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[280,17],"end":[280,23],"line":"        status = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"status","start":[280,8],"end":[280,14],"line":"        status = string"}}}


