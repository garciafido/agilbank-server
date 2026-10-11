import pino from "pino";
import { randomUUID } from "crypto";

// Un error en el log: lo que sirve para entenderlo, nunca el pedido ni la
// respuesta. pino.stdSerializers.err copia toda propiedad enumerable del error, y
// un error de axios trae el pedido entero (config.headers, con Authorization y
// X-API-Key; config.data, con el cuerpo) y la respuesta. Quedan type, message,
// stack, code, un status numérico (response.status o statusCode) y la causa, con
// la misma regla, hasta ERROR_CAUSE_MAX_DEPTH niveles y sin colgarse con un
// ciclo. Un texto queda como está; cualquier otro valor que no es un Error, solo
// su tipo: nunca se pasa a texto (un Buffer daría su contenido, una URL su
// usuario y su clave). Sirve para err y para error, y nunca tira: un serializador
// que tira hace tirar al llamado al logger, y en un catch eso deja un rechazo sin
// manejar; ante cualquier falla queda { type: 'Unserializable' }.
//
// Un error se reconoce por su forma (message de texto, y stack o name), no por
// instanceof: así entran también los de otro realm (vm, o los de Node bajo jest).
// De un AggregateError van sus errors con la misma regla, hasta
// ERROR_AGGREGATE_MAX, con la profundidad compartida; si no tiene mensaje, sirve
// el de sus hijos (el ECONNREFUSED de Node 22 trae vacío el suyo, y las
// direcciones que fallaron en los hijos). De un error de GraphQL, solo
// extensions.code, si es un texto: el resto de extensions puede traer datos.
const ERROR_CAUSE_MAX_DEPTH = 3;
const ERROR_AGGREGATE_MAX = 5;

export function serializeError(value: unknown): unknown {
  try {
    return safeError(value, 0, new WeakSet<object>());
  } catch {
    return { type: "Unserializable" };
  }
}

/** El tipo de un valor: el nombre de su constructor, o su typeof. */
function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (typeof value !== "object" && typeof value !== "function")
    return typeof value;
  const name = (value as any).constructor?.name;
  return typeof name === "string" && name ? name : typeof value;
}

function safeError(
  value: unknown,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object")
    return { type: typeOf(value) };
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  const v = value as Record<string, any>;
  const type = typeOf(value);
  const errorLike =
    typeof v.message === "string" &&
    (typeof v.stack === "string" || typeof v.name === "string");
  if (!errorLike) return { type };
  const out: Record<string, unknown> = { type, message: v.message };
  if (typeof v.stack === "string") out.stack = v.stack;
  if (typeof v.code === "string" || typeof v.code === "number")
    out.code = v.code;
  const status = [v.response?.status, v.statusCode].find(
    (s) => typeof s === "number"
  );
  if (status !== undefined) out.status = status;
  if (typeof v.extensions?.code === "string")
    out.extensions = { code: v.extensions.code };
  if (Array.isArray(v.errors)) {
    if (depth < ERROR_CAUSE_MAX_DEPTH) {
      const errors: unknown[] = v.errors
        .slice(0, ERROR_AGGREGATE_MAX)
        .map((e: unknown) => safeError(e, depth + 1, seen));
      if (out.message === "") {
        const messages = errors
          .map((e: any) => e?.message)
          .filter((m) => typeof m === "string" && m !== "");
        if (messages.length > 0) out.message = messages.join("; ");
      }
      if (v.errors.length > ERROR_AGGREGATE_MAX)
        errors.push("[" + (v.errors.length - ERROR_AGGREGATE_MAX) + " more]");
      out.errors = errors;
    } else {
      out.errors = "[errors depth limit]";
    }
  }
  if (v.cause !== undefined) {
    out.cause =
      depth < ERROR_CAUSE_MAX_DEPTH
        ? safeError(v.cause, depth + 1, seen)
        : "[cause depth limit]";
  }
  return out;
}

// Logger configuration based on environment
const isDevelopment = process.env.NODE_ENV === "development";
const isTest = process.env.NODE_ENV === "test";

// Base logger configuration
const baseConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info"),
  // Disable logging in test environment unless explicitly enabled
  enabled: isTest ? process.env.ENABLE_TEST_LOGS === "true" : true,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  // Base fields for all logs
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || "localhost",
    service: process.env.SERVICE_NAME || "server",
    environment: process.env.NODE_ENV || "development",
  },
  // Redact sensitive fields
  redact: {
    paths: [
      "password",
      "token",
      "authorization",
      "cookie",
      "*.password",
      "*.token",
    ],
    remove: true,
  },
  // Custom serializers
  serializers: {
    err: serializeError,
    error: serializeError,
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
      headers: {
        host: req.headers.host,
        "user-agent": req.headers["user-agent"],
        "content-type": req.headers["content-type"],
      },
      remoteAddress: req.ip || req.connection?.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      headers: res.getHeaders?.(),
    }),
  },
};

// Development configuration with pretty printing
const devTransport = {
  target: "pino-pretty",
  options: {
    colorize: true,
    translateTime: "HH:MM:ss.l",
    ignore: "pid,hostname",
    messageFormat: "{msg}",
    errorLikeObjectKeys: ["err", "error"],
  },
};

// Create the logger instance
export const logger =
  isDevelopment && process.env.LOG_PRETTY !== "false"
    ? pino(baseConfig, pino.transport(devTransport))
    : pino(baseConfig);

// Create a child logger with request ID for tracing
export function createRequestLogger(requestId?: string) {
  return logger.child({
    requestId: requestId || randomUUID(),
  });
}

// Helper to log GraphQL operations
export function logGraphQLOperation(
  operationName: string,
  operationType: string,
  variables: any,
  requestId: string
) {
  logger.info(
    {
      type: "graphql_operation",
      operationName,
      operationType,
      variables,
      requestId,
    },
    `GraphQL ${operationType}: ${operationName}`
  );
}

// Helper to log database queries (for Prisma)
export function logDatabaseQuery(
  model: string,
  operation: string,
  args: any,
  duration: number,
  requestId?: string
) {
  logger.debug(
    {
      type: "database_query",
      model,
      operation,
      args,
      duration,
      requestId,
    },
    `DB Query: ${model}.${operation} (${duration}ms)`
  );
}

// Export log levels for convenience
export const logLevels = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
} as const;

// Type for structured logging
export interface LogContext {
  requestId?: string;
  userId?: string;
  tenantId?: string;
  [key: string]: any;
}

// Structured logging helper
export function log(
  level: keyof typeof logLevels,
  message: string,
  context?: LogContext
) {
  logger[level](context || {}, message);
}
