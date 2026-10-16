# Pipelines

Documentacion de todos los pipelines del sistema.

## Indice

- [AbStatementRead](#abstatementread)

---

## AbStatementRead {#abstatementread}



### Parametros

| Parametro | Tipo |
|-----------|------|
| fields | [{"name":"statementId","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[350,18],"end":[350,24],"line":"    statementId = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"statementId","start":[350,4],"end":[350,15],"line":"    statementId = string"}}] |
| fieldsByName | {"statementId":{"name":"statementId","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[350,18],"end":[350,24],"line":"    statementId = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"statementId","start":[350,4],"end":[350,15],"line":"    statementId = string"}}} |
### Retorno

| Campo | Tipo |
|-------|------|
| fields | [{"name":"status","typeDefinition":{"type":"Identifier","name":"read","sourceToken":{"string":"read","start":[353,13],"end":[353,17],"line":"    status = read.status"}},"baseType":"read","attributes":{"status":{"type":"BooleanLiteral","value":true,"sourceToken":{"string":"status","start":[353,18],"end":[353,24],"line":"    status = read.status"}}},"sourceToken":{"string":"status","start":[353,4],"end":[353,10],"line":"    status = read.status"}}] |
| fieldsByName | {"status":{"name":"status","typeDefinition":{"type":"Identifier","name":"read","sourceToken":{"string":"read","start":[353,13],"end":[353,17],"line":"    status = read.status"}},"baseType":"read","attributes":{"status":{"type":"BooleanLiteral","value":true,"sourceToken":{"string":"status","start":[353,18],"end":[353,24],"line":"    status = read.status"}}},"sourceToken":{"string":"status","start":[353,4],"end":[353,10],"line":"    status = read.status"}}} |
### Tasks

#### 1. read

**Ejecucion:** `worker` (asincrono)
**Parametros:**
- `statementId` = ref
**Retorno:**
- `fields`: [{"name":"status","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[374,17],"end":[374,23],"line":"        status = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"status","start":[374,8],"end":[374,14],"line":"        status = string"}}]
- `fieldsByName`: {"status":{"name":"status","typeDefinition":{"type":"Identifier","name":"string","sourceToken":{"string":"string","start":[374,17],"end":[374,23],"line":"        status = string"}},"baseType":"string","attributes":{},"sourceToken":{"string":"status","start":[374,8],"end":[374,14],"line":"        status = string"}}}


