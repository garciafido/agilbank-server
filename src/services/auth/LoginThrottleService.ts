import { singleton } from 'tsyringe';
import { redis } from '../redis/redisClient';

/**
 * Login Throttle Service
 *
 * Implements progressive delay throttling for failed login attempts.
 * Uses Redis to track attempts per IP+email combination.
 *
 * Strategy (OWASP recommended):
 * - First 5 attempts: no delay
 * - 6th attempt: 2 second delay
 * - 7th attempt: 4 second delay
 * - 8th attempt: 8 second delay
 * - ... exponential backoff up to 60 seconds max
 * - Reset after 15 minutes of no attempts
 */
@singleton()
export class LoginThrottleService {
  private readonly KEY_PREFIX = 'login:throttle:';
  private readonly MAX_FREE_ATTEMPTS = 5;
  private readonly BASE_DELAY_MS = 2000; // 2 seconds
  private readonly MAX_DELAY_MS = 60000; // 60 seconds max
  private readonly TTL_SECONDS = 15 * 60; // 15 minutes TTL

  constructor() {}

  /**
   * Generate a unique key for IP + email combination
   */
  private getKey(ip: string, email: string): string {
    // Normalize email to lowercase and combine with IP
    const normalizedEmail = email.toLowerCase().trim();
    return `${this.KEY_PREFIX}${ip}:${normalizedEmail}`;
  }

  /**
   * Check if request should be throttled and apply delay if needed.
   * Call this BEFORE attempting login.
   *
   * @returns Object with shouldDelay (boolean) and delayMs (milliseconds to wait)
   */
  async checkThrottle(ip: string, email: string): Promise<{ shouldDelay: boolean; delayMs: number; attempts: number }> {
    const key = this.getKey(ip, email);

    try {
      const attemptsStr = await redis.get(key);
      const attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;

      if (attempts < this.MAX_FREE_ATTEMPTS) {
        return { shouldDelay: false, delayMs: 0, attempts };
      }

      // Calculate exponential delay
      const exponent = attempts - this.MAX_FREE_ATTEMPTS;
      const delayMs = Math.min(this.BASE_DELAY_MS * Math.pow(2, exponent), this.MAX_DELAY_MS);

      return { shouldDelay: true, delayMs, attempts };
    } catch (error) {
      console.error('[LoginThrottle] Error checking throttle:', error);
      // On Redis error, allow the request (fail open for availability)
      return { shouldDelay: false, delayMs: 0, attempts: 0 };
    }
  }

  /**
   * Record a failed login attempt.
   * Call this AFTER a failed login.
   */
  async recordFailedAttempt(ip: string, email: string): Promise<number> {
    const key = this.getKey(ip, email);

    try {
      // Increment attempts and set/refresh TTL
      const attempts = await redis.incr(key);
      await redis.expire(key, this.TTL_SECONDS);

      console.log(`[LoginThrottle] Failed attempt recorded for ${ip}:${email.substring(0, 3)}*** - total attempts: ${attempts}`);

      return attempts;
    } catch (error) {
      console.error('[LoginThrottle] Error recording failed attempt:', error);
      return 0;
    }
  }

  /**
   * Clear throttle state on successful login.
   * Call this AFTER a successful login.
   */
  async clearThrottle(ip: string, email: string): Promise<void> {
    const key = this.getKey(ip, email);

    try {
      await redis.del(key);
    } catch (error) {
      console.error('[LoginThrottle] Error clearing throttle:', error);
    }
  }

  /**
   * Apply delay by waiting the specified milliseconds.
   * Returns a promise that resolves after the delay.
   */
  async applyDelay(delayMs: number): Promise<void> {
    if (delayMs > 0) {
      console.log(`[LoginThrottle] Applying delay of ${delayMs}ms`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Convenience method: check throttle and apply delay if needed.
   * Returns the current attempt count.
   */
  async throttleIfNeeded(ip: string, email: string): Promise<number> {
    const { shouldDelay, delayMs, attempts } = await this.checkThrottle(ip, email);

    if (shouldDelay) {
      await this.applyDelay(delayMs);
    }

    return attempts;
  }
}
