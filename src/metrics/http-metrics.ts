import { Request, Response, NextFunction } from 'express';
import { httpRequestsTotal, httpRequestDuration } from './registry';

/**
 * Express middleware to collect HTTP metrics
 * Should be applied early in the middleware chain
 */
export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip metrics endpoint to avoid infinite loop
  if (req.path === '/metrics') {
    next();
    return;
  }

  const startTime = process.hrtime.bigint();

  // Capture original end function
  const originalEnd = res.end;

  // Override end to capture metrics
  res.end = function(this: Response, ...args: Parameters<Response['end']>): Response {
    const endTime = process.hrtime.bigint();
    const durationSeconds = Number(endTime - startTime) / 1e9;

    // Normalize route path for metrics (avoid high cardinality)
    const route = normalizeRoute(req.route?.path || req.path);
    const method = req.method;
    const status = String(res.statusCode);

    // Record metrics
    httpRequestsTotal.inc({ method, route, status });
    httpRequestDuration.observe({ method, route, status }, durationSeconds);

    // Call original end
    return originalEnd.apply(this, args);
  };

  next();
}

/**
 * Normalize route paths to prevent high cardinality in metrics
 * Replaces dynamic segments like UUIDs, IDs, etc. with placeholders
 */
function normalizeRoute(path: string): string {
  return path
    // Replace UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
    // Replace numeric IDs
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    // Replace MongoDB-style IDs
    .replace(/[0-9a-f]{24}/gi, ':objectId')
    // Limit path length
    .substring(0, 100);
}
