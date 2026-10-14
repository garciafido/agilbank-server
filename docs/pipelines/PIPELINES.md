# Pipelines

Documentacion de todos los pipelines del sistema.

## Indice

- [AbStatementRead](#abstatementread)

---

## AbStatementRead {#abstatementread}



### Parametros

| Parametro | Tipo |
|-----------|------|
| fields | [{"name":"statementId","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[176,18],"end":[176,24],"line":"    statementId = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"statementId","start":[176,4],"end":[176,15],"line":"    statementId = string"}}] |
| fieldsByName | {"statementId":{"name":"statementId","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[176,18],"end":[176,24],"line":"    statementId = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"statementId","start":[176,4],"end":[176,15],"line":"    statementId = string"}}} |
### Retorno

| Campo | Tipo |
|-------|------|
| fields | [{"name":"status","typeDefinition":{"type":"Identifier","name":"read","sourceToken":{"string":"read","start":[179,13],"end":[179,17],"line":"    status = read.status"}},"baseType":"read","attributes":{"status":{"type":"BooleanLiteral","value":true,"sourceToken":{"string":"status","start":[179,18],"end":[179,24],"line":"    status = read.status"}}},"sourceToken":{"string":"status","start":[179,4],"end":[179,10],"line":"    status = read.status"}}] |
| fieldsByName | {"status":{"name":"status","typeDefinition":{"type":"Identifier","name":"read","sourceToken":{"string":"read","start":[179,13],"end":[179,17],"line":"    status = read.status"}},"baseType":"read","attributes":{"status":{"type":"BooleanLiteral","value":true,"sourceToken":{"string":"status","start":[179,18],"end":[179,24],"line":"    status = read.status"}}},"sourceToken":{"string":"status","start":[179,4],"end":[179,10],"line":"    status = read.status"}}} |
### Tasks

#### 1. read

**Ejecucion:** `worker` (asincrono)
**Parametros:**
- `statementId` = ref
**Retorno:**
- `fields`: [{"name":"status","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[197,17],"end":[197,23],"line":"        status = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"status","start":[197,8],"end":[197,14],"line":"        status = string"}}]
- `fieldsByName`: {"status":{"name":"status","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[197,17],"end":[197,23],"line":"        status = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"status","start":[197,8],"end":[197,14],"line":"        status = string"}}}


