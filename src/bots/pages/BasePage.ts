import type { Page, Locator, ElementHandle } from 'playwright';
import type { Logger } from 'pino';
import type { BotConfig } from '../core/types';
import {
  tryInteraction,
  buildLocator,
  downloadFile as downloadFileUtil,
  waitForLoadingToFinish as waitForLoadingUtil,
  normalizeText,
  getFieldNameByIndex,
  getAllMatchingLocators,
  getVisibleByIndex as getVisibleByIndexUtil,
  DEFAULT_LOADING_SELECTORS,
  ZK_ERROR_SELECTORS,
  type SelectorStrategy,
  type InteractionOptions,
  type DownloadOptions,
  type DropdownOptions,
} from '../browser/InteractionStrategy';

export interface PageDependencies {
  page: Page;
  logger: Logger;
  config: BotConfig;
}

// ============================================================================
// Capa robusta de campos ZK — tipos
// ============================================================================
export interface ZkSetOptions {
  /** Para forms con N campos idénticos (selección por índice). */
  index?: number;
  /** Normalización para el verify: 'trim' (default), 'digits' (CUIT/máscara), 'none'. */
  normalize?: 'trim' | 'digits' | 'none';
  /** Permitir valor vacío (campos opcionales). */
  allowEmpty?: boolean;
  /** Reintentos del commit (default 3). */
  retries?: number;
  /** Delay entre keystrokes en ms (default 25). */
  delay?: number;
  /** Timeout del waitFor visible en ms (default 10000). */
  timeout?: number;
  /** Tecla de blur que dispara el onChange de ZK (default 'Tab'). */
  blurKey?: 'Tab' | 'Enter';
}

/** Error nombrado: un campo ZK no se commiteó tras los reintentos. */
export class ZkFieldError extends Error {
  constructor(
    public field: string,
    public expected: string,
    public actual: string
  ) {
    super(
      `Campo ZK "${field}" no se commiteó: esperado ${JSON.stringify(expected)}, quedó ${JSON.stringify(actual)}`
    );
    this.name = 'ZkFieldError';
  }
}

export type ZkFieldType = 'text' | 'combo' | 'date' | 'checkbox';

/** Descripción declarativa de un campo de formulario ZK. */
export interface ZkFieldSpec {
  label: string;
  strategies: SelectorStrategy[];
  value: string | boolean;
  type: ZkFieldType;
  options?: ZkSetOptions & DropdownOptions;
}

/**
 * Base class for Page Object Model implementation.
 * Extend this class to create page-specific classes for each page in the bot flow.
 *
 * Example:
 * ```typescript
 * class LoginPage extends BasePage {
 *   private selectors = {
 *     username: [
 *       { type: 'css', value: '#username' },
 *       { type: 'css', value: 'input[name="user"]' },
 *     ],
 *     password: [
 *       { type: 'css', value: '#password' },
 *     ],
 *     submitButton: [
 *       { type: 'css', value: 'button[type="submit"]' },
 *       { type: 'text', value: 'Ingresar' },
 *     ],
 *   };
 *
 *   async login(username: string, password: string): Promise<void> {
 *     await this.fill(this.selectors.username, username);
 *     await this.fill(this.selectors.password, password);
 *     await this.click(this.selectors.submitButton);
 *   }
 * }
 * ```
 */
export abstract class BasePage {
  protected page: Page;
  protected logger: Logger;
  protected config: BotConfig;

  constructor(deps: PageDependencies) {
    this.page = deps.page;
    this.logger = deps.logger;
    this.config = deps.config;
  }

  /**
   * Navigate to the page URL
   */
  protected async navigate(url: string): Promise<void> {
    this.logger.debug({ url }, 'Navigating to URL');
    await this.page.goto(url, {
      waitUntil: 'networkidle',
      timeout: this.config.defaultTimeout,
    });
  }

  /**
   * Wait for page to be fully loaded
   */
  protected async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle', {
      timeout: this.config.defaultTimeout,
    });
  }

  /**
   * Click on an element using multi-strategy selector
   */
  protected async click(
    strategies: SelectorStrategy[],
    options?: Partial<InteractionOptions>
  ): Promise<void> {
    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        await locator.click();
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );
  }

  /**
   * Fill an input field using multi-strategy selector
   */
  protected async fill(
    strategies: SelectorStrategy[],
    value: string,
    options?: Partial<InteractionOptions>
  ): Promise<void> {
    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        await locator.fill(value);
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );
  }

  /**
   * Type text character by character (useful for fields with JS validation)
   */
  protected async type(
    strategies: SelectorStrategy[],
    value: string,
    options?: Partial<InteractionOptions> & { delay?: number }
  ): Promise<void> {
    const { delay = 50, ...interactionOptions } = options || {};

    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        await locator.pressSequentially(value, { delay });
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...interactionOptions,
      }
    );
  }

  /**
   * Select an option from a dropdown
   */
  protected async select(
    strategies: SelectorStrategy[],
    value: string | { label?: string; value?: string; index?: number },
    options?: Partial<InteractionOptions>
  ): Promise<void> {
    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        if (typeof value === 'string') {
          await locator.selectOption(value);
        } else {
          await locator.selectOption(value);
        }
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );
  }

  /**
   * Check a checkbox or radio button
   */
  protected async check(
    strategies: SelectorStrategy[],
    options?: Partial<InteractionOptions>
  ): Promise<void> {
    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        await locator.check();
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );
  }

  /**
   * Uncheck a checkbox
   */
  protected async uncheck(
    strategies: SelectorStrategy[],
    options?: Partial<InteractionOptions>
  ): Promise<void> {
    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        await locator.uncheck();
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );
  }

  /**
   * Get text content from an element
   */
  protected async getText(
    strategies: SelectorStrategy[],
    options?: Partial<InteractionOptions>
  ): Promise<string> {
    let result = '';

    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        result = (await locator.textContent()) || '';
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );

    return result.trim();
  }

  /**
   * Get input value from an element
   */
  protected async getValue(
    strategies: SelectorStrategy[],
    options?: Partial<InteractionOptions>
  ): Promise<string> {
    let result = '';

    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        result = await locator.inputValue();
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );

    return result;
  }

  /**
   * Check if an element is visible
   */
  protected async isVisible(
    strategies: SelectorStrategy[],
    options?: Partial<InteractionOptions>
  ): Promise<boolean> {
    try {
      let visible = false;

      await tryInteraction(
        this.page,
        strategies,
        async (locator) => {
          visible = await locator.isVisible();
        },
        {
          timeout: options?.timeout || 5000,
          retries: 0,
          logger: this.logger,
          ...options,
        }
      );

      return visible;
    } catch {
      return false;
    }
  }

  /**
   * Check if an element exists in the DOM
   */
  protected async exists(
    strategies: SelectorStrategy[],
    options?: Partial<InteractionOptions>
  ): Promise<boolean> {
    try {
      let count = 0;

      await tryInteraction(
        this.page,
        strategies,
        async (locator) => {
          count = await locator.count();
        },
        {
          timeout: options?.timeout || 5000,
          retries: 0,
          logger: this.logger,
          ...options,
        }
      );

      return count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Wait for an element to be visible
   */
  protected async waitForVisible(
    strategies: SelectorStrategy[],
    options?: Partial<InteractionOptions>
  ): Promise<void> {
    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        await locator.waitFor({ state: 'visible' });
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );
  }

  /**
   * Wait for an element to be hidden
   */
  protected async waitForHidden(
    strategies: SelectorStrategy[],
    options?: Partial<InteractionOptions>
  ): Promise<void> {
    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        await locator.waitFor({ state: 'hidden' });
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );
  }

  /**
   * Wait for navigation to complete
   */
  protected async waitForNavigation(
    urlPattern?: string | RegExp,
    options?: { timeout?: number }
  ): Promise<void> {
    const timeout = options?.timeout || this.config.defaultTimeout;

    if (urlPattern) {
      await this.page.waitForURL(urlPattern, { timeout });
    } else {
      await this.page.waitForLoadState('networkidle', { timeout });
    }
  }

  /**
   * Wait for a specific amount of time (use sparingly)
   */
  protected async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /**
   * Upload a file to a file input
   */
  protected async uploadFile(
    strategies: SelectorStrategy[],
    filePath: string | string[],
    options?: Partial<InteractionOptions>
  ): Promise<void> {
    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        await locator.setInputFiles(filePath);
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );
  }

  /**
   * Press a keyboard key
   */
  protected async pressKey(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  /**
   * Scroll to an element
   */
  protected async scrollTo(
    strategies: SelectorStrategy[],
    options?: Partial<InteractionOptions>
  ): Promise<void> {
    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        await locator.scrollIntoViewIfNeeded();
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );
  }

  /**
   * Hover over an element
   */
  protected async hover(
    strategies: SelectorStrategy[],
    options?: Partial<InteractionOptions>
  ): Promise<void> {
    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        await locator.hover();
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );
  }

  /**
   * Get attribute value from an element
   */
  protected async getAttribute(
    strategies: SelectorStrategy[],
    attributeName: string,
    options?: Partial<InteractionOptions>
  ): Promise<string | null> {
    let result: string | null = null;

    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        result = await locator.getAttribute(attributeName);
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );

    return result;
  }

  /**
   * Execute custom JavaScript in the page context
   */
  protected async evaluate<T>(fn: () => T): Promise<T> {
    return this.page.evaluate(fn);
  }

  /**
   * Get all elements matching a selector
   */
  protected async getAll(
    strategies: SelectorStrategy[],
    options?: Partial<InteractionOptions>
  ): Promise<Locator[]> {
    const results: Locator[] = [];

    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        const count = await locator.count();
        for (let i = 0; i < count; i++) {
          results.push(locator.nth(i));
        }
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );

    return results;
  }

  /**
   * Double click on an element
   */
  protected async doubleClick(
    strategies: SelectorStrategy[],
    options?: Partial<InteractionOptions>
  ): Promise<void> {
    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        await locator.dblclick();
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );
  }

  /**
   * Focus on an element
   */
  protected async focus(
    strategies: SelectorStrategy[],
    options?: Partial<InteractionOptions>
  ): Promise<void> {
    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        await locator.focus();
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );
  }

  /**
   * Clear input field before filling
   */
  protected async clearAndFill(
    strategies: SelectorStrategy[],
    value: string,
    options?: Partial<InteractionOptions>
  ): Promise<void> {
    await tryInteraction(
      this.page,
      strategies,
      async (locator) => {
        await locator.clear();
        await locator.fill(value);
      },
      {
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        retryDelay: this.config.retryDelay,
        logger: this.logger,
        ...options,
      }
    );
  }

  // ============================================================================
  // NEW METHODS - Generalized from DNDA bot patterns
  // ============================================================================

  /**
   * Wait for page to stabilize after interactions
   * Useful for ZK framework and SPAs that need time to process
   *
   * @param ms - Milliseconds to wait (default: 500)
   */
  protected async waitForStable(ms: number = 500): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /**
   * Wait for all loading indicators to disappear
   * Uses default loading selectors or custom ones
   *
   * @param customSelectors - Optional custom loading selectors
   * @param timeout - Max wait time in ms
   */
  protected async waitForLoadingToFinish(
    customSelectors?: SelectorStrategy[],
    timeout: number = 30000
  ): Promise<void> {
    const selectors = customSelectors || DEFAULT_LOADING_SELECTORS;
    await waitForLoadingUtil(this.page, selectors, { timeout, logger: this.logger });
  }

  /**
   * Count elements matching the selector strategies
   *
   * @param strategies - Selector strategies to match
   * @returns Number of matching elements
   */
  protected async count(strategies: SelectorStrategy[]): Promise<number> {
    let result = 0;

    for (const strategy of strategies) {
      try {
        const locator = buildLocator(this.page, strategy);
        result = await locator.count();
        if (result > 0) {
          return result;
        }
      } catch {
        continue;
      }
    }

    return result;
  }

  /**
   * Get text content of the page or a specific element
   *
   * @param selector - Optional CSS selector to scope the text extraction
   * @returns Text content
   */
  protected async getPageContent(selector: string = 'body'): Promise<string> {
    const content = await this.page.locator(selector).textContent();
    return content || '';
  }

  /**
   * Get the Nth element from matching selectors
   * Useful for forms with repeated fields
   *
   * @param strategies - Selector strategies
   * @param index - Zero-based index
   * @returns Locator for the Nth element
   */
  protected async getNth(strategies: SelectorStrategy[], index: number): Promise<Locator> {
    for (const strategy of strategies) {
      try {
        const locator = buildLocator(this.page, strategy);
        const count = await locator.count();

        if (count > index) {
          return locator.nth(index);
        }
      } catch {
        continue;
      }
    }

    throw new Error(`Could not find element at index ${index} with any strategy`);
  }

  /**
   * Get the Nth VISIBLE element from matching selectors
   * Unlike getNth, this filters to only visible elements before selecting by index.
   * Essential for forms with multiple repeated sections where some may be hidden.
   *
   * @param strategies - Selector strategies
   * @param index - Zero-based index among visible elements
   * @returns Locator for the Nth visible element, or null if not found
   */
  protected async getVisibleByIndex(
    strategies: SelectorStrategy[],
    index: number
  ): Promise<Locator | null> {
    return getVisibleByIndexUtil(this.page, strategies, index);
  }

  /**
   * Get all visible elements matching the strategies
   *
   * @param strategies - Selector strategies
   * @returns Array of visible locators
   */
  protected async getAllVisible(strategies: SelectorStrategy[]): Promise<Locator[]> {
    return getAllMatchingLocators(this.page, strategies, true);
  }

  /**
   * Fill the Nth VISIBLE input matching the strategies
   * Useful for forms with multiple repeated fields (e.g., autor forms)
   *
   * @param strategies - Selector strategies to find the container/row
   * @param index - Zero-based index among visible elements
   * @param value - Value to fill
   * @param inputSelector - Optional selector for input within container (default: 'input')
   */
  protected async fillByIndex(
    strategies: SelectorStrategy[],
    index: number,
    value: string,
    inputSelector: string = 'input'
  ): Promise<void> {
    const container = await this.getVisibleByIndex(strategies, index);

    if (!container) {
      this.logger.warn({ index, strategies: strategies.map(s => s.description) }, 'Container not found at index');
      throw new Error(`Container not found at visible index ${index}`);
    }

    const input = container.locator(inputSelector).first();
    await input.click();
    await input.fill(value);
  }

  /**
   * Click the Nth VISIBLE element matching the strategies
   *
   * @param strategies - Selector strategies
   * @param index - Zero-based index among visible elements
   * @param chainSelector - Optional selector to chain after finding the container
   */
  protected async clickByIndex(
    strategies: SelectorStrategy[],
    index: number,
    chainSelector?: string
  ): Promise<void> {
    const element = await this.getVisibleByIndex(strategies, index);

    if (!element) {
      throw new Error(`Element not found at visible index ${index}`);
    }

    if (chainSelector) {
      await element.locator(chainSelector).first().click();
    } else {
      await element.click();
    }
  }

  /**
   * Download a file by clicking on an element
   *
   * @param strategies - Selector strategies for the download trigger element
   * @param downloadDir - Directory to save the file
   * @param options - Download options
   * @returns Path to the downloaded file
   */
  protected async downloadFile(
    strategies: SelectorStrategy[],
    downloadDir: string,
    options?: Partial<DownloadOptions>
  ): Promise<string> {
    // Find the clickable element first
    let clickableLocator: Locator | null = null;

    for (const strategy of strategies) {
      try {
        const locator = buildLocator(this.page, strategy);
        if (await locator.isVisible().catch(() => false)) {
          clickableLocator = locator;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!clickableLocator) {
      throw new Error('Could not find download trigger element');
    }

    const finalLocator = clickableLocator;
    return downloadFileUtil(
      this.page,
      async () => { await finalLocator.click(); },
      {
        downloadDir,
        timeout: options?.timeout || this.config.defaultTimeout,
        renameUUID: options?.renameUUID,
        filePrefix: options?.filePrefix,
      }
    );
  }

  /**
   * Select an option from a dropdown (supports native, ZK, and Bootstrap)
   * Auto-detects framework if not specified
   *
   * @param rowStrategies - Strategies to find the row/container with the dropdown
   * @param value - Value to select
   * @param options - Dropdown options
   */
  protected async selectFromDropdown(
    rowStrategies: SelectorStrategy[],
    value: string,
    options?: DropdownOptions
  ): Promise<void> {
    const { framework = 'auto', waitAfterOpen = 300, normalize = false, index, onlyVisible = true, popupStrategies, typeBeforeSearch, containerTimeout = 10000 } = options || {};
    const targetValue = normalize ? normalizeText(value) : value;

    // Find the row/container
    let container: Locator | null = null;

    if (index !== undefined) {
      // Use indexed selection (typically for forms with multiple identical dropdowns)
      if (onlyVisible) {
        container = await this.getVisibleByIndex(rowStrategies, index);
      } else {
        try {
          container = await this.getNth(rowStrategies, index);
        } catch {
          container = null;
        }
      }
    } else {
      // Escaneo rápido: contenedor ya renderizado.
      for (const strategy of rowStrategies) {
        try {
          const locator = buildLocator(this.page, strategy);
          if (await locator.count() > 0) {
            container = locator.first();
            break;
          }
        } catch {
          continue;
        }
      }

      // Espera acotada: en ZK/SPAs la sección recién abierta renderiza el
      // combobox un instante después del click a "Completar". Esperamos a que
      // CUALQUIERA de las estrategias se vuelva visible (una sola espera vía
      // `.or()`, no `timeout` por estrategia) antes de rendirnos.
      if (!container) {
        const locators: Locator[] = [];
        for (const strategy of rowStrategies) {
          try {
            locators.push(buildLocator(this.page, strategy).first());
          } catch {
            continue;
          }
        }
        if (locators.length > 0) {
          const combined = locators.reduce((acc, loc) => acc.or(loc));
          try {
            await combined.first().waitFor({ state: 'visible', timeout: containerTimeout });
          } catch {
            // se reporta abajo como "Could not find dropdown container"
          }
          for (const loc of locators) {
            try {
              if (await loc.count() > 0) {
                container = loc;
                break;
              }
            } catch {
              continue;
            }
          }
        }
      }
    }

    if (!container) {
      const indexInfo = index !== undefined ? ` at index ${index}` : '';
      throw new Error(`Could not find dropdown container${indexInfo}`);
    }

    // Auto-detect framework if needed
    let detectedFramework = framework;
    if (framework === 'auto') {
      const hasNativeSelect = await container.locator('select').count() > 0;
      const hasZkCombobox = await container.locator('.z-combobox, .z-combobox-btn').count() > 0;

      if (hasNativeSelect) {
        detectedFramework = 'native';
      } else if (hasZkCombobox) {
        detectedFramework = 'zk';
      } else {
        detectedFramework = 'bootstrap';
      }
    }

    // Handle based on framework
    switch (detectedFramework) {
      case 'native': {
        const select = container.locator('select').first();
        await select.selectOption({ label: value });
        break;
      }

      case 'zk': {
        // ZK tiene tres fragilidades:
        //  1) El popup se appendea al body; clickear `.z-combobox-pp:visible`
        //     (cualquier popup visible) puede pegarle al combobox equivocado.
        //  2) El valor se commitea de forma asíncrona y a veces el click no lo
        //     registra (queda vacío y recién falla al guardar).
        //  3) Los ids de runtime (`#id-btn`/`#id-pp`) CADUCAN: cada re-render
        //     AJAX los regenera, y un id capturado una sola vez deja TODOS los
        //     reintentos apuntando a selectores muertos. Por eso el id se
        //     re-deriva EN CADA intento desde el name estable del caller.
        // Popup: override explícito del caller > derivado del id > visible.
        const resolvePopup = (baseId: string | null): Locator => {
          if (popupStrategies && popupStrategies.length > 0) {
            for (const strategy of popupStrategies) {
              try {
                return buildLocator(this.page, strategy).first();
              } catch {
                continue;
              }
            }
          }
          if (baseId) return this.page.locator(`#${baseId}-pp`);
          return this.page.locator('.z-combobox-pp:visible');
        };

        let optionFound = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          const comboInput = container
            .locator('input.z-combobox-inp, .z-combobox input, input')
            .first();
          const inputId = await comboInput
            .getAttribute('id', { timeout: 5000 })
            .catch(() => null);
          const baseId = inputId ? inputId.replace(/-real$/, '') : null;
          const popup = resolvePopup(baseId);

          const comboboxBtn = baseId
            ? this.page.locator(`#${baseId}-btn`).first()
            : container.locator('.z-combobox-btn, .z-combobox input, input').first();
          // Techos explícitos en cada acción: sin ellos, un selector vencido
          // quema el defaultTimeout entero (90s en prod) POR PASO en vez de
          // caer rápido al reintento con el id re-derivado.
          await comboboxBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
          await comboboxBtn.click({ timeout: 8000 }).catch(async () => {
            await comboboxBtn.click({ force: true, timeout: 8000 }).catch(() => {});
          });

          // El portal (DNDA) se pone lento: esperar por CONDICIÓN a que el popup
          // quede visible con ítems, con techo generoso — el sleep fijo corto
          // perdía la carrera contra el AJAX que puebla el popup.
          await this.pollUntil(
            async () =>
              (await popup.locator('.z-comboitem:visible').count().catch(() => 0)) > 0,
            { timeout: 20000, interval: 250 }
          );

          // Type-ahead: en listas largas que filtran al tipear (ej. países), el
          // popup no rinde ítems hasta tipear. El input queda enfocado tras abrir.
          if (typeBeforeSearch) {
            await this.page.keyboard.type(typeBeforeSearch);
            await this.pollUntil(
              async () =>
                (await popup.locator('.z-comboitem:visible').count().catch(() => 0)) > 0,
              { timeout: 10000, interval: 250 }
            );
          }

          // Solo ítems VISIBLES: los popups cerrados conservan sus ítems en el
          // DOM — clickearlos cuelga la corrida en vez de fallar al retry.
          const items = popup.locator('.z-comboitem:visible');
          const itemCount = await items.count();

          // Dos pasadas: el match EXACTO gana siempre. Antes se aceptaba el primer
          // ítem que coincidiera exacto O por substring, con lo cual bastaba que una
          // opción contuviera a otra ("Música" ⊂ "Música y letra") para que el valor
          // pedido se resolviera al que estuviera antes en el DOM. Eso no falla: elige
          // mal en silencio, y un valor equivocado en un trámite no lo detecta nadie
          // hasta que ya salió. El substring queda como respaldo para las listas que
          // no rinden el texto literal, y solo si es INEQUÍVOCO: con dos candidatos se
          // corta, porque adivinar es el defecto que esto viene a cerrar.
          const itemTexts: string[] = [];
          for (let i = 0; i < itemCount; i++) {
            const itemText = (await items.nth(i).textContent().catch(() => '')) || '';
            itemTexts.push(normalize ? normalizeText(itemText) : itemText.trim());
          }

          let matchIndex = itemTexts.indexOf(targetValue);
          if (matchIndex === -1) {
            const partials = itemTexts
              .map((text, i) => ({ text, i }))
              .filter(({ text }) => text.includes(targetValue));
            if (partials.length === 1) {
              matchIndex = partials[0].i;
            } else if (partials.length > 1) {
              throw new Error(
                `Opción ambigua "${value}": ${partials.length} coincidencias parciales ` +
                  `(${partials.map((p) => JSON.stringify(p.text)).join(', ')}). ` +
                  `Ninguna coincide exactamente.`
              );
            }
          }

          let clicked = false;
          if (matchIndex !== -1) {
            clicked = await items
              .nth(matchIndex)
              .click({ timeout: 8000 })
              .then(() => true)
              .catch(() => false);
            if (clicked) optionFound = true;
          }

          if (clicked) {
            // Commit asíncrono de ZK: poll hasta que el input quede con valor.
            const committed = await this.pollUntil(
              async () =>
                (((await comboInput.inputValue().catch(() => '')) ?? '').trim()) !== '',
              { timeout: 5000, interval: 150 }
            );
            if (committed) return;
            this.logger.warn(
              { attempt, value },
              'ZK dropdown: el valor no se commiteó tras seleccionar, reintentando'
            );
          } else {
            this.logger.warn(
              { attempt, value, itemCount },
              'ZK dropdown: opción no encontrada en el popup, reintentando'
            );
          }
        }

        if (!optionFound) {
          throw new Error(`Option "${value}" not found in ZK dropdown`);
        }
        throw new Error(`ZK dropdown: el valor "${value}" no se commiteó tras 3 intentos`);
      }

      case 'bootstrap': {
        // Click to open Bootstrap dropdown
        const dropdownToggle = container.locator('[data-toggle="dropdown"], .dropdown-toggle, button').first();
        await dropdownToggle.click();
        await this.page.waitForTimeout(waitAfterOpen);

        // Find and click option
        const option = this.page.locator('.dropdown-menu:visible .dropdown-item, .dropdown-menu:visible li')
          .filter({ hasText: value })
          .first();
        await option.click();
        break;
      }
    }
  }

  /**
   * Check if there are ZK framework error messages visible
   *
   * @returns True if errors are visible
   */
  protected async hasZkErrors(): Promise<boolean> {
    for (const strategy of ZK_ERROR_SELECTORS) {
      try {
        const locator = buildLocator(this.page, strategy);
        if (await locator.isVisible().catch(() => false)) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  /**
   * Get ZK error messages if any.
   *
   * Some entries in ZK_ERROR_SELECTORS match non-text nodes (e.g. `input.z-textbox-text-invalid`):
   * those contribute to `hasZkErrors()` but `.textContent()` returns empty. Here we:
   *   1. Try textContent first (the primary case for banners/popups).
   *   2. If empty, fall back to the `title` attribute, which ZK uses to carry the
   *      actual validation message on invalid inputs.
   *   3. Skip matches with no usable text rather than emit empty strings.
   *
   * @returns Array of error messages (deduped later by callers if needed)
   */
  protected async getZkErrors(): Promise<string[]> {
    const errors: string[] = [];

    for (const strategy of ZK_ERROR_SELECTORS) {
      try {
        const locator = buildLocator(this.page, strategy);
        const count = await locator.count();

        for (let i = 0; i < count; i++) {
          const el = locator.nth(i);
          let text = (await el.textContent().catch(() => '')) || '';
          if (!text.trim()) {
            text = (await el.getAttribute('title').catch(() => '')) || '';
          }
          if (text.trim()) {
            errors.push(text.trim());
          }
        }
      } catch {
        continue;
      }
    }

    return errors;
  }

  // ==========================================================================
  // CAPA ROBUSTA DE CAMPOS ZK
  // Regla: un valor solo está "puesto" en ZK si se commitó por evento real
  // (keystroke/blur/selección) Y se re-verificó (valor + ausencia de z-*-invalid).
  // `.fill()`+`inputValue()` (DOM) NO garantiza el commit al modelo de ZK.
  // Nunca esperar por reloj: condición real (auto-wait + verify-poll + waitForRender).
  // ==========================================================================

  /**
   * Espera por CONDICIÓN (reemplaza waitForTimeout ciego): ejecuta `fn` en bucle
   * hasta que devuelva true o se agote `timeout`. `interval` es la cadencia del poll.
   */
  protected async pollUntil(
    fn: () => Promise<boolean>,
    opts: { timeout?: number; interval?: number } = {}
  ): Promise<boolean> {
    const { timeout = 5000, interval = 100 } = opts;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (await fn()) return true;
      } catch {
        /* reintenta */
      }
      await this.page.waitForTimeout(interval);
    }
    try {
      return await fn();
    } catch {
      return false;
    }
  }

  /**
   * Resuelve un campo/contenedor esperando a que esté VISIBLE (cubre el re-render
   * AJAX de ZK: el nodo puede existir en el DOM pero aún no visible — la causa de
   * que un fill "no encuentre" el campo recién renderizado). Devuelve el Locator o
   * null si no aparece a tiempo.
   */
  protected async resolveVisible(
    strategies: SelectorStrategy[],
    opts: { index?: number; timeout?: number } = {}
  ): Promise<Locator | null> {
    const { index, timeout = 10000 } = opts;
    if (index !== undefined) {
      try {
        return await this.getVisibleByIndex(strategies, index);
      } catch {
        return null;
      }
    }
    // NO volver a `.or(...).first().waitFor('visible')`: `first()` toma el primer
    // match en orden del DOM, que puede ser un gemelo OCULTO del campo buscado
    // (ZK renderiza variantes ocultas del mismo rótulo, ej. en DNDA editores
    // persona física `cuit_datos_edit` oculto precede a `docu_num_datos_edit`
    // visible) → timeout con el campo correcto visible al lado.
    let found: Locator | null = null;
    await this.pollUntil(
      async () => {
        for (const s of strategies) {
          let loc: Locator;
          try {
            loc = buildLocator(this.page, s);
          } catch {
            continue;
          }
          const n = await loc.count();
          for (let i = 0; i < n; i++) {
            const nth = loc.nth(i);
            if (await nth.isVisible().catch(() => false)) {
              found = nth;
              return true;
            }
          }
        }
        return false;
      },
      { timeout, interval: 150 }
    );
    return found;
  }

  /**
   * Espera a que un re-render AJAX produzca el resultado esperado: al menos `count`
   * elementos visibles (default 1). Usar tras toda acción que cambie la estructura
   * (setear cantidad → sub-forms, elegir tipo-doc → campo nuevo, "Completar" → form).
   * Reemplaza los sleeps fijos post-acción.
   */
  protected async waitForRender(
    strategies: SelectorStrategy[],
    opts: { count?: number; timeout?: number } = {}
  ): Promise<boolean> {
    const { count = 1, timeout = 10000 } = opts;
    return this.pollUntil(
      async () => {
        let visible = 0;
        for (const s of strategies) {
          try {
            const loc = buildLocator(this.page, s);
            const n = await loc.count();
            for (let i = 0; i < n; i++) {
              if (await loc.nth(i).isVisible().catch(() => false)) visible++;
            }
          } catch {
            continue;
          }
        }
        return visible >= count;
      },
      { timeout, interval: 150 }
    );
  }

  /**
   * Setea un campo de TEXTO ZK de forma robusta: resuelve+espera visible → commit
   * por keystrokes (pressSequentially + blur) → verify-POLL (re-lee hasta matchear
   * y sin z-textbox-text-invalid) → reintenta → throw nombrando el campo si falla.
   */
  protected async setZkText(
    label: string,
    strategies: SelectorStrategy[],
    value: string,
    opts: ZkSetOptions = {}
  ): Promise<void> {
    const {
      index,
      normalize = 'trim',
      allowEmpty = false,
      retries = 3,
      delay = 25,
      timeout = 10000,
      blurKey = 'Tab',
    } = opts;
    if (!value && !allowEmpty) throw new ZkFieldError(label, value, '(valor vacío provisto)');
    const norm = (s: string) =>
      normalize === 'digits'
        ? (s.match(/\d/g) || []).join('')
        : normalize === 'trim'
          ? s.trim()
          : s;
    const want = norm(value);

    for (let attempt = 1; attempt <= retries; attempt++) {
      const field = await this.resolveVisible(strategies, { index, timeout });
      if (!field) continue;
      try {
        await field.click();
        await field.fill('');
        await field.pressSequentially(value, { delay });
        await this.page.keyboard.press(blurKey);
        const committed = await this.pollUntil(
          async () => {
            const actual = norm((await field.inputValue().catch(() => '')) ?? '');
            const invalid = await field
              .evaluate((el) => (el as HTMLElement).classList.contains('z-textbox-text-invalid'))
              .catch(() => false);
            return actual === want && !invalid;
          },
          { timeout: 3000, interval: 100 }
        );
        if (committed) {
          if (attempt > 1) this.logger.info({ label, attempt }, 'Campo ZK commiteado (reintento)');
          return;
        }
        this.logger.warn({ label, attempt }, 'Campo ZK no commiteó tras keystrokes, reintentando');
      } catch (e) {
        this.logger.warn(
          { label, attempt, error: (e as Error).message },
          'Error seteando campo ZK, reintentando'
        );
      }
    }
    const last = await this.resolveVisible(strategies, { index, timeout: 1000 })
      .then((f) => (f ? f.inputValue().catch(() => '') : null))
      .catch(() => null);
    // Distinguir "el campo nunca apareció visible" (selector/re-render) de
    // "el valor no commiteó" — mezclarlos disfraza bugs de targeting como
    // rechazos del portal.
    throw new ZkFieldError(
      label,
      value,
      last ?? '(campo no encontrado visible: re-render ZK pendiente o selector sin match)'
    );
  }

  /** Setea una fecha (fill + cerrar datepicker + verify-poll). */
  protected async setZkDate(
    label: string,
    strategies: SelectorStrategy[],
    value: string,
    opts: ZkSetOptions = {}
  ): Promise<void> {
    const { index, retries = 3, timeout = 10000 } = opts;
    for (let attempt = 1; attempt <= retries; attempt++) {
      const field = await this.resolveVisible(strategies, { index, timeout });
      if (!field) continue;
      try {
        await field.click();
        await field.fill('');
        await field.fill(value);
        await this.page.keyboard.press('Escape');
        const ok = await this.pollUntil(
          async () => (((await field.inputValue().catch(() => '')) ?? '').trim() === value.trim()),
          { timeout: 2000, interval: 100 }
        );
        if (ok) return;
      } catch (e) {
        this.logger.warn(
          { label, attempt, error: (e as Error).message },
          'Error seteando fecha ZK, reintentando'
        );
      }
    }
    throw new ZkFieldError(label, value, '(fecha no commiteó)');
  }

  /** Setea un checkbox al estado deseado (idempotente) + verify-poll. */
  protected async setZkCheckbox(
    label: string,
    strategies: SelectorStrategy[],
    checked: boolean,
    opts: ZkSetOptions = {}
  ): Promise<void> {
    const { index, retries = 3, timeout = 10000 } = opts;
    for (let attempt = 1; attempt <= retries; attempt++) {
      const field = await this.resolveVisible(strategies, { index, timeout });
      if (!field) continue;
      try {
        if ((await field.isChecked().catch(() => null)) === checked) return;
        await field.click();
        const ok = await this.pollUntil(
          async () => (await field.isChecked().catch(() => !checked)) === checked,
          { timeout: 1500, interval: 100 }
        );
        if (ok) return;
      } catch (e) {
        this.logger.warn(
          { label, attempt, error: (e as Error).message },
          'Error seteando checkbox ZK, reintentando'
        );
      }
    }
    throw new ZkFieldError(label, String(checked), '(checkbox no commiteó)');
  }

  /** Combo robusto (wrapper de selectFromDropdown, error nombrado). */
  protected async setZkCombo(
    label: string,
    strategies: SelectorStrategy[],
    value: string,
    opts: ZkSetOptions & DropdownOptions = {}
  ): Promise<void> {
    try {
      await this.selectFromDropdown(strategies, value, opts);
    } catch (e) {
      throw new ZkFieldError(label, value, (e as Error).message);
    }
  }

  /** Aplica un formulario declarativo: cada spec por su tipo. Tira ZkFieldError nombrando el campo. */
  protected async applyZkForm(specs: ZkFieldSpec[]): Promise<void> {
    for (const spec of specs) {
      const opts = spec.options ?? {};
      switch (spec.type) {
        case 'text':
          await this.setZkText(spec.label, spec.strategies, String(spec.value), opts);
          break;
        case 'combo':
          await this.setZkCombo(spec.label, spec.strategies, String(spec.value), opts);
          break;
        case 'date':
          await this.setZkDate(spec.label, spec.strategies, String(spec.value), opts);
          break;
        case 'checkbox':
          await this.setZkCheckbox(spec.label, spec.strategies, Boolean(spec.value), opts);
          break;
      }
    }
  }

  /**
   * Red de seguridad pre-submit: re-verifica cada spec y RE-COMMITEA el que no haya
   * quedado (valor distinto / vacío / z-*-invalid). Devuelve los campos re-commiteados.
   */
  protected async verifyAndRecommit(specs: ZkFieldSpec[]): Promise<string[]> {
    const recommitted: string[] = [];
    for (const spec of specs) {
      const opts = spec.options ?? {};
      const norm = (s: string) =>
        opts.normalize === 'digits' ? (s.match(/\d/g) || []).join('') : (s ?? '').trim();
      try {
        const field = await this.resolveVisible(spec.strategies, { index: opts.index, timeout: 2000 });
        if (spec.type === 'checkbox') {
          if (field && (await field.isChecked().catch(() => null)) !== Boolean(spec.value)) {
            await this.applyZkForm([spec]);
            recommitted.push(spec.label);
          }
          continue;
        }
        if (!field) {
          await this.applyZkForm([spec]);
          recommitted.push(spec.label);
          continue;
        }
        const actual = norm((await field.inputValue().catch(() => '')) ?? '');
        const invalid = await field
          .evaluate(
            (el) =>
              (el as HTMLElement).classList.contains('z-textbox-text-invalid') ||
              (el as HTMLElement).classList.contains('z-combobox-text-invalid')
          )
          .catch(() => false);
        const needs =
          spec.type === 'combo' ? !actual || invalid : actual !== norm(String(spec.value)) || invalid;
        if (needs) {
          await this.applyZkForm([spec]);
          recommitted.push(spec.label);
        }
      } catch (e) {
        this.logger.warn(
          { label: spec.label, error: (e as Error).message },
          'verifyAndRecommit: no se pudo re-verificar'
        );
      }
    }
    return recommitted;
  }

  /**
   * Punto ÚNICO de guardado: verifyAndRecommit(specs) → click submit (visible +
   * scroll + force fallback) → waitForLoadingToFinish → assert sin errores ZK visibles.
   */
  protected async submitZkForm(
    label: string,
    submitStrategies: SelectorStrategy[],
    specs: ZkFieldSpec[]
  ): Promise<void> {
    const recommitted = await this.verifyAndRecommit(specs);
    if (recommitted.length > 0) {
      this.logger.info({ label, recommitted }, 'Campos re-commiteados antes de guardar');
    }
    const btn = await this.resolveVisible(submitStrategies, { timeout: 15000 });
    if (!btn) throw new Error(`submitZkForm("${label}"): botón de guardado no encontrado/visible`);
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.click({ timeout: 8000 }).catch(async () => {
      await btn.click({ force: true, timeout: 8000 }).catch(() => {});
    });
    await this.waitForLoadingToFinish().catch(() => {});
    if (await this.hasZkErrors()) {
      const msgs = [...new Set(await this.getZkErrors())].filter((m) => m.trim());
      throw new Error(`El portal reportó errores al guardar "${label}": ${msgs.join('; ')}`);
    }
  }

  /**
   * Fill a field using the indexed field name pattern
   * Common in ZK forms: field_name, field_name_R1, field_name_R2, etc.
   *
   * @param baseName - Base field name (e.g., "email_datos_edit")
   * @param index - Zero-based index
   * @param value - Value to fill
   */
  protected async fillByNamePattern(
    baseName: string,
    index: number,
    value: string
  ): Promise<void> {
    const fieldName = getFieldNameByIndex(baseName, index);
    const selector = `input[name="${fieldName}"], textarea[name="${fieldName}"]`;

    const locator = this.page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: this.config.defaultTimeout });
    await locator.fill(value);
  }

  /**
   * Utility method to normalize text for comparison
   * Handles accents, spaces, and case
   */
  protected normalizeText(text: string): string {
    return normalizeText(text);
  }
}
