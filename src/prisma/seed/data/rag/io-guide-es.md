# iO — Motor de Consultas

## Introducción

iO es el motor de consultas de este sistema. Permite consultar datos internos y documentos indexados.

### Capacidades

- **Listados y búsquedas**: Consultar registros por nombre, filtros, o criterios combinados
- **Conteos y agrupaciones**: Estadísticas, distribuciones, totales por categoría
- **Búsqueda en documentos**: Consultar contenido de PDFs y documentos indexados
- **Visualizaciones**: Tablas, gráficos de barras, gráficos de torta

### Limitaciones

- Solo accede a datos internos del sistema
- No tiene acceso a internet ni fuentes externas
- Las respuestas provienen exclusivamente de los datos cargados

---

## Datos Disponibles

### Entidades Principales

#### Extracto Bancario
Un extracto bancario tal como lo entregó el banco, y su lectura llevada al resumen bancario canónico.

**Campos consultables:** Archivo, Nombre, Huella del Archivo, Estado, Veredicto, Banco, CBU, Desde, Hasta, Saldo Inicial, Saldo Final, Renglones, Cuenta Declarada, Lectura, Error, Leído el, Arranques

**Relaciones:** N/A

#### Corrección de Concepto
Lo que un usuario de la empresa marcó para un concepto del banco: su tipo canónico, o una alícuota.

**Campos consultables:** Banco, Código del Banco, Concepto, Tipo Canónico, Alícuota, Revisión, Revisada el

**Relaciones:** N/A

#### Usuario


**Campos consultables:** Organización, Email, Nombre, Está activo?, Idioma, Avatar, Celular, Requiere 2FA, twoFaSecret, twoFaBackupCodes, twoFaVerifiedAt, passwordResetToken, passwordResetExpiresAt, Perfil

**Relaciones:** Empresa, Roles

#### Rol


**Campos consultables:** Nombre, Disponible para inquilinos

**Relaciones:** Permisos

#### Empresa
Empresa cliente de AgilErp. Agrupa usuarios y contabilidad en un espacio aislado.

**Campos consultables:** Nombre, CUIT, Estado, Condición de IVA, Jurisdicción de IIBB, Agente de Retención, Umbral de imputación automática, Logo

**Relaciones:** N/A

### Catálogos de Referencia

- **Permisos**

---

## Tipos de Consultas

### Listados
Obtener registros con sus campos.

### Conteos
Obtener totales y estadísticas.

### Agrupaciones
Distribución de datos por categoría.

### Filtros Combinados
Consultas con múltiples criterios.

### Búsqueda en Documentos
Consultar contenido de PDFs y documentos indexados.

### Ejemplos de Consultas


#### Conteos

- "¿Cuántos/as Extractos Bancarios hay?"
  - "Total de Extractos Bancarios"
  - "Número de Extractos Bancarios"
- "¿Cuántos/as Correcciones de Concepto hay?"
  - "Total de Correcciones de Concepto"
  - "Número de Correcciones de Concepto"
- "¿Cuántos/as Usuarios hay?"
  - "Total de Usuarios"
  - "Número de Usuarios"
- "¿Cuántos/as Roles hay?"
  - "Total de Roles"
  - "Número de Roles"
- "¿Cuántos/as Empresas hay?"
  - "Total de Empresas"
  - "Número de Empresas"

#### Listados

- "Lista de Extractos Bancarios"
  - "Mostrar Extractos Bancarios"
  - "Dame los/las Extractos Bancarios"
- "Lista de Correcciones de Concepto"
  - "Mostrar Correcciones de Concepto"
  - "Dame los/las Correcciones de Concepto"
- "Lista de Usuarios"
  - "Mostrar Usuarios"
  - "Dame los/las Usuarios"
- "Lista de Roles"
  - "Mostrar Roles"
  - "Dame los/las Roles"
- "Lista de Empresas"
  - "Mostrar Empresas"
  - "Dame los/las Empresas"

#### Agrupaciones

- "Usuarios por Empresa"
  - "¿Cuántos/as Usuarios hay por Empresa?"
  - "Distribución de Usuarios por Empresa"

#### Filtros

- "Usuarios de Empresa "X""
  - "Usuarios con Empresa "X""
  - "Buscar Usuarios donde Empresa sea "X""

#### Conteos de Relaciones

- "Cantidad de Roles por Usuario"
  - "¿Cuántos/as Roles tiene cada Usuario?"
  - "Usuarios con más Roles"
- "Cantidad de Permisos por Rol"
  - "¿Cuántos/as Permisos tiene cada Rol?"
  - "Roles con más Permisos"

#### Filtros en Relaciones

- "Usuarios con Rol "X""
  - "Usuarios que tengan Rol "X""
- "Roles con Permiso "X""
  - "Roles que tengan Permiso "X""

#### Filtros Negativos

- "Usuarios sin Roles"
  - "Usuarios que no tienen Roles"
- "Roles sin Permisos"
  - "Roles que no tienen Permisos"

#### Navegación Profunda

- "Usuarios con Usuario → Empresa → Usuario"
- "Usuarios con Usuario → Rol → Permiso"
- "Usuarios con Usuario → Empresa → Usuario → Empresa"
- "Usuarios con Usuario → Empresa → Usuario → Rol"
- "Usuarios con Usuario → Empresa → Usuario → Empresa → Usuario"
- "Usuarios con Usuario → Empresa → Usuario → Rol → Permiso"
- "Roles con Rol → Permiso → Rol"
- "Roles con Rol → Permiso → Rol → Permiso"
- "Roles con Rol → Permiso → Rol → Usuario"
- "Roles con Rol → Permiso → Rol → Permiso → Rol"
- "Roles con Rol → Permiso → Rol → Usuario → Empresa"

#### Relaciones Inversas

- "¿Cuántos/as Usuarios tiene cada Rol?"
  - "Cantidad de Usuarios por Rol"
- "¿Cuántos/as Usuarios tiene cada Empresa?"
  - "Cantidad de Usuarios por Empresa"


---

## Visualizaciones

### Tablas
Formato por defecto para listados. Soporta paginación.

### Gráficos de Torta
Para distribuciones y proporciones. Máximo 10 categorías.

### Gráficos de Barras
Para comparar cantidades entre categorías.

---

## Preguntas Frecuentes

### ¿Qué datos puedo consultar?
Todos los datos cargados en el sistema: entidades principales, catálogos de referencia, y documentos indexados.

### ¿Puedo consultar información de internet?
No. iO solo accede a datos internos del sistema.

### ¿Cómo busco en documentos PDF?
Pregunte directamente sobre el contenido. Ejemplo: "¿Qué dice el contrato sobre exclusividad?"

### ¿Puedo exportar los resultados?
Los resultados se muestran en tablas que pueden copiarse.
