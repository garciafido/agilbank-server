# Pipelines

Documentacion de todos los pipelines del sistema.

## Indice

- [AbStatementRead](#abstatementread)

---

## AbStatementRead {#abstatementread}



### Parametros

| Parametro | Tipo |
|-----------|------|
| fields | [{"name":"statementId","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[168,18],"end":[168,24],"line":"    statementId = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"statementId","start":[168,4],"end":[168,15],"line":"    statementId = string"}}] |
| fieldsByName | {"statementId":{"name":"statementId","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[168,18],"end":[168,24],"line":"    statementId = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"statementId","start":[168,4],"end":[168,15],"line":"    statementId = string"}}} |
### Retorno

| Campo | Tipo |
|-------|------|
| fields | [{"name":"status","typeDefinition":{"type":"Identifier","name":"read","sourceToken":{"string":"read","start":[171,13],"end":[171,17],"line":"    status = read.status"}},"baseType":"read","attributes":{"status":{"type":"BooleanLiteral","value":true,"sourceToken":{"string":"status","start":[171,18],"end":[171,24],"line":"    status = read.status"}}},"sourceToken":{"string":"status","start":[171,4],"end":[171,10],"line":"    status = read.status"}}] |
| fieldsByName | {"status":{"name":"status","typeDefinition":{"type":"Identifier","name":"read","sourceToken":{"string":"read","start":[171,13],"end":[171,17],"line":"    status = read.status"}},"baseType":"read","attributes":{"status":{"type":"BooleanLiteral","value":true,"sourceToken":{"string":"status","start":[171,18],"end":[171,24],"line":"    status = read.status"}}},"sourceToken":{"string":"status","start":[171,4],"end":[171,10],"line":"    status = read.status"}}} |
### Tasks

#### 1. read

**Ejecucion:** `worker` (asincrono)
**Parametros:**
- `statementId` = ref
**Retorno:**
- `fields`: [{"name":"status","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[189,17],"end":[189,23],"line":"        status = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"status","start":[189,8],"end":[189,14],"line":"        status = string"}}]
- `fieldsByName`: {"status":{"name":"status","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[189,17],"end":[189,23],"line":"        status = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"status","start":[189,8],"end":[189,14],"line":"        status = string"}}}


