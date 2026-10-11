import type { BotContext } from './types';

export interface RunStepOptions {
  /**
   * Take a screenshot before the action. Default: follows ctx.config.screenshotOnStep.
   */
  screenshotBefore?: boolean;
  /**
   * Take a screenshot after a successful action. Default: follows ctx.config.screenshotOnStep.
   */
  screenshotAfter?: boolean;
  /**
   * Take a screenshot when the action throws. Default: follows ctx.config.screenshotOnError.
   * Captured immediately on failure, before any subsequent wait can change the page state.
   */
  screenshotOnError?: boolean;
  /**
   * errorType to include in tracking.completeStep's error payload when the action fails.
   * Default: 'step_failed'.
   */
  errorType?: string;
}

/**
 * Wraps the standard tracking.startStep / action / tracking.completeStep pattern
 * with configurable automatic screenshots.
 *
 * On success: optional before/after screenshots (tagged 'debug' and 'milestone').
 * On failure: optional error screenshot captured *immediately*, step completed with
 * the error payload, and the error is re-thrown so the surrounding phase can handle
 * it (e.g. return a failed result so BaseBotRunner creates the BotError entity).
 *
 * All screenshots are opt-in via BotConfig flags. In production, with
 * screenshotOnStep=false and screenshotOnError=true, only error captures run.
 */
export async function runStep<T>(
  ctx: BotContext,
  stepId: string,
  action: () => Promise<T>,
  options: RunStepOptions = {}
): Promise<T> {
  const { tracking, storage, page, logger, config } = ctx;

  const shouldScreenshotBefore = options.screenshotBefore ?? config.screenshotOnStep;
  const shouldScreenshotAfter = options.screenshotAfter ?? config.screenshotOnStep;
  const shouldScreenshotError = options.screenshotOnError ?? config.screenshotOnError;

  await tracking.startStep(stepId);

  if (shouldScreenshotBefore && page) {
    try {
      await storage.saveScreenshot(page, `step_${stepId}_before`, 'debug');
    } catch (e) {
      logger.warn({ stepId, error: e }, 'Failed to capture step-before screenshot');
    }
  }

  try {
    const result = await action();

    if (shouldScreenshotAfter && page) {
      try {
        await storage.saveScreenshot(page, `step_${stepId}_after`, 'milestone');
      } catch (e) {
        logger.warn({ stepId, error: e }, 'Failed to capture step-after screenshot');
      }
    }

    await tracking.completeStep(stepId, {});
    return result;
  } catch (error) {
    const err = error as Error;

    // Capture the error screenshot immediately, before any outer await can
    // change the page state (dismissed modals, navigated away, etc).
    if (shouldScreenshotError && page) {
      try {
        await storage.saveScreenshot(page, `step_${stepId}_error`, 'error');
      } catch (e) {
        logger.warn({ stepId, error: e }, 'Failed to capture step-error screenshot');
      }
    }

    try {
      await tracking.completeStep(stepId, {
        error: {
          errorType: options.errorType ?? 'step_failed',
          message: err.message,
          stackTrace: err.stack,
        },
      });
    } catch (e) {
      logger.warn({ stepId, error: e }, 'Failed to mark step as failed');
    }

    throw error;
  }
}
