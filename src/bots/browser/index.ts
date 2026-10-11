export { BrowserManager } from './BrowserManager';
export type { BrowserLaunchOptions, BrowserInstance } from './BrowserManager';

export {
  tryInteraction,
  waitForNavigation,
  waitForElement,
  sleep,
  calculateBackoff,
} from './InteractionStrategy';
export type {
  InteractionAction,
  SelectorStrategy,
  InteractionOptions
} from './InteractionStrategy';

export {
  captureScreenshot,
  captureDomSnapshot,
  captureAccessibilityTree,
  capturePageInfo,
  createErrorSnapshot,
} from './ScreenshotHelper';
export type { ScreenshotOptions, ScreenshotResult } from './ScreenshotHelper';
