import type { Page, Locator, Download } from 'playwright';
import type { Logger } from 'pino';
import * as fs from 'fs/promises';
import * as path from 'path';

export type InteractionAction = 'click' | 'fill' | 'select' | 'check' | 'uncheck' | 'hover';

/**
 * Selector strategy type used by BasePage
 * Extended types:
 * - 'row': Creates tr:has-text("value") selector
 * - 'cell': Creates td:has-text("value") + td selector (sibling cell)
 * - 'list': Creates getByRole('list').filter({ hasText: value })
 */
export interface SelectorStrategy {
  type: 'css' | 'xpath' | 'text' | 'role' | 'label' | 'placeholder' | 'row' | 'cell' | 'list';
  value: string;
  description?: string;
  /** For nth element selection */
  index?: number;
  /** For hasText filter on locators */
  filter?: string;
  /** For chaining additional locator (e.g., 'input', '.z-combobox-btn') */
  chain?: string;
}

// Options for tryInteraction
export interface InteractionOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  logger?: Logger;
}

/**
 * Options for file download operations
 */
export interface DownloadOptions {
  timeout?: number;
  downloadDir: string;
  /** Rename UUID filenames to a readable format */
  renameUUID?: boolean;
  /** Prefix for renamed files */
  filePrefix?: string;
}

/**
 * Options for dropdown selection
 */
export interface DropdownOptions {
  /** Framework type: native <select>, ZK combobox, Bootstrap, or auto-detect */
  framework?: 'native' | 'zk' | 'bootstrap' | 'auto';
  /** Wait time after opening dropdown (ms) */
  waitAfterOpen?: number;
  /** Normalize text for comparison (accents, spaces) */
  normalize?: boolean;
  /** Index of the dropdown to select (for forms with multiple identical dropdowns) */
  index?: number;
  /** Only consider visible elements when using index (default: true) */
  onlyVisible?: boolean;
  /**
   * Override explícito para localizar el popup de opciones (cualquier
   * nomenclatura/portal). Si no se pasa, en ZK se deriva `#${id}-pp` del id de
   * runtime del combobox encontrado, con fallback a `.z-combobox-pp:visible`.
   */
  popupStrategies?: SelectorStrategy[];
  /**
   * Texto a tipear tras abrir el combobox y antes de escanear las opciones.
   * Necesario en listas largas que filtran por type-ahead (ej. países), donde
   * el popup no rinde los ítems hasta que se tipea. Ej: `value.substring(0, 4)`.
   */
  typeBeforeSearch?: string;
  /**
   * Tiempo máximo (ms) a esperar a que el contenedor del dropdown aparezca
   * cuando el primer escaneo no lo encuentra. En frameworks asíncronos (ZK) la
   * sección recién abierta renderiza el combobox un instante después; sin esta
   * espera el helper falla con "Could not find dropdown container" en portales
   * lentos. Default 10000.
   */
  containerTimeout?: number;
}

function buildLocator(page: Page, strategy: SelectorStrategy): Locator {
  let locator: Locator;

  switch (strategy.type) {
    case 'xpath':
      locator = page.locator(`xpath=${strategy.value}`);
      break;
    case 'text':
      locator = page.getByText(strategy.value, { exact: true });
      break;
    case 'role':
      // Parse role:has-text("...") pattern
      const roleMatch = strategy.value.match(/^(\w+):has-text\("(.+)"\)$/);
      if (roleMatch) {
        locator = page.getByRole(roleMatch[1] as any, { name: roleMatch[2] });
      } else {
        locator = page.getByRole(strategy.value as any);
      }
      break;
    case 'label':
      locator = page.getByLabel(strategy.value);
      break;
    case 'placeholder':
      locator = page.getByPlaceholder(strategy.value);
      break;
    // NEW: Row-based selector (tr:has-text("value"))
    case 'row':
      locator = page.locator(`tr:has-text("${strategy.value}")`);
      break;
    // NEW: Cell-based selector (td:has-text("value") + td) for sibling cell
    case 'cell':
      locator = page.locator(`td:has-text("${strategy.value}") + td`);
      break;
    // NEW: List-based selector using getByRole
    case 'list':
      locator = page.getByRole('list').filter({ hasText: strategy.value });
      break;
    case 'css':
    default:
      locator = page.locator(strategy.value);
  }

  // Apply filter if specified
  if (strategy.filter) {
    locator = locator.filter({ hasText: strategy.filter });
  }

  // Apply chain if specified (e.g., '.locator("input")')
  if (strategy.chain) {
    locator = locator.locator(strategy.chain);
  }

  // Apply index if specified
  if (strategy.index !== undefined) {
    locator = locator.nth(strategy.index);
  }

  return locator;
}

/**
 * Export buildLocator for direct use in BasePage
 */
export { buildLocator };

/**
 * Try multiple selector strategies until one works
 * Signature: tryInteraction(page, strategies, action, options)
 */
export async function tryInteraction(
  page: Page,
  strategies: SelectorStrategy[],
  action: (locator: Locator) => Promise<void>,
  options?: InteractionOptions
): Promise<void> {
  const { timeout = 5000, retries = 0, retryDelay = 1000, logger } = options || {};
  const errors: Array<{ strategy: string; error: Error }> = [];

  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const strategy of strategies) {
      try {
        logger?.debug(
          { strategy: strategy.description, selector: strategy.value, attempt },
          `Trying strategy: ${strategy.description}`
        );

        const locator = buildLocator(page, strategy);

        // Wait for element to be visible
        await locator.waitFor({ state: 'visible', timeout });

        // Execute the action callback
        await action(locator);

        logger?.info(
          { strategy: strategy.description },
          `Strategy succeeded: ${strategy.description}`
        );

        return; // Success!
      } catch (error) {
        const err = error as Error;
        errors.push({ strategy: strategy.description || strategy.value, error: err });
        logger?.debug(
          { strategy: strategy.description, error: err.message },
          `Strategy failed: ${strategy.description}`
        );
      }
    }

    // If we have more retries, wait before trying again
    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  // All strategies failed
  const lastError = errors[errors.length - 1]?.error;
  logger?.error(
    {
      strategiesAttempted: strategies.map((s) => s.description || s.value),
      errors: errors.map((e) => ({ strategy: e.strategy, message: e.error.message })),
    },
    'All interaction strategies failed'
  );

  throw lastError || new Error('All interaction strategies failed');
}

export async function waitForNavigation(
  page: Page,
  action: () => Promise<void>,
  options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
): Promise<void> {
  const { timeout = 30000, waitUntil = 'load' } = options || {};

  await Promise.all([
    page.waitForNavigation({ timeout, waitUntil }),
    action(),
  ]);
}

export async function waitForElement(
  page: Page,
  selector: string,
  options?: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' }
): Promise<Locator> {
  const { timeout = 10000, state = 'visible' } = options || {};
  const locator = page.locator(selector);
  await locator.waitFor({ state, timeout });
  return locator;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function calculateBackoff(attempt: number, baseDelay: number, multiplier: number): number {
  const delay = baseDelay * Math.pow(multiplier, attempt);
  const jitter = Math.random() * baseDelay * 0.5;
  return Math.min(delay + jitter, 60000); // Max 1 minute
}

/**
 * Download a file by clicking an element and waiting for download event
 * Handles UUID filename renaming and ensures download directory exists
 *
 * @param page - Playwright page instance
 * @param clickAction - Async function that triggers the download (e.g., clicking a button)
 * @param options - Download options including directory and rename settings
 * @returns Path to the downloaded file
 */
export async function downloadFile(
  page: Page,
  clickAction: () => Promise<void>,
  options: DownloadOptions
): Promise<string> {
  const { timeout = 30000, downloadDir, renameUUID = false, filePrefix } = options;

  // Ensure download directory exists
  try {
    await fs.mkdir(downloadDir, { recursive: true });
  } catch {
    // Directory may already exist
  }

  // Set up download listener before clicking
  const downloadPromise = page.waitForEvent('download', { timeout });

  // Trigger the download
  await clickAction();

  // Wait for download to start
  const download: Download = await downloadPromise;

  // Get filename and handle UUID renaming
  let filename = download.suggestedFilename();

  if (renameUUID) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
    const ext = path.extname(filename) || '.pdf';

    if (uuidRegex.test(nameWithoutExt)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const prefix = filePrefix ? `${filePrefix}_` : '';
      filename = `${prefix}${timestamp}${ext}`;
    }
  }

  // Save the file
  const filePath = path.join(downloadDir, filename);
  await download.saveAs(filePath);

  return filePath;
}

/**
 * Wait for loading indicators to disappear
 * Useful for ZK framework and other SPAs with loading spinners
 *
 * @param page - Playwright page instance
 * @param spinnerSelectors - Array of selector strategies for loading indicators
 * @param options - Wait options
 */
export async function waitForLoadingToFinish(
  page: Page,
  spinnerSelectors: SelectorStrategy[],
  options?: { timeout?: number; logger?: Logger }
): Promise<void> {
  const { timeout = 30000, logger } = options || {};

  for (const strategy of spinnerSelectors) {
    try {
      const locator = buildLocator(page, strategy);

      // Check if spinner is visible
      const isVisible = await locator.isVisible().catch(() => false);

      if (isVisible) {
        logger?.debug({ selector: strategy.value }, 'Waiting for loading indicator to hide');
        await locator.waitFor({ state: 'hidden', timeout });
        logger?.debug({ selector: strategy.value }, 'Loading indicator hidden');
      }
    } catch (error) {
      // Spinner may not exist or already hidden, continue
      logger?.debug({ selector: strategy.value, error: (error as Error).message }, 'Loading check skipped');
    }
  }

  // Extra stability wait
  await page.waitForTimeout(200);
}

/**
 * Normalize text for comparison
 * Handles accents, non-breaking spaces, and multiple whitespace
 *
 * @param text - Text to normalize
 * @returns Normalized text
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[áàäâã]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöôõ]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/\u00A0/g, ' ')  // Non-breaking space
    .replace(/\s+/g, ' ')     // Multiple spaces
    .trim();
}

/**
 * Get field name by index following the pattern:
 * - Index 0: baseName (e.g., "email_datos_edit")
 * - Index 1: baseName_R1 (e.g., "email_datos_edit_R1")
 * - Index 2: baseName_R2, etc.
 *
 * This pattern is common in ZK framework forms with repeated fields.
 *
 * @param baseName - Base field name
 * @param index - Zero-based index
 * @returns Field name with appropriate suffix
 */
export function getFieldNameByIndex(baseName: string, index: number): string {
  if (index === 0) {
    return baseName;
  }
  return `${baseName}_R${index}`;
}

/**
 * Default loading spinner selectors for common frameworks
 */
export const DEFAULT_LOADING_SELECTORS: SelectorStrategy[] = [
  { type: 'text', value: 'Cargando...', description: 'Loading text' },
  { type: 'css', value: '.z-loading', description: 'ZK loading' },
  { type: 'css', value: '.z-busyindicator', description: 'ZK busy indicator' },
  { type: 'css', value: '[class*="loading"]', description: 'Generic loading class' },
  { type: 'css', value: '.spinner', description: 'Generic spinner' },
];

/**
 * Default error selectors — covers ZK framework popups, per-field invalid states
 * and common Bootstrap/TAD-style alert banners.
 *
 * History: the original list only matched `.z-errbox` / `.z-errorbox` / `.z-messagebox-error`,
 * which are ZK's focus-triggered floating tooltips. In real portal flows (TAD/DNDA) after
 * a failed form submit, the visible signals are usually:
 *   - A Bootstrap-style banner at the top ("No se completaron algunos campos obligatorios")
 *   - Red-bordered inputs marked with `z-textbox-text-invalid`
 *   - Tooltips that only materialize when the invalid field is focused
 *
 * Matching only the ZK popups meant `hasZkErrors()` returned false in exactly the
 * cases we most needed it to catch a failed submit. The broadened list below
 * reflects the full set of signals; `getZkErrors()` filters elements without
 * textContent so per-field invalid inputs contribute to `hasZkErrors` but don't
 * emit empty strings into error messages.
 */
export const ZK_ERROR_SELECTORS: SelectorStrategy[] = [
  // ZK framework error popups (original set)
  { type: 'css', value: '.z-errbox:visible', description: 'ZK error box' },
  { type: 'css', value: '.z-errorbox:visible', description: 'ZK error box alt' },
  { type: 'css', value: '.z-messagebox-error', description: 'ZK message box error' },
  // Per-field invalid state — most reliable signal that form validation failed,
  // since it persists on the input even when no field is focused.
  { type: 'css', value: 'input.z-textbox-text-invalid', description: 'ZK invalid input field' },
  { type: 'css', value: '.z-textbox-text-invalid', description: 'ZK invalid textbox wrapper' },
  // Combobox inválido (ej. cmb_leido sin seleccionar) — usa su propia clase.
  { type: 'css', value: 'input.z-combobox-text-invalid', description: 'ZK invalid combobox field' },
  { type: 'css', value: '.z-combobox-text-invalid', description: 'ZK invalid combobox wrapper' },
  // Bootstrap-style alerts used by TAD and many government portals on top of ZK.
  { type: 'css', value: '.alert-danger:visible', description: 'Bootstrap alert-danger' },
  { type: 'css', value: '.alert.error:visible', description: 'generic alert error' },
];

/**
 * Filter an array of locators to only include visible ones
 *
 * @param locators - Array of Playwright locators
 * @returns Array of visible locators
 */
export async function filterVisibleLocators(locators: Locator[]): Promise<Locator[]> {
  const visible: Locator[] = [];
  for (const locator of locators) {
    if (await locator.isVisible().catch(() => false)) {
      visible.push(locator);
    }
  }
  return visible;
}

/**
 * Get all locators matching strategies, optionally filtered to only visible ones
 *
 * @param page - Playwright page instance
 * @param strategies - Selector strategies to try
 * @param onlyVisible - If true, filter to only visible elements
 * @returns Array of matching locators
 */
export async function getAllMatchingLocators(
  page: Page,
  strategies: SelectorStrategy[],
  onlyVisible: boolean = false
): Promise<Locator[]> {
  for (const strategy of strategies) {
    try {
      const baseLocator = buildLocator(page, strategy);
      const count = await baseLocator.count();

      if (count > 0) {
        const locators: Locator[] = [];
        for (let i = 0; i < count; i++) {
          locators.push(baseLocator.nth(i));
        }

        if (onlyVisible) {
          return await filterVisibleLocators(locators);
        }
        return locators;
      }
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Get the Nth visible element matching the strategies
 *
 * @param page - Playwright page instance
 * @param strategies - Selector strategies to try
 * @param index - Zero-based index of the visible element to get
 * @returns The locator at the specified index, or null if not found
 */
export async function getVisibleByIndex(
  page: Page,
  strategies: SelectorStrategy[],
  index: number
): Promise<Locator | null> {
  const visibleLocators = await getAllMatchingLocators(page, strategies, true);

  if (index < visibleLocators.length) {
    return visibleLocators[index];
  }
  return null;
}
