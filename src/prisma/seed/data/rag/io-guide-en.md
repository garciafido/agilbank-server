# iO — Query Engine

## Introduction

iO is the query engine for this system. It allows querying internal data and indexed documents.

### Capabilities

- **Listings and searches**: Query records by name, filters, or combined criteria
- **Counts and aggregations**: Statistics, distributions, totals by category
- **Document search**: Query content from PDFs and indexed documents
- **Visualizations**: Tables, bar charts, pie charts

### Limitations

- Only accesses internal system data
- No internet access or external sources
- Responses come exclusively from loaded data

---

## Available Data

### Main Entities

#### AbStatement


**Queryable fields:** file, originalName, contentHash, status, verdict, bankCode, cbu, periodFrom, periodTo, openingBalance, closingBalance, lineCount, declaredAccount, reading, error, processedAt

**Relations:** N/A

#### AbConceptCorrection


**Queryable fields:** bankCode, operationCode, bankText, canonicalType, rate, review, reviewedAt

**Relations:** N/A

#### User


**Queryable fields:** Organization, Email, Name, Is active?, Language, Avatar, Cellphone, Requires 2FA, twoFaSecret, twoFaBackupCodes, twoFaVerifiedAt, passwordResetToken, passwordResetExpiresAt, Profile

**Relations:** Company, Roles

#### Role


**Queryable fields:** Name, Tenant usable

**Relations:** Permissions

#### Tenant


**Queryable fields:** name, taxId, status, ivaCondition, grossReceiptsJurisdiction, withholdingAgent, imputationMinConfidence, logo

**Relations:** N/A

### Reference Catalogs

- **Permissions**

---

## Query Types

### Listings
Get records with their fields.

### Counts
Get totals and statistics.

### Groupings
Data distribution by category.

### Combined Filters
Queries with multiple criteria.

### Document Search
Query content from PDFs and indexed documents.

### Query Examples


#### Counts

- "How many AbStatement are there?"
  - "Total AbStatement"
  - "Number of AbStatement"
- "How many AbConceptCorrection are there?"
  - "Total AbConceptCorrection"
  - "Number of AbConceptCorrection"
- "How many Users are there?"
  - "Total Users"
  - "Number of Users"
- "How many Roles are there?"
  - "Total Roles"
  - "Number of Roles"
- "How many Tenant are there?"
  - "Total Tenant"
  - "Number of Tenant"

#### Listings

- "List of AbStatement"
  - "Show AbStatement"
  - "Give me the AbStatement"
- "List of AbConceptCorrection"
  - "Show AbConceptCorrection"
  - "Give me the AbConceptCorrection"
- "List of Users"
  - "Show Users"
  - "Give me the Users"
- "List of Roles"
  - "Show Roles"
  - "Give me the Roles"
- "List of Tenant"
  - "Show Tenant"
  - "Give me the Tenant"

#### Groupings

- "Users by Company"
  - "How many Users per Company?"
  - "Distribution of Users by Company"

#### Filters

- "Users with Company "X""
  - "Search Users where Company is "X""

#### Relation Counts

- "Number of Roles per User"
  - "How many Roles does each User have?"
- "Number of Permissions per Role"
  - "How many Permissions does each Role have?"

#### Relation Filters

- "Users with Role "X""
  - "Users that have Role "X""
- "Roles with Permission "X""
  - "Roles that have Permission "X""

#### Negative Filters

- "Users without Roles"
  - "Users that don't have Roles"
- "Roles without Permissions"
  - "Roles that don't have Permissions"

#### Inverse Relations

- "How many Users does each Role have?"
  - "Number of Users per Role"
- "How many Users does each Tenant have?"
  - "Number of Users per Tenant"


---

## Visualizations

### Tables
Default format for listings. Supports pagination.

### Pie Charts
For distributions and proportions. Maximum 10 categories.

### Bar Charts
For comparing quantities between categories.

---

## Frequently Asked Questions

### What data can I query?
All data loaded in the system: main entities, reference catalogs, and indexed documents.

### Can I query information from the internet?
No. iO only accesses internal system data.

### How do I search in PDF documents?
Ask directly about the content. Example: "What does the contract say about exclusivity?"

### Can I export the results?
Results are shown in tables that can be copied.
