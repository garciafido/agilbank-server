import type { Page, Browser, BrowserContext } from 'playwright';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { ProxyInfo } from '../../satellite/types';

// ============================================================================
// STATUS TYPES
// ============================================================================

export type BotStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'requires_intervention';

export type PhaseStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped';

export type StepStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped';

export type ErrorSeverity = 'critical' | 'warning' | 'info';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface BotProxyConfig {
  server: string;       // e.g., "http://host:port" (tunnel) or "socks5://host:port" (direct)
  bypass?: string[];    // hosts to bypass proxy
  username?: string;    // Proxy auth username (satelliteId for tunnel routing)
  password?: string;    // Proxy auth password
}

export interface BotConfig {
  headless: boolean;
  defaultTimeout: number;
  defaultRetries: number;
  retryDelay: number;
  retryBackoffMultiplier: number;
  debugMode: boolean;
  screenshotOnError: boolean;
  screenshotOnMilestone: boolean;
  /**
   * When true, step-level helpers (e.g. runStep) capture before/after screenshots
   * on every step. Intended for debugging — default is false so production runs
   * don't flood storage with per-step captures.
   */
  screenshotOnStep: boolean;
  browserArgs?: string[];
  proxy?: BotProxyConfig;
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  headless: process.env.BOT_HEADLESS !== 'false',
  defaultTimeout: parseInt(process.env.BOT_DEFAULT_TIMEOUT || '30000', 10),
  defaultRetries: parseInt(process.env.BOT_DEFAULT_RETRIES || '3', 10),
  retryDelay: parseInt(process.env.BOT_RETRY_DELAY || '2000', 10),
  retryBackoffMultiplier: 2,
  debugMode: process.env.BOT_DEBUG_MODE === 'true',
  screenshotOnError: process.env.BOT_SCREENSHOT_ON_ERROR !== 'false',
  screenshotOnMilestone: process.env.BOT_SCREENSHOT_ON_MILESTONE !== 'false',
  screenshotOnStep: process.env.BOT_SCREENSHOT_ON_STEP === 'true',
  browserArgs: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
  ],
};

// ============================================================================
// USER CREDENTIALS (generic - project-specific implementations extend this)
// ============================================================================

/**
 * Generic user credentials interface.
 * Projects should define their own specific credentials interface.
 * Example: DndaUserCredentials { idCard, procedureNumber, gender }
 */
export type UserCredentials = Record<string, unknown>;

// ============================================================================
// CONTEXT
// ============================================================================

export interface BotContext {
  // Identification
  botRunId: string;
  botType: string;
  correlationId: string;

  // Browser/Page (set after browser initialization)
  browser?: Browser;
  browserContext?: BrowserContext;
  page?: Page;

  // Services (injected)
  storage: IBotStorageService;
  tracking: IBotTrackingService;
  notification: IBotNotificationService;
  logger: Logger;

  // Data
  params: Record<string, unknown>;
  userCredentials: UserCredentials;

  // State
  state: BotState;

  // Configuration
  config: BotConfig;

  // Database
  prisma: PrismaClient;
  tenantId: string;
  userId: string;

  // Proxy (optional, set when bot uses proxy pool)
  proxyInfo?: ProxyInfo;

  // Simulación (presente solo en runs simulados). El proyecto branchea en sus boundaries.
  simulation?: import('../../workers/simulation/types').SimulationContext;
}

export interface BotState {
  currentPhase: string | null;
  currentStep: string | null;
  completedPhases: string[];
  completedSteps: string[];
  phaseOutputs: Record<string, unknown>;
  stepOutputs: Record<string, unknown>;
  variables: Record<string, unknown>;
  errors: BotErrorRecord[];
  startedAt: Date;
  lastUpdatedAt: Date;
}

// ============================================================================
// STEP DEFINITIONS
// ============================================================================

export interface StepDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  description?: string;
  order: number;
  required: boolean;
  retryable: boolean;
  maxRetries?: number;
  timeout?: number;

  execute: (
    context: BotContext,
    input: TInput
  ) => Promise<StepResult<TOutput>>;

  validate?: (context: BotContext, input: TInput) => Promise<boolean>;
  rollback?: (context: BotContext) => Promise<void>;
}

export interface StepResult<TOutput = unknown> {
  status: 'success' | 'failed' | 'skipped';
  output?: TOutput;
  error?: {
    message: string;
    code?: string;
    recoverable: boolean;
    requiresHumanIntervention: boolean;
  };
  metrics?: {
    duration: number;
    strategyUsed?: string;
    retryCount?: number;
  };
  nextStep?: string;
}

// ============================================================================
// PHASE DEFINITIONS
// ============================================================================

export interface PhaseDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  description?: string;
  order: number;
  required: boolean;
  steps: StepDefinition[];

  execute: (context: BotContext, input: TInput) => Promise<PhaseResult<TOutput>>;
  validate?: (context: BotContext, input: TInput) => Promise<boolean>;
}

export interface PhaseResult<TOutput = unknown> {
  status: PhaseStatus;
  output?: TOutput;
  stepsCompleted: number;
  stepsTotal: number;
  error?: BotErrorRecord;
  screenshotPath?: string;
}

// ============================================================================
// BOT RUNNER INTERFACE
// ============================================================================

export interface IBotRunner {
  readonly botType: string;
  readonly phases: PhaseDefinition[];
  /**
   * Si es false, el orquestador NO lanza browser (Playwright) y `context.page`
   * queda undefined. Para bots no-browser (FTP, email/IMAP, etc.). Default: true.
   */
  readonly requiresBrowser?: boolean;

  /**
   * Si es false, las FALLAS e intervenciones de este bot NO se notifican por
   * email a los usuarios del tenant — quedan solo en el canal del operador
   * (error operacional + /automation). Para bots cuya recuperación no depende
   * del cliente. El éxito se notifica igual. Default: true.
   */
  readonly notifyClientOnFailure?: boolean;

  initialize(context: BotContext): Promise<void>;
  run(): Promise<BotRunResult>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  abort(reason: string): Promise<void>;
  cleanup(): Promise<void>;
}

export interface BotRunResult {
  status: BotStatus;
  botRunId: string;
  startedAt: Date;
  completedAt: Date;
  totalPhases: number;
  completedPhases: number;
  failedPhases: number;
  duration: number;
  result?: Record<string, unknown>;
  error?: BotErrorRecord;
  requiresHumanIntervention: boolean;
  interventionReason?: string;
}

// ============================================================================
// ERROR RECORDS
// ============================================================================

export interface BotErrorRecord {
  errorType: string;
  severity: ErrorSeverity;
  message: string;
  stackTrace?: string;
  context: Record<string, unknown>;
  recoverable: boolean;
  requiresHumanIntervention: boolean;
  phaseId?: string;
  stepId?: string;
  /**
   * Full screenshot file reference (key + filename + serverData + clientData).
   * Preferred over screenshotPath because it allows proper population of the
   * BotError.screenshot + screenshot_server_data + screenshot_data DB columns.
   */
  screenshot?: ScreenshotResult;
  /**
   * @deprecated Use `screenshot` (ScreenshotResult). String path cannot populate
   * the file metadata columns of BotError.screenshot.
   */
  screenshotPath?: string;
  /**
   * Full DOM snapshot file reference. Populates BotError.domSnapshot + _server_data + _data.
   */
  domSnapshot?: DomSnapshotResult;
  /**
   * @deprecated Use `domSnapshot` (DomSnapshotResult).
   */
  domSnapshotPath?: string;
  timestamp: Date;
}

/**
 * Custom error class for recoverable bot errors.
 * When thrown, the worker will retry with exponential backoff.
 * Non-recoverable errors go directly to DLQ after phase-level retries.
 */
export class RecoverableBotError extends Error {
  public readonly recoverable: boolean;
  public readonly errorType: string;
  public readonly botRunId?: string;

  constructor(message: string, errorType: string, recoverable: boolean, botRunId?: string) {
    super(message);
    this.name = 'RecoverableBotError';
    this.errorType = errorType;
    this.recoverable = recoverable;
    this.botRunId = botRunId;
  }

  static fromBotErrorRecord(error: BotErrorRecord, botRunId?: string): RecoverableBotError {
    return new RecoverableBotError(
      error.message,
      error.errorType,
      error.recoverable,
      botRunId
    );
  }
}

// ============================================================================
// FILE METADATA TYPES
// ============================================================================

export interface FileServerData {
  baseName: string;
  filename: string;
  mimetype: string;
  size: number;
  uuid: string;
}

export interface FileClientData {
  name: string;
  mimetype: string;
  size: number;
  url: string;
}

export interface ScreenshotResult {
  key: string;
  filename: string;
  serverData: FileServerData;
  clientData: FileClientData;
}

/**
 * DOM snapshot file reference — same shape as ScreenshotResult but for HTML snapshots.
 * Used by BotError.domSnapshot to store the full file metadata (3 DB columns).
 */
export interface DomSnapshotResult {
  key: string;
  filename: string;
  serverData: FileServerData;
  clientData: FileClientData;
}

export interface StepFileData {
  filename: string;
  serverData: Record<string, unknown>;
  clientData: Record<string, unknown>;
}

export interface CompleteStepOptions {
  error?: Record<string, unknown>;
  downloadedFile?: StepFileData;
}

// ============================================================================
// SERVICE INTERFACES
// ============================================================================

export interface IBotStorageService {
  setPage(page: Page): void;
  setCurrentPhaseId(phaseId: string | null): void;

  saveScreenshot(
    page: Page,
    name: string,
    type?: 'milestone' | 'error' | 'debug',
    phaseId?: string
  ): Promise<ScreenshotResult>;

  screenshotMilestone(name: string, phaseId?: string): Promise<ScreenshotResult>;

  saveDomSnapshot(page: Page, name: string): Promise<DomSnapshotResult>;
  saveLog(content: string, filename: string): Promise<string>;
  saveAccessibilityTree(page: Page, name: string): Promise<string>;
  getArtifactUrl(key: string): Promise<string>;
}

export interface IBotTrackingService {
  createBotRun(data: CreateBotRunData): Promise<{ id: string }>;
  updateBotRun(id: string, data: UpdateBotRunData): Promise<void>;

  createBotPhase(data: CreateBotPhaseData): Promise<{ id: string }>;
  updateBotPhase(id: string, data: UpdateBotPhaseData): Promise<void>;

  createBotError(data: CreateBotErrorData): Promise<{ id: string }>;

  // Step tracking
  setCurrentPhaseId(phaseId: string | null): void;
  startStep(stepId: string): Promise<{ id: string } | null>;
  completeStep(stepId: string, options?: CompleteStepOptions): Promise<void>;
  failPendingSteps(phaseId: string, error: Record<string, unknown>): Promise<void>;

  // Cancellation support
  isCancellationRequested(botRunId: string): Promise<boolean>;
  requestCancellation(botRunId: string, reason: string, requestedById: string): Promise<void>;
  findRunningBotByRelatedEntity(
    relatedEntityId: string,
    relatedEntityType: string,
    tenantId: string
  ): Promise<{ id: string } | null>;
}

export interface IBotNotificationService {
  notifyCompletion(
    botRunId: string,
    status: 'success' | 'failed' | 'requires_intervention',
    summary: NotificationSummary
  ): Promise<void>;
}

// ============================================================================
// SERVICE DATA TYPES
// ============================================================================

export interface CreateBotRunData {
  botType: string;
  status: BotStatus;
  correlationId: string;
  params: Record<string, unknown>;
  totalPhases: number;
  triggeredById: string;
  workerEventId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  relatedEntityLabel?: string;
  startedAt?: Date;
}

export interface UpdateBotRunData {
  status?: BotStatus;
  currentPhase?: string | null;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  result?: Record<string, unknown>;
  error?: Record<string, unknown>;
  completedPhases?: number;
  requiresHumanIntervention?: boolean;
  interventionReason?: string;
  logsPath?: string;
}

export interface CreateBotPhaseData {
  botRunId: string;
  phaseNumber: number;
  phaseId: string;
  phaseName: string;
  status: PhaseStatus;
  stepsTotal: number;
  stepsCompleted: number;
}

export interface UpdateBotPhaseData {
  status?: PhaseStatus;
  stepsCompleted?: number;
  stepsTotal?: number;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  error?: Record<string, unknown>;
  stepsLogPath?: string;
  screenshot?: ScreenshotResult;
}

export interface CreateBotErrorData {
  botRunId: string;
  botPhaseId?: string;
  errorType: string;
  severity: ErrorSeverity;
  message: string;
  stackTrace?: string;
  context: Record<string, unknown>;
  recoverable: boolean;
  requiresHumanIntervention: boolean;
  /**
   * Full screenshot reference — populates BotError.screenshot + _server_data + _data.
   * Preferred over screenshotId (string) which only sets the single `screenshot` column.
   */
  screenshot?: ScreenshotResult;
  /**
   * Full DOM snapshot reference — populates BotError.domSnapshot + _server_data + _data.
   */
  domSnapshot?: DomSnapshotResult;
  /**
   * @deprecated Use `screenshot` for proper file metadata. Kept for backwards compat:
   * sets only the `screenshot` column without _server_data/_data.
   */
  screenshotId?: string;
  /**
   * @deprecated Use `domSnapshot` for proper file metadata.
   */
  domSnapshotId?: string;
}

export interface NotificationSummary {
  botType: string;
  runNumber?: number;
  duration: number;
  totalPhases: number;
  completedPhases: number;
  failedPhases: number;
  errorMessage?: string;
  screenshotUrl?: string;
  botRunUrl?: string;
}

// ============================================================================
// INTERACTION STRATEGY (for multi-fallback selectors)
// ============================================================================

export interface InteractionStrategy {
  name: string;
  selector: string;
  type?: 'css' | 'xpath' | 'text' | 'role';
  options?: {
    exact?: boolean;
    hasText?: string;
    timeout?: number;
  };
}

export interface InteractionResult {
  success: boolean;
  strategyUsed?: string;
  error?: Error;
  duration: number;
}

// ============================================================================
// BOT EXECUTION PARAMS
// ============================================================================

export interface BotProxyOptions {
  region?: string;
  countryCode?: string;
}

export interface BotRegionConfig {
  countryCode: string;  // ISO country code (e.g., "ar", "us")
}

export interface BotExecutionParams {
  params: Record<string, unknown>;
  triggeredById: string;
  workerEventId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** Nombre legible (displayId) de la entidad relacionada — identifica el run en listados. */
  relatedEntityLabel?: string;
  correlationId?: string;
  // Proxy configuration (always use proxy)
  useProxy?: boolean;
  requireProxy?: boolean;
  proxyOptions?: BotProxyOptions;
  // Region configuration (use proxy only if not in required region)
  regionConfig?: BotRegionConfig;
  // Simulación (thread-eada desde el pipeline service en runs simulados)
  simulation?: import('../../workers/simulation/types').SimulationContext;
}

// ============================================================================
// BOT REGISTRY
// ============================================================================

export type BotRunnerFactory = (context: BotContext) => IBotRunner;

export interface BotRegistry {
  register(botType: string, factory: BotRunnerFactory): void;
  get(botType: string): BotRunnerFactory | undefined;
  has(botType: string): boolean;
  list(): string[];
}
