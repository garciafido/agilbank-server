import { Readable } from 'stream';
import type { Page } from 'playwright';
import type { Logger } from 'pino';
import type { IBotStorageService, ScreenshotResult, DomSnapshotResult } from '../core/types';
import { getStorageProvider } from '../../common/storage';
import { saveFileFromServer } from '../../common/utils/serverFileStorage';
import {
  captureScreenshot,
  captureMhtmlSnapshot,
  captureDomSnapshot,
  captureAccessibilityTree,
} from '../browser/ScreenshotHelper';

export class BotStorageService implements IBotStorageService {
  private basePath: string;
  private logger: Logger;
  private page: Page | null = null;
  private currentPhaseId: string | null = null;

  constructor(
    private botRunId: string,
    private botType: string,
    logger: Logger
  ) {
    this.logger = logger;
    // Path: bots/{botType}/runs/{botRunId}/
    this.basePath = `bots/${botType}/runs/${botRunId}`;
  }

  setPage(page: Page): void {
    this.page = page;
  }

  setCurrentPhaseId(phaseId: string | null): void {
    this.currentPhaseId = phaseId;
  }

  async saveScreenshot(
    page: Page,
    name: string,
    type: 'milestone' | 'error' | 'debug' = 'debug',
    phaseId?: string
  ): Promise<ScreenshotResult> {
    try {
      // ERROR captures use MHTML (single-file web archive: HTML + CSS + images + fonts
      // embedded as base64). Chrome/Edge open it natively and show the exact page state
      // with near-perfect visual fidelity — ideal for debugging a failed run where a
      // PNG alone would tell you nothing about form values, selectors, or DOM structure.
      // Non-error captures stay on PNG: lighter, faster, good enough for a pure audit
      // trail of a happy-path run. MHTML falls back to PNG if CDP is unavailable.
      let result: { buffer: Buffer; filename: string; mimeType: string } | null = null;
      if (type === 'error') {
        result = await captureMhtmlSnapshot(page, name);
        if (!result) {
          this.logger.warn({ name }, 'MHTML capture failed (CDP unavailable?), falling back to PNG');
        }
      }
      if (!result) {
        result = await captureScreenshot(page, name);
      }

      // If phaseId is provided, use the standard file storage system
      // This ensures screenshots are downloadable via the standard file download route
      if (phaseId) {
        const fileResult = await saveFileFromServer({
          buffer: result.buffer,
          filename: result.filename,
          mimetype: result.mimeType,
          entityName: 'BotPhase',
          fieldName: 'screenshot',
          entityId: phaseId,
        });

        this.logger.debug({ phaseId, filename: result.filename, type }, 'Screenshot saved to standard storage');

        return {
          key: fileResult.ticket,
          filename: result.filename,
          serverData: fileResult.serverData as ScreenshotResult['serverData'],
          clientData: fileResult.clientData as ScreenshotResult['clientData'],
        };
      }

      // No phaseId — this screenshot will most likely be linked to a BotError
      // (phase-8 catch block, BaseBotRunner error-path). Use the standard file
      // storage system with entityName="BotError" so BotErrorFileDownloadService
      // can resolve the key via path.join(baseName, uuid, filename) like every
      // other entity's download service.
      const fileResult = await saveFileFromServer({
        buffer: result.buffer,
        filename: result.filename,
        mimetype: result.mimeType,
        entityName: 'BotError',
        fieldName: 'screenshot',
        entityId: this.botRunId,
      });

      this.logger.debug({ filename: result.filename, type }, 'Screenshot saved to standard BotError storage');

      return {
        key: fileResult.ticket,
        filename: result.filename,
        serverData: fileResult.serverData as ScreenshotResult['serverData'],
        clientData: fileResult.clientData as ScreenshotResult['clientData'],
      };
    } catch (error) {
      this.logger.error({ error, name, type }, 'Failed to save screenshot');
      throw error;
    }
  }

  async screenshotMilestone(name: string, phaseId?: string): Promise<ScreenshotResult> {
    if (!this.page) {
      throw new Error('Page not set. Call setPage() before using screenshotMilestone()');
    }
    // Use provided phaseId or the current phaseId set via setCurrentPhaseId
    const effectivePhaseId = phaseId || this.currentPhaseId || undefined;
    return this.saveScreenshot(this.page, name, 'milestone', effectivePhaseId);
  }

  async saveDomSnapshot(page: Page, name: string): Promise<DomSnapshotResult> {
    try {
      const html = await captureDomSnapshot(page);
      const buffer = Buffer.from(html, 'utf8');
      const timestamp = Date.now();
      const filename = `${name}_${timestamp}.html`;

      // DOM snapshots are always linked to BotError (no other entity stores DOMs).
      // Use the standard file storage system with entityName="BotError" so
      // BotErrorFileDownloadService resolves the key via the standard
      // path.join(baseName, uuid, filename) pattern used by every entity.
      const fileResult = await saveFileFromServer({
        buffer,
        filename,
        mimetype: 'text/html',
        entityName: 'BotError',
        fieldName: 'domSnapshot',
        entityId: this.botRunId,
      });

      this.logger.debug({ filename }, 'DOM snapshot saved to standard BotError storage');

      return {
        key: fileResult.ticket,
        filename,
        serverData: fileResult.serverData as DomSnapshotResult['serverData'],
        clientData: fileResult.clientData as DomSnapshotResult['clientData'],
      };
    } catch (error) {
      this.logger.error({ error, name }, 'Failed to save DOM snapshot');
      throw error;
    }
  }

  async saveLog(content: string, filename: string): Promise<string> {
    try {
      const storage = getStorageProvider();
      const key = `${this.basePath}/logs/${filename}`;

      await storage.uploadStream(
        Readable.from(content),
        key,
        { contentType: 'text/plain' }
      );

      this.logger.debug({ key }, 'Log saved');
      return key;
    } catch (error) {
      this.logger.error({ error, filename }, 'Failed to save log');
      throw error;
    }
  }

  async saveAccessibilityTree(page: Page, name: string): Promise<string> {
    try {
      const storage = getStorageProvider();
      const tree = await captureAccessibilityTree(page);
      const timestamp = Date.now();
      const key = `${this.basePath}/accessibility/${name}_${timestamp}.json`;

      await storage.uploadStream(
        Readable.from(JSON.stringify(tree, null, 2)),
        key,
        { contentType: 'application/json' }
      );

      this.logger.debug({ key }, 'Accessibility tree saved');
      return key;
    } catch (error) {
      this.logger.error({ error, name }, 'Failed to save accessibility tree');
      throw error;
    }
  }

  async getArtifactUrl(key: string): Promise<string> {
    const storage = getStorageProvider();
    return storage.getDownloadUrl(key, 3600); // 1 hour expiry
  }

  async savePhaseStepsLog(phaseId: string, steps: unknown[]): Promise<string> {
    const content = JSON.stringify(steps, null, 2);
    return this.saveLog(content, `phases/${phaseId}_steps.json`);
  }

  async saveExecutionReport(report: string): Promise<string> {
    return this.saveLog(report, 'execution_report.md');
  }
}
