import { chromium, Browser, BrowserContext, Page } from 'playwright';
import type { Logger } from 'pino';
import type { BotConfig } from '../core/types';

export interface BrowserLaunchOptions {
  config: BotConfig;
  logger: Logger;
  userAgent?: string;
  locale?: string;
  timezone?: string;
  viewport?: { width: number; height: number };
}

export interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private logger: Logger;
  private config: BotConfig;

  constructor(options: BrowserLaunchOptions) {
    this.logger = options.logger;
    this.config = options.config;
  }

  async launch(options?: Partial<BrowserLaunchOptions>): Promise<BrowserInstance> {
    const mergedOptions = { ...this.config, ...options };

    this.logger.info(
      {
        headless: mergedOptions.headless,
        proxy: this.config.proxy ? this.config.proxy.server : undefined,
      },
      'Launching browser'
    );

    try {
      // Use system Chromium if PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is set (Docker/Alpine)
      const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

      // Playwright con headless:true usa el "headless shell", cuyo fingerprint
      // algunos WAFs (Incapsula, p.ej. el portal de ANSES) detectan y bloquean.
      // Para headless usamos el NEW headless (--headless=new): mismo fingerprint
      // que headed y sin necesidad de display. Se sigue controlando con
      // BOT_HEADLESS del .env (headless=false → headed real en dev).
      const wantsHeadless = mergedOptions.headless;
      const launchArgs = mergedOptions.browserArgs || [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ];

      this.browser = await chromium.launch({
        headless: false,
        ...(executablePath && { executablePath }),
        args: wantsHeadless ? ['--headless=new', ...launchArgs] : launchArgs,
      });

      this.context = await this.browser.newContext({
        viewport: options?.viewport || DEFAULT_VIEWPORT,
        userAgent: options?.userAgent || DEFAULT_USER_AGENT,
        locale: options?.locale || 'es-AR',
        timezoneId: options?.timezone || 'America/Argentina/Buenos_Aires',
        // Stealth settings
        javaScriptEnabled: true,
        hasTouch: false,
        isMobile: false,
        // Proxy configuration (SOCKS5 from satellite pool)
        ...(this.config.proxy && {
          proxy: {
            server: this.config.proxy.server,
            bypass: this.config.proxy.bypass?.join(','),
            username: this.config.proxy.username,
            password: this.config.proxy.password,
          },
        }),
      });

      // Set default timeouts. La NAVEGACIÓN necesita más margen que las esperas de
      // elemento: los redirects de portales de gobierno (ej. AFIP/Clave Fiscal en TAD)
      // pueden tardar ~90s y un default justo los mata en el borde. Piso de 180s para
      // navegación, sin inflar el element-timeout (que define qué tan rápido falla un
      // elemento ausente).
      this.context.setDefaultTimeout(mergedOptions.defaultTimeout);
      this.context.setDefaultNavigationTimeout(Math.max(180000, mergedOptions.defaultTimeout));

      this.page = await this.context.newPage();

      // Anti-detection: Override navigator.webdriver
      await this.page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
      });

      this.logger.info('Browser launched successfully');

      return {
        browser: this.browser,
        context: this.context,
        page: this.page,
      };
    } catch (error) {
      this.logger.error({ error }, 'Failed to launch browser');
      await this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    this.logger.info('Closing browser');

    try {
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }

      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
      }

      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }

      this.logger.info('Browser closed successfully');
    } catch (error) {
      this.logger.error({ error }, 'Error closing browser');
    }
  }

  getPage(): Page | null {
    return this.page;
  }

  getContext(): BrowserContext | null {
    return this.context;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  isLaunched(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }
}
