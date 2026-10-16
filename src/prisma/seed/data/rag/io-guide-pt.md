# iO — Motor de Consultas

## Introdução

iO é o motor de consultas deste sistema. Permite consultar dados internos e documentos indexados.

### Capacidades

- **Listagens e buscas**: Consultar registros por nome, filtros ou critérios combinados
- **Contagens e agregações**: Estatísticas, distribuições, totais por categoria
- **Busca em documentos**: Consultar conteúdo de PDFs e documentos indexados
- **Visualizações**: Tabelas, gráficos de barras, gráficos de pizza

### Limitações

- Só acessa dados internos do sistema
- Não tem acesso à internet nem fontes externas
- As respostas provêm exclusivamente dos dados carregados

---

## Dados Disponíveis

### Entidades Principais

#### AbStatement


**Campos consultáveis:** file, originalName, contentHash, status, verdict, bankCode, cbu, periodFrom, periodTo, openingBalance, closingBalance, lineCount, declaredAccount, reading, error, processedAt, readStarts

**Relações:** N/A

#### AbConceptCorrection


**Campos consultáveis:** bankCode, operationCode, bankText, canonicalType, rate, review, reviewedAt

**Relações:** N/A

#### AbReconciliation


**Campos consultáveis:** requestKey, statementId, bankCode, request, result, proposalCount

**Relações:** N/A

#### AbPaymentBatch


**Campos consultáveis:** originalName, contentHash, transfers, transferCount, failedCount

**Relações:** N/A

#### AbDecision


**Campos consultáveis:** decisionKey, reconciliationId, proposalId, statementId, lineId, bankCode, conceptKey, canonicalType, result, proposedKind, proposedPair, chosenKind, chosenPair, chosen, decidedAt

**Relações:** N/A

#### Usuário


**Campos consultáveis:** Organização, Email, Nome, Está ativo?, Idioma, Avatar, Celular, Requer 2FA, twoFaSecret, twoFaBackupCodes, twoFaVerifiedAt, passwordResetToken, passwordResetExpiresAt, Perfil

**Relações:** Empresa, Funções

#### Papel


**Campos consultáveis:** Nome, Disponível para inquilinos

**Relações:** Permissões

#### Tenant


**Campos consultáveis:** name, taxId, status, ivaCondition, grossReceiptsJurisdiction, withholdingAgent, imputationMinConfidence, logo

**Relações:** N/A

### Catálogos de Referência

- **Permissões**

---

## Tipos de Consultas

### Listagens
Obter registros com seus campos.

### Contagens
Obter totais e estatísticas.

### Agrupamentos
Distribuição de dados por categoria.

### Filtros Combinados
Consultas com múltiplos critérios.

### Busca em Documentos
Consultar conteúdo de PDFs e documentos indexados.

### Exemplos de Consultas


#### Contagens

- "Quantos/as AbStatement há?"
  - "Total de AbStatement"
  - "Número de AbStatement"
- "Quantos/as AbConceptCorrection há?"
  - "Total de AbConceptCorrection"
  - "Número de AbConceptCorrection"
- "Quantos/as AbReconciliation há?"
  - "Total de AbReconciliation"
  - "Número de AbReconciliation"
- "Quantos/as AbPaymentBatch há?"
  - "Total de AbPaymentBatch"
  - "Número de AbPaymentBatch"
- "Quantos/as AbDecision há?"
  - "Total de AbDecision"
  - "Número de AbDecision"
- "Quantos/as Usuários há?"
  - "Total de Usuários"
  - "Número de Usuários"
- "Quantos/as Funções há?"
  - "Total de Funções"
  - "Número de Funções"
- "Quantos/as Tenant há?"
  - "Total de Tenant"
  - "Número de Tenant"

#### Listagens

- "Lista de AbStatement"
  - "Mostrar AbStatement"
  - "Me dê os/as AbStatement"
- "Lista de AbConceptCorrection"
  - "Mostrar AbConceptCorrection"
  - "Me dê os/as AbConceptCorrection"
- "Lista de AbReconciliation"
  - "Mostrar AbReconciliation"
  - "Me dê os/as AbReconciliation"
- "Lista de AbPaymentBatch"
  - "Mostrar AbPaymentBatch"
  - "Me dê os/as AbPaymentBatch"
- "Lista de AbDecision"
  - "Mostrar AbDecision"
  - "Me dê os/as AbDecision"
- "Lista de Usuários"
  - "Mostrar Usuários"
  - "Me dê os/as Usuários"
- "Lista de Funções"
  - "Mostrar Funções"
  - "Me dê os/as Funções"
- "Lista de Tenant"
  - "Mostrar Tenant"
  - "Me dê os/as Tenant"

#### Agrupamentos

- "Usuários por Empresa"
  - "Quantos/as Usuários há por Empresa?"
  - "Distribuição de Usuários por Empresa"

#### Filtros

- "Usuários com Empresa "X""
  - "Buscar Usuários onde Empresa seja "X""

#### Contagens de Relações

- "Quantidade de Funções por Usuário"
  - "Quantos/as Funções cada Usuário tem?"
- "Quantidade de Permissões por Papel"
  - "Quantos/as Permissões cada Papel tem?"

#### Filtros em Relações

- "Usuários com Papel "X""
  - "Usuários que tenham Papel "X""
- "Funções com Permisão "X""
  - "Funções que tenham Permisão "X""

#### Filtros Negativos

- "Usuários sem Funções"
  - "Usuários que não têm Funções"
- "Funções sem Permissões"
  - "Funções que não têm Permissões"

#### Relações Inversas

- "Quantos/as Usuários cada Papel tem?"
  - "Quantidade de Usuários por Papel"
- "Quantos/as Usuários cada Tenant tem?"
  - "Quantidade de Usuários por Tenant"


---

## Visualizações

### Tabelas
Formato padrão para listagens. Suporta paginação.

### Gráficos de Pizza
Para distribuições e proporções. Máximo 10 categorias.

### Gráficos de Barras
Para comparar quantidades entre categorias.

---

## Perguntas Frequentes

### Quais dados posso consultar?
Todos os dados carregados no sistema: entidades principais, catálogos de referência e documentos indexados.

### Posso consultar informações da internet?
Não. iO só acessa dados internos do sistema.

### Como busco em documentos PDF?
Pergunte diretamente sobre o conteúdo. Exemplo: "O que diz o contrato sobre exclusividade?"

### Posso exportar os resultados?
Os resultados são mostrados em tabelas que podem ser copiadas.
