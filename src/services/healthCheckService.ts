import { basePrisma } from "../prisma/client";
import { logger } from "../utils/logger";
import { promises as fs } from "fs";
import * as os from "os";

export interface HealthStatus {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  checks: {
    [key: string]: CheckResult;
  };
}

export interface CheckResult {
  status: "pass" | "fail" | "warn";
  message?: string;
  responseTime?: number;
  details?: any;
}

export class HealthCheckService {
  private static instance: HealthCheckService;
  private startTime: number;

  private constructor() {
    this.startTime = Date.now();
  }

  public static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }

  /**
   * Liveness probe - Is the application process running?
   * This should be lightweight and not depend on external services
   */
  public async getLivenessStatus(): Promise<HealthStatus> {
    const status: HealthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown",
      environment: process.env.NODE_ENV || "development",
      uptime: process.uptime(),
      checks: {
        process: this.checkProcess(),
        memory: await this.checkMemory(),
      },
    };

    // Determine overall status
    const hasFailure = Object.values(status.checks).some(
      (check) => check.status === "fail"
    );
    const hasWarning = Object.values(status.checks).some(
      (check) => check.status === "warn"
    );

    if (hasFailure) {
      status.status = "unhealthy";
    } else if (hasWarning) {
      status.status = "degraded";
    }

    return status;
  }

  /**
   * Readiness probe - Can the application serve requests?
   * This checks dependencies like database, redis, etc.
   */
  public async getReadinessStatus(): Promise<HealthStatus> {
    const status: HealthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown",
      environment: process.env.NODE_ENV || "development",
      uptime: process.uptime(),
      checks: {
        database: await this.checkDatabase(),
        diskSpace: await this.checkDiskSpace(),
        // Add more dependency checks here as needed
        // redis: await this.checkRedis(),
        // externalAPI: await this.checkExternalAPI(),
      },
    };

    // Determine overall status
    const hasFailure = Object.values(status.checks).some(
      (check) => check.status === "fail"
    );
    const hasWarning = Object.values(status.checks).some(
      (check) => check.status === "warn"
    );

    if (hasFailure) {
      status.status = "unhealthy";
    } else if (hasWarning) {
      status.status = "degraded";
    }

    return status;
  }

  /**
   * Startup probe - Has the application finished initializing?
   * Used by orchestrators to know when the container has started successfully
   */
  public async getStartupStatus(): Promise<HealthStatus> {
    const status: HealthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown",
      environment: process.env.NODE_ENV || "development",
      uptime: process.uptime(),
      checks: {
        initialization: this.checkInitialization(),
        database: await this.checkDatabase(),
      },
    };

    // Determine overall status
    const hasFailure = Object.values(status.checks).some(
      (check) => check.status === "fail"
    );

    if (hasFailure) {
      status.status = "unhealthy";
    }

    return status;
  }

  /**
   * Combined health check - includes all checks
   * This is the original /health endpoint behavior
   */
  public async getFullHealthStatus(): Promise<HealthStatus> {
    const [liveness, readiness] = await Promise.all([
      this.getLivenessStatus(),
      this.getReadinessStatus(),
    ]);

    // Merge all checks
    const allChecks = {
      ...liveness.checks,
      ...readiness.checks,
    };

    const status: HealthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown",
      environment: process.env.NODE_ENV || "development",
      uptime: process.uptime(),
      checks: allChecks,
    };

    // Determine overall status
    const hasFailure = Object.values(status.checks).some(
      (check) => check.status === "fail"
    );
    const hasWarning = Object.values(status.checks).some(
      (check) => check.status === "warn"
    );

    if (hasFailure) {
      status.status = "unhealthy";
    } else if (hasWarning) {
      status.status = "degraded";
    }

    return status;
  }

  // Individual check methods

  private checkProcess(): CheckResult {
    try {
      return {
        status: "pass",
        details: {
          pid: process.pid,
          platform: process.platform,
          nodeVersion: process.version,
          uptime: process.uptime(),
        },
      };
    } catch (error) {
      return {
        status: "fail",
        message: "Failed to check process status",
      };
    }
  }

  private async checkMemory(): Promise<CheckResult> {
    try {
      const memoryUsage = process.memoryUsage();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryUsagePercent = (usedMemory / totalMemory) * 100;

      // Warn if memory usage is above 80%
      if (memoryUsagePercent > 80) {
        return {
          status: "warn",
          message: `High memory usage: ${memoryUsagePercent.toFixed(2)}%`,
          details: {
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            external: Math.round(memoryUsage.external / 1024 / 1024),
            systemMemoryUsagePercent: memoryUsagePercent.toFixed(2),
          },
        };
      }

      return {
        status: "pass",
        details: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
          systemMemoryUsagePercent: memoryUsagePercent.toFixed(2),
        },
      };
    } catch (error) {
      return {
        status: "fail",
        message: "Failed to check memory",
      };
    }
  }

  private async checkDatabase(): Promise<CheckResult> {
    const startTime = Date.now();
    try {
      // Simple query to check database connectivity
      await basePrisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;

      // Warn if response time is slow
      if (responseTime > 1000) {
        return {
          status: "warn",
          message: "Database response time is slow",
          responseTime,
          details: { connected: true },
        };
      }

      return {
        status: "pass",
        responseTime,
        details: { connected: true },
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : error },
        "Database health check failed"
      );
      return {
        status: "fail",
        message: "Database connection failed",
        responseTime: Date.now() - startTime,
        details: {
          error: error instanceof Error ? error.message : "Unknown error",
          connected: false,
        },
      };
    }
  }

  private async checkDiskSpace(): Promise<CheckResult> {
    try {
      // Check available disk space for uploads directory
      const uploadPath = process.env.UPLOAD_PATH || "./uploads";
      const stats = await fs.stat(uploadPath).catch(() => null);

      if (!stats) {
        return {
          status: "warn",
          message: "Upload directory not found",
        };
      }

      // This is a basic check - in production you might want to use
      // a more sophisticated method to check actual disk space
      return {
        status: "pass",
        details: {
          uploadPathExists: true,
          path: uploadPath,
        },
      };
    } catch (error) {
      return {
        status: "warn",
        message: "Failed to check disk space",
      };
    }
  }

  private checkInitialization(): CheckResult {
    const uptimeSeconds = (Date.now() - this.startTime) / 1000;

    // Consider the app initialized if it's been running for more than 5 seconds
    if (uptimeSeconds < 5) {
      return {
        status: "fail",
        message: "Application is still initializing",
        details: { uptimeSeconds },
      };
    }

    return {
      status: "pass",
      details: {
        uptimeSeconds,
        initialized: true,
      },
    };
  }

  // Add more check methods as needed
  // private async checkRedis(): Promise<CheckResult> { ... }
  // private async checkExternalAPI(): Promise<CheckResult> { ... }
}

// Export singleton instance
export const healthCheckService = HealthCheckService.getInstance();
