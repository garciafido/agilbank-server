import type { Page } from 'playwright';
import type { Logger } from 'pino';

export interface ScreenshotOptions {
  fullPage?: boolean;
  quality?: number;
  type?: 'png' | 'jpeg';
}

export interface ScreenshotResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export async function captureScreenshot(
  page: Page,
  name: string,
  options?: ScreenshotOptions
): Promise<ScreenshotResult> {
  const { fullPage = true, quality, type = 'png' } = options || {};

  const buffer = await page.screenshot({
    fullPage,
    type,
    quality: type === 'jpeg' ? quality : undefined,
  });

  const timestamp = Date.now();
  const extension = type === 'jpeg' ? 'jpg' : 'png';
  const filename = `${name}_${timestamp}.${extension}`;
  const mimeType = type === 'jpeg' ? 'image/jpeg' : 'image/png';

  return { buffer, filename, mimeType };
}

/**
 * Inject LIVE form values into HTML attributes so any subsequent serialization
 * of the DOM (via `page.content()` or CDP `Page.captureSnapshot`) reflects what
 * the user actually sees on screen.
 *
 * Why this is needed: frameworks like ZK / React / Angular render inputs with
 * `value="..."` attributes set to the INITIAL values; live typed/selected state
 * lives only on the DOM element's `.value` / `.checked` properties, which is
 * invisible in any static HTML serialization. That means captures (HTML or
 * MHTML) show the wrong values when a form has been partially filled — exactly
 * when we most need the capture for debugging.
 *
 * Transformations applied:
 *   - HTMLInputElement.value            → `value="..."` attribute
 *   - HTMLInputElement.checked          → `checked` attribute (set / removed)
 *   - HTMLTextAreaElement.value         → `textContent` of the textarea
 *   - HTMLSelectElement option.selected → `selected` attribute on each option
 *
 * Best-effort: all errors are swallowed (both inside the page and around the
 * `evaluate` call). A partially-injected DOM is always better than losing the
 * whole snapshot to a single bad element or a weird page state.
 *
 * Shared between `captureDomSnapshot` (plain HTML) and `captureMhtmlSnapshot`
 * (MHTML web archive) so both produce captures that reflect live form state.
 */
async function injectLiveValuesIntoDom(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      // Un secreto inyectado acá termina EN CLARO dentro de la captura, que se
      // sube a object storage y se descarga desde la UI. Se redacta en origen,
      // conservando la señal que hace útil la captura: si el campo tenía algo.
      // El criterio es deliberadamente amplio — los portales de gobierno usan
      // inputs de texto para claves más de una vez, y el costo de redactar de
      // más es una captura menos informativa, no una credencial expuesta.
      const SECRET_NAME = /pass|pwd|clave|secret|token|otp|pin|c[oó]digo/i;
      const isSecret = (input: HTMLInputElement): boolean =>
        input.type === 'password' ||
        SECRET_NAME.test(input.name || '') ||
        SECRET_NAME.test(input.id || '') ||
        SECRET_NAME.test(input.getAttribute('autocomplete') || '');

      try {
        document.querySelectorAll('input').forEach((el) => {
          const input = el as HTMLInputElement;
          if (input.type === 'checkbox' || input.type === 'radio') {
            if (input.checked) {
              input.setAttribute('checked', 'checked');
            } else {
              input.removeAttribute('checked');
            }
          } else if (isSecret(input)) {
            input.setAttribute('value', input.value ? '[REDACTADO]' : '');
          } else {
            input.setAttribute('value', input.value ?? '');
          }
        });

        document.querySelectorAll('textarea').forEach((el) => {
          const ta = el as HTMLTextAreaElement;
          ta.textContent = ta.value ?? '';
        });

        document.querySelectorAll('select').forEach((el) => {
          const sel = el as HTMLSelectElement;
          Array.from(sel.options).forEach((opt) => {
            if (opt.selected) {
              opt.setAttribute('selected', 'selected');
            } else {
              opt.removeAttribute('selected');
            }
          });
        });
      } catch {
        // Best-effort: a single bad element should not break the whole injection.
      }
    });
  } catch {
    // page.evaluate itself may fail if the page is in an unusual state.
    // Fall through — callers still get a snapshot, just without live values.
  }
}

/**
 * Capture the full HTML of the current page with LIVE form values injected
 * into HTML attributes first. See `injectLiveValuesIntoDom` for the rationale.
 */
export async function captureDomSnapshot(page: Page): Promise<string> {
  await injectLiveValuesIntoDom(page);
  return await page.content();
}

/**
 * Capture a self-contained MHTML snapshot of the current page via CDP.
 *
 * MHTML (MIME HTML) is a single-file web archive format that embeds HTML, CSS,
 * images, fonts and other resources as base64 MIME parts. Chrome and Edge open
 * it natively with a double-click and render the page with near-perfect fidelity
 * to the original state — far more useful for debugging failed bot runs than:
 *
 *   - A PNG — just pixels, can't click, can't grep, can't inspect the DOM.
 *   - A plain HTML DOM dump — missing CSS/images/fonts, unreadable offline.
 *
 * This is why we use MHTML specifically for ERROR captures and keep PNG for
 * success milestones (which only need a thumbnail-quality audit trail).
 *
 * **Chromium only**: uses `Page.captureSnapshot({format: 'mhtml'})` via a CDP
 * session, which is not available on Firefox/WebKit. Returns null on non-Chromium
 * so callers can fall back to a plain PNG and not lose the capture.
 *
 * Live form values are injected into HTML attributes before the CDP snapshot is
 * taken (same trick as `captureDomSnapshot`), otherwise the captured MHTML would
 * reflect the framework's initial values rather than what the user actually
 * typed — which defeats the whole point of debugging a failed form submission.
 */
export async function captureMhtmlSnapshot(
  page: Page,
  name: string
): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null> {
  try {
    // Inject live values into the DOM BEFORE the CDP capture, so the serialized
    // HTML inside the MHTML reflects current form state.
    await injectLiveValuesIntoDom(page);

    const client = await page.context().newCDPSession(page);
    try {
      const response = (await client.send('Page.captureSnapshot', {
        format: 'mhtml',
      })) as { data: string };
      const timestamp = Date.now();
      const filename = `${name}_${timestamp}.mhtml`;
      return {
        buffer: Buffer.from(response.data, 'utf8'),
        filename,
        mimeType: 'multipart/related',
      };
    } finally {
      await client.detach().catch(() => {});
    }
  } catch {
    // CDP not available (non-Chromium), page closed, or serialization failed.
    // Return null so the caller falls back to a PNG rather than losing the capture.
    return null;
  }
}

export async function captureAccessibilityTree(page: Page): Promise<Record<string, unknown> | null> {
  return await page.accessibility.snapshot();
}

export async function capturePageInfo(page: Page): Promise<Record<string, unknown>> {
  const url = page.url();
  const title = await page.title();
  const viewport = page.viewportSize();

  return {
    url,
    title,
    viewport,
    timestamp: new Date().toISOString(),
  };
}

export async function createErrorSnapshot(
  page: Page,
  errorMessage: string,
  logger: Logger
): Promise<{
  screenshot: Buffer;
  html: string;
  pageInfo: Record<string, unknown>;
}> {
  logger.debug('Creating error snapshot');

  const [screenshot, html, pageInfo] = await Promise.all([
    page.screenshot({ fullPage: true }).catch(() => Buffer.from('')),
    page.content().catch(() => ''),
    capturePageInfo(page).catch(() => ({})),
  ]);

  return {
    screenshot,
    html,
    pageInfo: {
      ...pageInfo,
      errorMessage,
    },
  };
}
