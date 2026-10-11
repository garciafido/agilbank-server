# Framework de Bots: Fundamentos y Análisis Comparativo

## Resumen Ejecutivo

Este documento presenta los fundamentos para desarrollar un framework genérico de automatización de bots, basado en un análisis comparativo entre una implementación monolítica y la nueva arquitectura modular.

**Resultado clave: 46% de reducción de código** mientras se crea una base reutilizable para futuros bots.

---

## El Problema: Arquitectura de Bot Monolítica

### Caso de Estudio: Bot DNDA Original

El bot original de DNDA (Dirección Nacional del Derecho de Autor) fue desarrollado como una aplicación independiente para automatizar el registro de obras. Si bien funcional, exhibía varios problemas arquitectónicos comunes en proyectos de automatización que crecen orgánicamente.

#### Métricas de Código

| Componente | Líneas | Archivos |
|------------|--------|----------|
| Utilidades comunes | 1,740 | 8 |
| Page Objects | 2,946 | 6 |
| Servicios | 8,711 | 4 |
| Core/Config/Types | 4,272 | 12 |
| **Total** | **17,669** | **~30** |

#### El Problema del "Archivo Dios"

El problema más crítico: `tadRegistration.service.ts` contenía **7,528 líneas** - un solo archivo manejando:

- Las 8 fases de registro mezcladas
- 47+ métodos de pasos con selectores inline
- Waits manuales dispersos por todas partes
- Manejo de errores duplicado por método
- Sin separación de responsabilidades

```typescript
// Ejemplo de patrón problemático (bot original)
async insertarDatosEditorialesDomicilioPais(editores: Editor[]) {
  for (let i = 0; i < editores.length; i++) {
    const row = this.page.locator('tr:has-text("País")').nth(i);
    await row.locator('.z-combobox-btn').click();
    await this.page.waitForTimeout(500);  // Número mágico
    await this.page.locator('.z-combobox-pp:visible .z-comboitem')
      .filter({ hasText: editores[i].pais }).click();
    await this.page.waitForTimeout(300);  // Otro número mágico
  }
}
// Este patrón se repetía 40+ veces con ligeras variaciones
```

#### Problemas Identificados

1. **Sin Reutilización**: Cada patrón de interacción reimplementado
2. **Waits Inconsistentes**: `waitForTimeout(300)`, `waitForTimeout(500)`, `waitForTimeout(1000)` dispersos aleatoriamente
3. **Selectores Hardcodeados**: Sin estrategias de fallback para IDs dinámicos
4. **Sin Detección de Framework**: Patrones de ZK Framework manejados manualmente cada vez
5. **Testing Difícil**: Fases no aislables
6. **Pesadilla de Mantenimiento**: Un solo cambio podía romper funcionalidad no relacionada

---

## La Solución: Arquitectura de Framework por Capas

### Principios de Diseño

1. **Separación de Responsabilidades**: Framework vs Implementación
2. **Selectores Multi-Estrategia**: Patrones de fallback para localización resiliente de elementos
3. **Patrones de Wait Consistentes**: Métodos con nombre en lugar de números mágicos
4. **Ejecución Basada en Fases**: Unidades de trabajo aisladas y testeables
5. **Detección de Framework**: Manejo automático de elementos ZK, Bootstrap, nativos

### Visión General de la Arquitectura

```
src/bots/
├── browser/              # Capa de interacción con browser
│   ├── InteractionStrategy.ts   # Selectores multi-estrategia, utilidades
│   ├── BrowserManager.ts        # Gestión de contexto Playwright
│   └── ScreenshotHelper.ts      # Captura de errores
│
├── pages/                # Base de Page Object Model
│   └── BasePage.ts              # 35+ métodos de interacción reutilizables
│
├── core/                 # Capa de orquestación
│   ├── BaseBotRunner.ts         # Gestión del ciclo de vida del bot
│   ├── BotOrchestrator.ts       # Motor de ejecución de fases
│   ├── PhaseStateMachine.ts     # Transiciones de estado
│   └── types.ts                 # Interfaces compartidas
│
└── implementations/      # Código específico del bot
    └── [nombre-bot]/
        ├── pages/               # Page Objects específicos del bot
        ├── phases/              # Implementaciones de fases
        ├── selectors.ts         # Selectores centralizados
        └── config.ts            # Configuración del bot
```

### Métricas de Código: Nueva Arquitectura

| Componente | Líneas | Propósito |
|------------|--------|-----------|
| **Framework (Reutilizable)** | **2,912** | Funciona para CUALQUIER bot |
| Capa browser | 609 | InteractionStrategy, BrowserManager |
| Capa pages | 960 | BasePage con 35+ métodos |
| Capa core | 1,343 | Orquestación, tipos |
| **Implementación DNDA** | **6,646** | Solo específico de DNDA |
| Pages | 4,421 | 9 Page Objects |
| Phases | 1,046 | 8 fases aisladas |
| Config/Selectors | 1,179 | Definiciones centralizadas |
| **Total** | **9,558** | |

### Análisis de Reducción

| Métrica | Original | Nuevo | Cambio |
|---------|----------|-------|--------|
| Líneas Totales | 17,669 | 9,558 | **-46%** |
| Archivo Más Grande | 7,528 | 2,445 | **-68%** |
| Tamaño Promedio de Fase | N/A | 131 | Manejable |
| Código Reutilizable | 0 | 2,912 | **+2,912** |

---

## Capacidades del Framework

### Métodos de BasePage (35+)

```typescript
// Navegación
navigate(url), waitForLoad(), waitForNavigation()

// Interacciones
click(strategies), fill(strategies, value), type(strategies, text)
select(strategies, value), check(strategies), uncheck(strategies)
uploadFile(strategies, path), pressKey(key), hover(strategies)

// Consultas
getText(strategies), getValue(strategies), getAttribute(strategies, attr)
isVisible(strategies), exists(strategies), count(strategies)
getAll(strategies), getNth(strategies, index)

// Esperas
waitForVisible(strategies), waitForHidden(strategies)
waitForStable(ms), waitForLoadingToFinish(selectors)

// Específicos de Framework
selectFromDropdown(strategies, value, options)  // Auto-detecta ZK/Bootstrap/Nativo
hasZkErrors(), getZkErrors()

// Descargas
downloadFile(strategies, dir, options)

// Utilidades
getPageContent(), normalizeText(text)
```

### Selectores Multi-Estrategia

```typescript
// En lugar de un selector frágil único:
await page.locator('#dynamic-id-12345').click();

// Usar estrategias de fallback:
const strategies: SelectorStrategy[] = [
  { type: 'css', value: '#submit-btn', description: 'ID' },
  { type: 'role', value: 'button', description: 'role button' },
  { type: 'text', value: 'Enviar', description: 'texto' },
  { type: 'xpath', value: '//button[@type="submit"]', description: 'xpath' },
];
await this.click(strategies);  // Prueba cada uno hasta tener éxito
```

### Tipos de Selectores

| Tipo | Método Playwright | Caso de Uso |
|------|-------------------|-------------|
| `css` | `page.locator()` | Selectores CSS estándar |
| `xpath` | `page.locator()` | Traversal complejo del DOM |
| `text` | `page.getByText()` | Coincidencia de texto visible |
| `role` | `page.getByRole()` | Roles de accesibilidad |
| `label` | `page.getByLabel()` | Labels de formularios |
| `placeholder` | `page.getByPlaceholder()` | Placeholders de inputs |
| `row` | `page.locator('tr:has-text()')` | Contexto de fila de tabla |
| `list` | `page.getByRole('list').filter()` | Contexto de item de lista |

### Patrones de Wait

```typescript
// Antes: Números mágicos por todas partes
await this.page.waitForTimeout(500);
await this.page.waitForTimeout(1000);
await this.page.waitForTimeout(2000);

// Después: Métodos semánticos
await this.waitForStable(500);           // Estabilidad de red + DOM
await this.waitForLoadingToFinish();     // Spinners desaparecen
await this.waitForNavigation();          // Navegación de página completa
await this.waitForVisible(strategies);   // Elemento aparece
await this.waitForHidden(strategies);    // Elemento desaparece
```

---

## Análisis de ROI

### Primer Bot (DNDA)

| Inversión | Líneas |
|-----------|--------|
| Desarrollo del Framework | 2,912 |
| Implementación DNDA | 6,646 |
| **Total** | **9,558** |
| **Ahorro vs Original** | **8,111 (46%)** |

### Segundo Bot (Proyectado)

| Componente | Líneas |
|------------|--------|
| Framework (ya existe) | 0 |
| Nueva Implementación de Bot | ~4,000-5,500 |
| **Total** | **~4,000-5,500** |
| **Ahorro vs Desde Cero** | **~12,000-13,000** |

### Punto de Equilibrio

El framework se paga solo inmediatamente con el primer bot (reducción del 46%). Cada bot subsiguiente ahorra aproximadamente 70% del esfuerzo de desarrollo.

---

## Comparación Arquitectónica

### Original (Monolítico)

```
┌─────────────────────────────────────────────┐
│           tadRegistration.service.ts        │
│                 (7,528 líneas)              │
│  ┌─────────────────────────────────────────┐│
│  │ Auth + Nav + Forms + Validación + ...   ││
│  │ Todo mezclado, sin separación           ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

**Características:**
- Violación de responsabilidad única
- Acoplamiento fuerte
- Sin testeabilidad
- Sin reutilización

### Nuevo (Por Capas)

```
┌─────────────────────────────────────────────┐
│           Implementación del Bot            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ Fase 1   │ │ Fase 2   │ │ Fase N   │    │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘    │
│       │            │            │          │
│  ┌────┴────────────┴────────────┴────┐     │
│  │         Page Objects              │     │
│  └────────────────┬──────────────────┘     │
└───────────────────┼─────────────────────────┘
                    │
┌───────────────────┼─────────────────────────┐
│                   ▼       FRAMEWORK         │
│  ┌─────────────────────────────────────┐    │
│  │            BasePage                 │    │
│  │   click, fill, select, download...  │    │
│  └────────────────┬────────────────────┘    │
│                   │                         │
│  ┌────────────────┴────────────────────┐    │
│  │       InteractionStrategy           │    │
│  │  Multi-estrategia, buildLocator...  │    │
│  └────────────────┬────────────────────┘    │
│                   │                         │
│  ┌────────────────┴────────────────────┐    │
│  │     BotOrchestrator + Runner        │    │
│  │   Ciclo de vida, fases, errores     │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

**Características:**
- Clara separación de responsabilidades
- Acoplamiento débil vía interfaces
- Cada fase testeable independientemente
- Framework reutilizable entre bots

---

## Conclusión

El framework de bots representa una inversión estratégica que:

1. **Reduce el esfuerzo de desarrollo inmediato** en 46%
2. **Crea infraestructura reutilizable** para futuros proyectos de automatización
3. **Mejora la mantenibilidad** a través de arquitectura modular
4. **Aumenta la confiabilidad** vía selectores multi-estrategia y patrones consistentes
5. **Habilita testing** a través del aislamiento de fases

El enfoque de framework transforma el desarrollo de bots de "escribir todo desde cero" a "implementar solo la lógica específica del negocio" - un cambio fundamental que paga dividendos con cada nuevo proyecto de automatización.
