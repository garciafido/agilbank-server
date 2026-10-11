# Framework de Automatización de Bots

Un framework modular y reutilizable para construir bots de automatización de browser usando Playwright.

## Tabla de Contenidos

- [Visión General de la Arquitectura](#visión-general-de-la-arquitectura)
- [Inicio Rápido](#inicio-rápido)
- [Componentes del Framework](#componentes-del-framework)
  - [InteractionStrategy](#interactionstrategy)
  - [BasePage](#basepage)
  - [BotOrchestrator](#botorchestrator)
  - [BaseBotRunner](#basebotrunner)
- [Crear un Nuevo Bot](#crear-un-nuevo-bot)
- [Estrategias de Selectores](#estrategias-de-selectores)
- [Patrones de Wait](#patrones-de-wait)
- [Helpers Específicos de Framework](#helpers-específicos-de-framework)
- [Manejo de Errores](#manejo-de-errores)
- [Mejores Prácticas](#mejores-prácticas)

---

## Visión General de la Arquitectura

```
src/bots/
├── browser/                    # Interacción de bajo nivel con browser
│   ├── InteractionStrategy.ts  # Selectores multi-estrategia, utilidades
│   ├── BrowserManager.ts       # Gestión de contexto Playwright
│   └── ScreenshotHelper.ts     # Screenshots de errores
│
├── pages/                      # Base de Page Object Model
│   └── BasePage.ts             # 35+ métodos de interacción
│
├── core/                       # Capa de orquestación
│   ├── BaseBotRunner.ts        # Ciclo de vida del bot
│   ├── BotOrchestrator.ts      # Ejecución de fases
│   ├── PhaseStateMachine.ts    # Gestión de estados
│   └── types.ts                # Interfaces compartidas
│
└── implementations/            # Implementaciones de bots
    └── [nombre-bot]/
        ├── pages/              # Page Objects específicos
        ├── phases/             # Definiciones de fases
        ├── selectors.ts        # Selectores centralizados
        ├── config.ts           # Configuración
        ├── types.ts            # Tipos específicos del bot
        └── index.ts            # Exports
```

---

## Inicio Rápido

### 1. Crear un Page Object

```typescript
// src/bots/implementations/mibot/pages/LoginPage.ts
import { BasePage, type PageDependencies } from '../../../pages';
import type { SelectorStrategy } from '../../../browser/InteractionStrategy';

export class LoginPage extends BasePage {
  constructor(deps: PageDependencies) {
    super(deps);
  }

  async login(usuario: string, password: string): Promise<void> {
    const usuarioSelectors: SelectorStrategy[] = [
      { type: 'css', value: '#username', description: 'Selector ID' },
      { type: 'label', value: 'Usuario', description: 'label' },
      { type: 'placeholder', value: 'Ingrese usuario', description: 'placeholder' },
    ];

    const passwordSelectors: SelectorStrategy[] = [
      { type: 'css', value: '#password', description: 'Selector ID' },
      { type: 'label', value: 'Contraseña', description: 'label' },
    ];

    const submitSelectors: SelectorStrategy[] = [
      { type: 'role', value: 'button', description: 'role button' },
      { type: 'text', value: 'Ingresar', description: 'texto del botón' },
    ];

    await this.fill(usuarioSelectors, usuario);
    await this.fill(passwordSelectors, password);
    await this.click(submitSelectors);
    await this.waitForNavigation();
  }
}
```

### 2. Crear una Fase

```typescript
// src/bots/implementations/mibot/phases/01-autenticacion.ts
import type { BotPhase, PhaseContext } from '../../../core/types';
import { LoginPage } from '../pages/LoginPage';

export const autenticacionPhase: BotPhase<MiBotParams> = {
  id: 'autenticacion',
  name: 'Autenticación',

  async execute(context: PhaseContext<MiBotParams>) {
    const { page, logger, config, params, updateStep } = context;

    const loginPage = new LoginPage({ page, logger, config });

    updateStep('navegar', 'Navegando a página de login');
    await loginPage.navigate(params.loginUrl);

    updateStep('login', 'Ingresando credenciales');
    await loginPage.login(params.usuario, params.password);

    return { success: true };
  }
};
```

### 3. Registrar el Bot

```typescript
// src/bots/implementations/mibot/MiBotRunner.ts
import { BaseBotRunner } from '../../core/BaseBotRunner';
import { autenticacionPhase } from './phases/01-autenticacion';

export class MiBotRunner extends BaseBotRunner<MiBotParams> {
  protected getPhases() {
    return [
      autenticacionPhase,
      // ... más fases
    ];
  }

  protected getBotType(): string {
    return 'mibot';
  }
}
```

---

## Componentes del Framework

### InteractionStrategy

Ubicado en `src/bots/browser/InteractionStrategy.ts`

#### Tipo SelectorStrategy

```typescript
interface SelectorStrategy {
  type: 'css' | 'xpath' | 'text' | 'role' | 'label' | 'placeholder' | 'row' | 'list';
  value: string;
  description?: string;
  index?: number;      // Para elemento enésimo
  chain?: string;      // Para encadenamiento de locators
}
```

#### Funciones Principales

```typescript
// Construir un locator de Playwright desde una estrategia
buildLocator(page: Page, strategy: SelectorStrategy): Locator

// Probar múltiples estrategias hasta que una tenga éxito
tryInteraction(
  page: Page,
  strategies: SelectorStrategy[],
  action: (locator: Locator) => Promise<void>,
  options?: InteractionOptions
): Promise<void>

// Descargar un archivo disparado al hacer click en un elemento
downloadFile(
  page: Page,
  strategies: SelectorStrategy[],
  downloadDir: string,
  options?: DownloadOptions
): Promise<string>

// Esperar a que desaparezcan los indicadores de carga
waitForLoadingToFinish(
  page: Page,
  selectors?: SelectorStrategy[],
  options?: { timeout?: number }
): Promise<void>

// Normalizar texto (quitar acentos, espacios extra)
normalizeText(text: string): string

// Obtener nombre de campo con sufijo de índice (_R1, _R2, etc.)
getFieldNameByIndex(baseName: string, index: number): string
```

#### Selectores de Carga por Defecto

```typescript
const DEFAULT_LOADING_SELECTORS: SelectorStrategy[] = [
  { type: 'text', value: 'Cargando...', description: 'texto de carga' },
  { type: 'text', value: 'Loading...', description: 'texto de carga en' },
  { type: 'css', value: '.z-loading', description: 'ZK loading' },
  { type: 'css', value: '.z-busyindicator', description: 'ZK busy' },
  { type: 'css', value: '.loading', description: 'loading genérico' },
  { type: 'css', value: '.spinner', description: 'spinner' },
];
```

---

### BasePage

Ubicado en `src/bots/pages/BasePage.ts`

La clase base para todos los Page Objects. Proporciona 35+ métodos para interacción con el browser.

#### Constructor

```typescript
abstract class BasePage {
  protected page: Page;
  protected logger: Logger;
  protected config: BotConfig;

  constructor(deps: PageDependencies) {
    this.page = deps.page;
    this.logger = deps.logger;
    this.config = deps.config;
  }
}
```

#### Métodos de Navegación

```typescript
// Navegar a URL
protected async navigate(url: string): Promise<void>

// Esperar carga de página
protected async waitForLoad(): Promise<void>

// Esperar a que complete la navegación
protected async waitForNavigation(options?: { timeout?: number }): Promise<void>
```

#### Métodos de Interacción

```typescript
// Click en elemento
protected async click(
  strategies: SelectorStrategy[],
  options?: Partial<InteractionOptions>
): Promise<void>

// Llenar campo de input (limpia primero)
protected async fill(
  strategies: SelectorStrategy[],
  value: string,
  options?: Partial<InteractionOptions>
): Promise<void>

// Escribir texto (tecla por tecla)
protected async type(
  strategies: SelectorStrategy[],
  text: string,
  options?: Partial<InteractionOptions>
): Promise<void>

// Seleccionar de elemento <select> nativo
protected async select(
  strategies: SelectorStrategy[],
  value: string,
  options?: Partial<InteractionOptions>
): Promise<void>

// Marcar checkbox
protected async check(
  strategies: SelectorStrategy[],
  options?: Partial<InteractionOptions>
): Promise<void>

// Desmarcar checkbox
protected async uncheck(
  strategies: SelectorStrategy[],
  options?: Partial<InteractionOptions>
): Promise<void>

// Subir archivo
protected async uploadFile(
  strategies: SelectorStrategy[],
  filePath: string,
  options?: Partial<InteractionOptions>
): Promise<void>

// Presionar tecla del teclado
protected async pressKey(key: string): Promise<void>

// Hover sobre elemento
protected async hover(
  strategies: SelectorStrategy[],
  options?: Partial<InteractionOptions>
): Promise<void>

// Doble click
protected async doubleClick(
  strategies: SelectorStrategy[],
  options?: Partial<InteractionOptions>
): Promise<void>

// Enfocar elemento
protected async focus(
  strategies: SelectorStrategy[],
  options?: Partial<InteractionOptions>
): Promise<void>

// Limpiar y llenar (limpieza explícita antes de llenar)
protected async clearAndFill(
  strategies: SelectorStrategy[],
  value: string,
  options?: Partial<InteractionOptions>
): Promise<void>
```

#### Métodos de Consulta

```typescript
// Obtener contenido de texto
protected async getText(
  strategies: SelectorStrategy[],
  options?: Partial<InteractionOptions>
): Promise<string>

// Obtener valor de input
protected async getValue(
  strategies: SelectorStrategy[],
  options?: Partial<InteractionOptions>
): Promise<string>

// Obtener valor de atributo
protected async getAttribute(
  strategies: SelectorStrategy[],
  attribute: string,
  options?: Partial<InteractionOptions>
): Promise<string | null>

// Verificar si elemento es visible
protected async isVisible(
  strategies: SelectorStrategy[],
  options?: { timeout?: number }
): Promise<boolean>

// Verificar si elemento existe en DOM
protected async exists(
  strategies: SelectorStrategy[],
  options?: { timeout?: number }
): Promise<boolean>

// Contar elementos coincidentes
protected async count(strategies: SelectorStrategy[]): Promise<number>

// Obtener todos los elementos coincidentes
protected async getAll(strategies: SelectorStrategy[]): Promise<Locator[]>

// Obtener enésimo elemento coincidente
protected async getNth(
  strategies: SelectorStrategy[],
  index: number
): Promise<Locator>

// Obtener contenido de texto de la página
protected async getPageContent(selector?: string): Promise<string>
```

#### Métodos de Espera

```typescript
// Esperar a que elemento sea visible
protected async waitForVisible(
  strategies: SelectorStrategy[],
  options?: { timeout?: number }
): Promise<void>

// Esperar a que elemento se oculte
protected async waitForHidden(
  strategies: SelectorStrategy[],
  options?: { timeout?: number }
): Promise<void>

// Esperar estabilidad de página (network idle + pequeño delay)
protected async waitForStable(ms?: number): Promise<void>

// Esperar a que desaparezcan indicadores de carga
protected async waitForLoadingToFinish(
  selectors?: SelectorStrategy[],
  options?: { timeout?: number }
): Promise<void>
```

#### Métodos Específicos de Framework

```typescript
// Seleccionar de dropdown (auto-detecta ZK/Bootstrap/Nativo)
protected async selectFromDropdown(
  rowStrategies: SelectorStrategy[],
  value: string,
  options?: DropdownOptions
): Promise<void>

// Verificar errores de framework ZK
protected async hasZkErrors(): Promise<boolean>

// Obtener mensajes de error ZK
protected async getZkErrors(): Promise<string[]>

// Descargar archivo
protected async downloadFile(
  strategies: SelectorStrategy[],
  downloadDir: string,
  options?: DownloadOptions
): Promise<string>

// Llenar campo por patrón de nombre (maneja sufijos _R1, _R2)
protected async fillByNamePattern(
  baseName: string,
  index: number,
  value: string
): Promise<void>
```

#### Métodos de Utilidad

```typescript
// Normalizar texto (heredado de InteractionStrategy)
protected normalizeText(text: string): string

// Hacer scroll hasta elemento
protected async scrollTo(
  strategies: SelectorStrategy[],
  options?: Partial<InteractionOptions>
): Promise<void>

// Ejecutar JavaScript en contexto de página
protected async evaluate<T>(fn: () => T): Promise<T>
```

---

### BotOrchestrator

Ubicado en `src/bots/core/BotOrchestrator.ts`

Gestiona la ejecución de fases, tracking y manejo de errores.

```typescript
class BotOrchestrator<TParams> {
  constructor(
    page: Page,
    logger: Logger,
    config: BotConfig,
    phases: BotPhase<TParams>[],
    callbacks?: OrchestratorCallbacks
  )

  // Ejecutar todas las fases en orden
  async executeAll(params: TParams): Promise<BotResult>

  // Ejecutar una fase específica por ID
  async executePhase(phaseId: string, params: TParams): Promise<PhaseResult>

  // Obtener estado de ejecución actual
  getState(): OrchestratorState
}
```

---

### BaseBotRunner

Ubicado en `src/bots/core/BaseBotRunner.ts`

Clase base abstracta para runners de bots. Maneja la gestión del ciclo de vida.

```typescript
abstract class BaseBotRunner<TParams> {
  // Debe ser implementado por subclases
  protected abstract getPhases(): BotPhase<TParams>[];
  protected abstract getBotType(): string;

  // Ejecutar el bot
  async run(params: TParams): Promise<BotResult>

  // Limpiar recursos
  async cleanup(): Promise<void>
}
```

---

## Estrategias de Selectores

### Tipos de Estrategia

| Tipo | Método | Ejemplo | Caso de Uso |
|------|--------|---------|-------------|
| `css` | `page.locator()` | `#submit-btn` | IDs, clases, atributos |
| `xpath` | `page.locator()` | `//button[@type="submit"]` | Traversal complejo |
| `text` | `page.getByText()` | `Enviar` | Texto visible |
| `role` | `page.getByRole()` | `button` | Roles de accesibilidad |
| `label` | `page.getByLabel()` | `Usuario` | Labels de formularios |
| `placeholder` | `page.getByPlaceholder()` | `Ingrese email` | Placeholders de inputs |
| `row` | Personalizado | `País` | Fila de tabla conteniendo texto |
| `list` | Personalizado | `Nombre de Sección` | Item de lista conteniendo texto |

### Mejores Prácticas

1. **Ordenar por confiabilidad**: Más específico primero, más general al final
2. **Incluir descripciones**: Ayuda al debugging
3. **Usar 3-4 estrategias**: Balance entre resiliencia y performance

```typescript
const botonEnviar: SelectorStrategy[] = [
  { type: 'css', value: '#submit-btn', description: 'ID (más confiable)' },
  { type: 'css', value: 'button[type="submit"]', description: 'atributo type' },
  { type: 'role', value: 'button', description: 'role button' },
  { type: 'text', value: 'Enviar', description: 'texto fallback' },
];
```

---

## Patrones de Wait

### Cuándo Usar Cada Uno

| Método | Cuándo Usar |
|--------|-------------|
| `waitForStable(ms)` | Después de clicks, envíos de formulario, requests AJAX |
| `waitForLoadingToFinish()` | Cuando la página muestra spinners de carga |
| `waitForNavigation()` | Después de acciones que disparan navegación de página |
| `waitForVisible(strategies)` | Esperar que aparezca un elemento específico |
| `waitForHidden(strategies)` | Esperar que desaparezca un modal/overlay |

### Ejemplos

```typescript
// Después de click en botón que dispara AJAX
await this.click(botonEnviar);
await this.waitForStable(1000);

// Esperar spinner de carga
await this.waitForLoadingToFinish();

// Esperar mensaje de éxito
await this.waitForVisible([
  { type: 'text', value: '¡Éxito!', description: 'mensaje de éxito' }
]);
```

---

## Helpers Específicos de Framework

### ZK Framework

```typescript
// Seleccionar de combobox ZK
await this.selectFromDropdown(
  [{ type: 'row', value: 'País', description: 'fila país' }],
  'Argentina',
  { framework: 'zk' }
);

// Verificar errores ZK
if (await this.hasZkErrors()) {
  const errors = await this.getZkErrors();
  throw new Error(`Errores de formulario: ${errors.join(', ')}`);
}
```

### Bootstrap

```typescript
// Seleccionar de dropdown Bootstrap
await this.selectFromDropdown(
  [{ type: 'css', value: '.country-dropdown', description: 'dropdown' }],
  'Argentina',
  { framework: 'bootstrap' }
);
```

### Auto-Detección

```typescript
// Dejar que el framework detecte el tipo de dropdown
await this.selectFromDropdown(
  [{ type: 'row', value: 'País', description: 'fila país' }],
  'Argentina',
  { framework: 'auto' }  // Por defecto
);
```

---

## Manejo de Errores

### Errores a Nivel de Fase

Los errores en fases se capturan automáticamente con:
- Screenshot al momento de la falla
- Mensaje de error y stack trace
- Contexto de fase y paso

```typescript
// En tu fase
try {
  await loginPage.login(usuario, password);
} catch (error) {
  // Error capturado automáticamente por el orquestador
  // Screenshot guardado en directorio configurado
  throw error;  // Re-lanzar para fallar la fase
}
```

### Errores Recuperables

```typescript
// Verificar errores esperados
if (await this.hasZkErrors()) {
  const errors = await this.getZkErrors();
  if (errors.some(e => e.includes('sesión expirada'))) {
    // Manejar error recuperable
    return { success: false, retry: true };
  }
}
```

---

## Mejores Prácticas

### 1. Page Objects Deben Estar Enfocados

```typescript
// Bien: Responsabilidad única
class LoginPage extends BasePage {
  async login(user: string, pass: string): Promise<void>
  async logout(): Promise<void>
}

// Mal: Demasiadas responsabilidades
class TodoEnUnaPage extends BasePage {
  async login(): Promise<void>
  async llenarFormulario(): Promise<void>
  async enviarOrden(): Promise<void>
  async descargarReporte(): Promise<void>
}
```

### 2. Fases Deben Ser Independientes

```typescript
// Bien: Cada fase puede ejecutarse/testearse independientemente
const phases = [
  authPhase,       // Puede testearse sola
  navigationPhase, // Puede testearse sola
  formPhase,       // Puede testearse sola
];

// Mal: Fases con dependencias ocultas
const phases = [
  setupEstadoGlobal,  // Setea variable global
  usarEstadoGlobal,   // Depende de efectos secundarios de fase anterior
];
```

### 3. Centralizar Selectores

```typescript
// selectors.ts
export const SELECTORS = {
  login: {
    usuario: [
      { type: 'css', value: '#username' },
      { type: 'label', value: 'Usuario' },
    ],
    password: [
      { type: 'css', value: '#password' },
    ],
  },
};

// LoginPage.ts
import { SELECTORS } from '../selectors';

await this.fill(SELECTORS.login.usuario, usuario);
```

### 4. Usar Patrones de Wait Consistentes

```typescript
// Bien: Waits semánticos
await this.click(botonEnviar);
await this.waitForStable(500);
await this.waitForLoadingToFinish();

// Mal: Números mágicos
await this.page.waitForTimeout(500);
await this.page.waitForTimeout(1000);
await this.page.waitForTimeout(2000);
```

### 5. Loguear Acciones Importantes

```typescript
async enviarFormulario(data: FormData): Promise<void> {
  this.logger.info({ formId: data.id }, 'Enviando formulario');

  await this.fill(campoNombre, data.nombre);
  await this.fill(campoEmail, data.email);
  await this.click(botonEnviar);

  this.logger.info('Formulario enviado exitosamente');
}
```

---

## Ver También

- [Fundamentos del Framework](./FRAMEWORK_RATIONALE.md) - Por qué se creó este framework
- [InteractionStrategy.ts](../../src/bots/browser/InteractionStrategy.ts) - Código fuente
- [BasePage.ts](../../src/bots/pages/BasePage.ts) - Código fuente
