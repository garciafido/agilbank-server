import type { IBotRunner } from './core/types';

type BotRunnerConstructor = new () => IBotRunner;

const botRegistry = new Map<string, BotRunnerConstructor>();

/**
 * Register a bot runner class in the registry.
 * This should be called during application initialization.
 *
 * Example:
 * ```typescript
 * import { registerBotRunner } from '../bots';
 * import { DndaBotRunner } from './implementations/dnda/DndaBotRunner';
 *
 * registerBotRunner('dnda', DndaBotRunner);
 * ```
 */
export function registerBotRunner(botType: string, runnerClass: BotRunnerConstructor): void {
  if (botRegistry.has(botType)) {
    throw new Error(`Bot type "${botType}" is already registered`);
  }
  botRegistry.set(botType, runnerClass);
}

/**
 * Get a bot runner class from the registry.
 */
export function getBotRunner(botType: string): BotRunnerConstructor | undefined {
  return botRegistry.get(botType);
}

/**
 * Check if a bot type is registered.
 */
export function hasBotRunner(botType: string): boolean {
  return botRegistry.has(botType);
}

/**
 * Get all registered bot types.
 */
export function getRegisteredBotTypes(): string[] {
  return Array.from(botRegistry.keys());
}

/**
 * Unregister a bot runner (useful for testing).
 */
export function unregisterBotRunner(botType: string): boolean {
  return botRegistry.delete(botType);
}

/**
 * Clear all registered bots (useful for testing).
 */
export function clearBotRegistry(): void {
  botRegistry.clear();
}
