// Load environment variables FIRST (before any other imports that might use them)
import "dotenv/config";
// Required for tsyringe
import "reflect-metadata";
// --- Core Imports ---
import http from "http";
import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { ApolloArmor } from "@escape.tech/graphql-armor";
import pkg from "body-parser";
import axios from "axios";
import { graphqlUploadExpress } from "graphql-upload-minimal";
// --- Apollo Server ---
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
// --- Dependency Injection ---
import { container, DependencyContainer } from "tsyringe";
// --- Application Specific ---
import {
  initializeSchemaMetadata,
  SchemaMetadataStore,
} from "./common/services/schemaMetadata";
import "./core/dependencyContainer";
import { schema } from "./entities";
import { basePrisma } from "./prisma/client";
import { createContext, ServiceContext, APP_SECRET } from "./service-context";
// Los rate limiters VERIFICAN la firma del token para armar la clave del balde:
// con decode() alcanzaba un JWT inventado para conseguir baldes frescos.
import { verify as jwtVerify } from "jsonwebtoken";
import { healthCheckService } from "./services/healthCheckService";
import { UnauthorizedError, NotFoundError } from "./common/errors";
// --- REST Routes ---
import systemRoutes from "./routes/system.routes";
import sseRoutes from "./routes/sse.routes";
import authRoutes from "./routes/auth.routes";
import projectRoutes from "./routes/projectRoutes";
import { rutasConCuerpoPropio } from "./routes/rutasConCuerpoPropio";
import aiSearchRoutes from "./routes/aiSearch.routes";
import emailVerificationRoutes from "./routes/emailVerification.routes";
import { dashboardRoutes } from "./dashboard";

// --- Redis & SSE ---
import { redisSubscriber, RedisClient } from "./services/redis/redisClient";
import { sseManager } from "./services/sse/SSEManager";
// --- Entity mutations bridge (in-process → Redis) ---
import {
  startEntityMutationsBridge,
  stopEntityMutationsBridge,
} from "./services/eventBus/entityMutationsRedisBridge";
import { registerProjectSubscribers } from "./services/eventBus/subscribers";
// --- Widget cache invalidator (consume entity:mutations) ---
import {
  startWidgetCacheInvalidator,
  stopWidgetCacheInvalidator,
} from "./dashboard/cache/WidgetCacheInvalidator";
// --- Prometheus Metrics ---
import {
  register,
  httpMetricsMiddleware,
  createGraphQLMetricsPlugin,
  startStorageUsageCollector,
} from "./metrics";
// --- Satellite gRPC Server ---
import {
  getSatelliteConfig,
  validateSatelliteConfig,
  SatelliteGrpcServer,
  SatelliteRegistry,
  TaskDispatcher,
  TunnelServer,
  ProxyPool,
  SatelliteTokenService,
} from "./satellite";
import pino from "pino";
// --- Retention Scheduler ---
import { RetentionScheduler } from "./services/retention/RetentionScheduler";
import { pgmq } from "./utils/pgmq";
import { startDevOrphanWatchdog } from "./utils/devOrphanWatchdog";
// --- Optional Imports ---

import { registerAlertEvaluators } from "./alerts/registerAlerts";

const { json } = pkg;
const port = process.env.PORT || 4000;

// --- Satellite gRPC Server Instance ---
let satelliteGrpcServer: SatelliteGrpcServer | null = null;
// --- Retention Scheduler Instance ---
let retentionScheduler: RetentionScheduler | null = null;
let tunnelServer: TunnelServer | null = null;

// --- Apollo Context Type Definition ---
// Este es el tipo de objeto 'context' que recibirán tus resolvers GraphQL
export interface MyApolloContext extends ServiceContext {
  container: DependencyContainer; // Incluye el contenedor hijo de tsyringe
  res: ExpressResponse; // Express Response — needed by resolvers that set cookies (e.g. 2FA device trust)
}

// --- CORS Configuration ---
const corsConfig = {
  credentials: true,
  origin: process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGIN || "*",
  allowedHeaders: ["Authorization", "Content-Type", "apollo-require-preflight"], // Añadir apollo-require-preflight para uploads
  exposedHeaders: ["Authorization"],
};

// --- Express App Setup ---
const app = express();
app.set("trust proxy", 1); // Trust first proxy (Traefik) — required for correct client IP in rate limiters and logging
const httpServer = http.createServer(app);

// --- GraphQL Armor Security Configuration ---
// Protects against: alias-based batching attacks, deep queries, resource exhaustion
const armor = new ApolloArmor({
  maxAliases: {
    enabled: true,
    n: 10, // Max 10 aliases per query - prevents alias-based brute force
  },
  maxDepth: {
    enabled: true,
    n: 12, // Max query depth - prevents deeply nested attacks
  },
  maxDirectives: {
    enabled: true,
    n: 20, // Max directives per query
  },
  costLimit: {
    enabled: true,
    // Límite configurable por deployment (GRAPHQL_MAX_QUERY_COST); sin la env
    // rige el default. Las queries generadas crecen con las entidades del
    // proyecto (refs anidadas en subentidades) y pueden superar el default.
    maxCost:
      Number(process.env.GRAPHQL_MAX_QUERY_COST) > 0
        ? Number(process.env.GRAPHQL_MAX_QUERY_COST)
        : 5000, // Max query cost - prevents resource exhaustion
    objectCost: 2,
    scalarCost: 1,
    depthCostFactor: 1.5,
  },
  blockFieldSuggestion: {
    enabled: process.env.NODE_ENV === "production", // Hide field suggestions in production
  },
});
const armorEnhancements = armor.protect();

// --- Apollo Server Setup ---
const server = new ApolloServer<MyApolloContext>({
  // Usa el tipo de contexto extendido
  schema,
  cache: "bounded", // O tu configuración de cache preferida
  persistedQueries: false, // O habilitar si se usa
  csrfPrevention: true, // Recomendado
  introspection: process.env.NODE_ENV !== "production",
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    createGraphQLMetricsPlugin<MyApolloContext>(),
    ...armorEnhancements.plugins, // GraphQL Armor security plugins
  ],
  validationRules: armorEnhancements.validationRules, // GraphQL Armor validation rules
  formatError: (formattedError, error) => {
    // Lógica de formateo de errores mejorada
    const originalError = error?.originalError || error; // Acceder al error original si está envuelto
    const isHandled = (originalError as any)?.extensions?.handled;
    if (process.env.NODE_ENV !== "production" && !isHandled) {
      console.error("GRAPHQL_ERROR_DETAILS:", {
        message: formattedError.message,
        code:
          (originalError as any)?.extensions?.code ||
          (originalError as any)?.code ||
          "INTERNAL_SERVER_ERROR",
        path: formattedError.path,
        originalError: originalError,
      });
    }

    // Extraer código de las extensiones si existe
    const code =
      (originalError as any)?.extensions?.code ||
      (originalError as any)?.code ||
      "INTERNAL_SERVER_ERROR";

    // Un error de aplicación se marca 'handled' y su mensaje es intencional
    // (una ValidationError localizada, un UnauthorizedError). Un error NO
    // manejado —un PrismaClientValidationError, un TypeError— trae texto
    // interno: en particular los errores de validación de Prisma vuelcan el
    // objeto de argumentos y LISTAN LAS COLUMNAS del modelo. En producción
    // eso es un mapa de la base servido a cualquier autenticado, y anula el
    // blockFieldSuggestion de arriba. Se reemplaza por un genérico. (isHandled
    // ya está declarado arriba, en el bloque de logging de desarrollo.)
    const rawCode = String((originalError as any)?.code ?? "");
    const isInternal =
      !isHandled && (code === "INTERNAL_SERVER_ERROR" || /^P\d/.test(rawCode));

    if (process.env.NODE_ENV === "production" && isInternal) {
      return {
        message: "Error interno del servidor.",
        extensions: { code: "INTERNAL_SERVER_ERROR" },
      };
    }

    // El meta viaja SOLO desde errores de aplicación (handled): su meta lo
    // arma el server a propósito y ya está saneado en la fuente (PrismaError
    // expone solo el campo del constraint, no las columnas crudas ni los
    // internos del driver). El meta de un error NO manejado no se reenvía.
    const meta = isHandled
      ? (originalError as any)?.extensions?.meta
      : undefined;

    return {
      message: formattedError.message, // Mensaje para el cliente
      extensions: {
        code: code,
        meta,
      },
    };
  },
  // NO definir context aquí, se define en expressMiddleware
});

// --- Express Routes & Middlewares ---

// Proxies (Si existen)

// Webhooks (Si existen)

// Ruta Dashboard (Ejemplo - Usa contexto simple)
app.get("/dashboard", async (req, res) => {
  // Crear contexto simple SÓLO para este chequeo de rol
  // Asume que createContext puede funcionar sin DI para obtener roles básicos
  let tempContext: ServiceContext | null = null;
  try {
    tempContext = await createContext(req as ExpressRequest);
  } catch (contextError) {
    console.error("Error creating context for dashboard:", contextError);
    return res.status(401).json({ error: "Authentication error" });
  }

  if (!tempContext?.hasRole("SysAdmin")) {
    // Chequear rol desde el contexto temporal
    return res.status(403).json({ error: "No autorizado" });
  }

  try {
    const dashboardResponse = await axios.get(
      "http://traefik:8080/api/overview"
    ); // Ajusta URL si es necesario
    return res.json(dashboardResponse.data);
  } catch (error) {
    console.error("Dashboard access error:", error);
    return res.status(500).json({ error: "Error accediendo al dashboard" });
  }
});

// Health Check Endpoints - MUST be before general middlewares
// Full health check (legacy endpoint)
app.get("/health", async (_req, res) => {
  // CORS abierto: el cliente (otro origin) POLLEA este endpoint para detectar
  // la recuperacion tras un mantenimiento — sin este header el browser
  // bloquea la respuesta y el overlay nunca se levanta. Endpoint publico
  // sin credenciales: "*" es correcto aca.
  res.set("Access-Control-Allow-Origin", "*");
  try {
    const health = await healthCheckService.getFullHealthStatus();
    const httpStatus =
      health.status === "healthy"
        ? 200
        : health.status === "degraded"
        ? 200
        : 503;
    res.status(httpStatus).json(health);
  } catch (error) {
    console.error("Health check error:", error);
    res.status(503).json({
      status: "unhealthy",
      error: "Internal health check failed",
    });
  }
});

// Liveness probe - Kubernetes/Docker health check
app.get("/health/live", async (_req, res) => {
  try {
    const health = await healthCheckService.getLivenessStatus();
    const httpStatus = health.status === "healthy" ? 200 : 503;
    res.status(httpStatus).json(health);
  } catch (error) {
    console.error("Liveness check error:", error);
    res.status(503).json({
      status: "unhealthy",
      error: "Liveness check failed",
    });
  }
});

// Readiness probe - Can the app serve requests?
app.get("/health/ready", async (_req, res) => {
  try {
    const health = await healthCheckService.getReadinessStatus();
    const httpStatus =
      health.status === "healthy"
        ? 200
        : health.status === "degraded"
        ? 200
        : 503;
    res.status(httpStatus).json(health);
  } catch (error) {
    console.error("Readiness check error:", error);
    res.status(503).json({
      status: "unhealthy",
      error: "Readiness check failed",
    });
  }
});

// Startup probe - Has the app finished initializing?
app.get("/health/startup", async (_req, res) => {
  try {
    const health = await healthCheckService.getStartupStatus();
    const httpStatus = health.status === "healthy" ? 200 : 503;
    res.status(httpStatus).json(health);
  } catch (error) {
    console.error("Startup check error:", error);
    res.status(503).json({
      status: "unhealthy",
      error: "Startup check failed",
    });
  }
});

// Prometheus metrics endpoint
app.get("/metrics", async (_req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    console.error("Metrics error:", error);
    res.status(500).end("Error collecting metrics");
  }
});

// Middlewares generales (ANTES de rutas para que apliquen)
app.use(cors<cors.CorsRequest>(corsConfig)); // Aplicar CORS globalmente

// Security headers (helmet)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "wss:", "https:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Needed for some file uploads
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin for API
  })
);

// Rate limiting - General API (100 requests per 15 min per IP)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Configurable por entorno: una integración por lotes (carga inicial de un
  // cliente, corrida de evaluación) necesita un techo mayor que el default
  // pensado para tráfico interactivo. Sin la variable, nada cambia.
  max: Number(process.env.API_RATE_LIMIT_MAX || 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: (req) => {
    // Health checks, metrics y dashboard fuera del balde general: el
    // dashboard tiene su propio limiter por usuario (dashboardLimiter) —
    // mirar widgets no debe comerle presupuesto a las operaciones.
    return (
      req.path === "/health" ||
      req.path === "/startup" ||
      req.path === "/metrics" ||
      req.path.startsWith("/dashboard/")
    );
  },
});

// Rate limiting - Dashboard widgets (por USUARIO, no por IP: una oficina
// detrás de un NAT no comparte balde). Generoso a propósito: el camino de
// widgets es cache-first (Redis) y las computaciones reales están acotadas
// por el semáforo del DashboardDataService — el limiter es solo un tope
// anti-abuso, no el mecanismo de protección de la DB.
/**
 * El userId del token, SOLO si el token está firmado por nosotros.
 *
 * Antes cada limiter hacía `decode()` en vez de `verify()`, "por
 * performance". El costo real de verificar un HMAC son microsegundos; lo que
 * costaba era lo otro: un JWT sin firmar, con un userId inventado y rotativo,
 * conseguía un balde nuevo en cada request. Y como bastaba llevar el header
 * `Bearer` para que el limiter estricto de anónimos se salteara, el camino
 * barato terminaba siendo MÁS permisivo que no autenticarse.
 *
 * Devuelve null ante cualquier duda: token ausente, mal formado, vencido o
 * firmado con otra clave. Quien no puede probar quién es, se limita por IP.
 */
const userIdVerificado = (req: express.Request): string | null => {
  const header = req.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const payload = jwtVerify(header.slice(7), APP_SECRET) as {
      userId?: string;
    };
    return payload?.userId ?? null;
  } catch {
    return null;
  }
};

const claveDeBalde = (req: express.Request): string => {
  const userId = userIdVerificado(req);
  return userId
    ? `user:${userId}`
    : req.ip || req.socket.remoteAddress || "unknown";
};

const dashboardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many dashboard requests, please try again later." },
  keyGenerator: claveDeBalde,
});

// Rate limiting - todo /api/auth por IP: no solo el login, también refresh,
// logout y recuperación. No es el único freno contra fuerza bruta —
// LoginThrottleService frena por usuario, y este cuenta por IP.
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts, please try again later.",
  },
});

// Rate limiting - AI Search (20 requests per minute per IP - expensive operation)
const aiSearchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // max 20 AI searches per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI search requests, please try again later." },
});

// Rate limiting - GraphQL unauthenticated (strict: 30 requests per minute per IP)
// Protects against brute force login attempts
const graphqlUnauthLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // max 30 requests per minute for unauthenticated
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please authenticate or try again later.",
  },
  keyGenerator: (req) => {
    // Use IP for unauthenticated requests
    return req.ip || req.socket.remoteAddress || "unknown";
  },
  skip: (req) => {
    // Se saltea SOLO si el token es válido de verdad. Con el chequeo anterior
    // —"¿trae header Bearer?"— cualquiera evitaba este balde, que es el
    // estricto, mandando basura en el header.
    return userIdVerificado(req) !== null;
  },
});

// Rate limiting - GraphQL authenticated (permissive: 300 requests per 15 min per user)
// Normal usage for logged-in users
const graphqlAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Configurable por entorno: una pantalla que sondea estado (una mesa de
  // entrada con lote en proceso) o una corrida de evaluación necesitan más
  // techo que el default interactivo. Sin la variable, nada cambia.
  max: Number(process.env.GRAPHQL_AUTH_RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  keyGenerator: claveDeBalde,
  skip: (req) => {
    // Este es el balde permisivo: solo lo alcanza quien probó quién es. Un
    // token que no verifica cae al limiter estricto de anónimos, que es lo que
    // corresponde.
    return userIdVerificado(req) === null;
  },
});

app.use(httpMetricsMiddleware); // Prometheus HTTP metrics
app.use(
  compression({
    filter: (req, res) => {
      // NO comprimir SSE (necesita streaming inmediato sin buffering)
      if (req.path === "/api/events") {
        return false;
      }
      return compression.filter(req, res);
    },
  }) as unknown as express.RequestHandler
); // Compresión
// El parser global lleva el techo por default de express —100 KB— porque
// GraphQL lo necesita y subirlo acá se lo daría también a él.
//
// Corre antes que las rutas y marca el pedido como leído, así que un
// `json({ limit })` montado más abajo NO vuelve a leer el cuerpo: su techo no
// rige y el cuerpo grande muere con 413 sin llegar al handler. Por eso una ruta
// que necesite otro techo se declara y este parser la saltea, en vez de montar
// el suyo y creer que alcanza. Ver routes/rutasConCuerpoPropio.ts.
const cuerpoJson = json();
app.use((req, res, next) =>
  rutasConCuerpoPropio.some((prefijo) => req.path.startsWith(prefijo))
    ? next()
    : cuerpoJson(req, res, next)
);

// REST API Routes (DESPUÉS de middlewares) - con rate limiting
app.use("/api/auth", authLimiter); // Strict rate limit for auth
app.use("/api/ai-search", aiSearchLimiter); // Rate limit for AI search
app.use("/api/dashboard", dashboardLimiter); // Per-user rate limit for dashboard widgets
app.use("/api", apiLimiter); // General rate limit for all API
app.use("/api", systemRoutes);
app.use("/api", sseRoutes);
app.use("/api", authRoutes);
app.use("/api", aiSearchRoutes);
app.use("/api", emailVerificationRoutes);
app.use("/api", dashboardRoutes);
// Las rutas propias del proyecto, al final: las del framework contestan primero
// y el limitador general ya se aplicó. Ver routes/projectRoutes.ts.
app.use("/api", projectRoutes);

// La descarga vive FUERA de /api, así que app.use('/api', apiLimiter) nunca la
// alcanzaba: era la única ruta que servía archivos sin techo de pedidos. El
// balde va por usuario verificado (o IP si no hay token), igual que el resto.
const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many download requests, please try again later." },
  keyGenerator: claveDeBalde,
});

app.get(
  "/download/:field_path/:id/:file_id",
  downloadLimiter,
  async (req, res) => {
    let context: ServiceContext | null = null;
    let requestContainer: DependencyContainer | null = null;
    try {
      context = await createContext(req as ExpressRequest);
      requestContainer = container.createChildContainer();

      requestContainer.register<ServiceContext>("ServiceContext", {
        useValue: context,
      });

      requestContainer.register<DependencyContainer>("DependencyContainer", {
        useValue: requestContainer,
      });

      const { FileDownloadRouter } = await import(
        "./common/services/FileDownloadRouter"
      );
      const downloadRouter = requestContainer.resolve(FileDownloadRouter);

      const fileData = await downloadRouter.getFileData(req.params);

      if (fileData !== null) {
        res.download(fileData, req.params.file_id);
      } else {
        res.status(404).send("File not found or not accessible.");
      }
    } catch (error) {
      console.error("Download error:", error);
      if (error instanceof UnauthorizedError) {
        res.status(403).send("Forbidden.");
      } else if (error instanceof NotFoundError) {
        res.status(404).send("File not found.");
      } else {
        res.status(500).send("Error processing download.");
      }
    }
  }
);

// --- Server Start Function ---
async function startServer() {
  try {
    // 1. Construir Metadata PRIMERO
    initializeSchemaMetadata();

    // Poblar el registry de tipos de alerta (para availableAlertTypes + validación). No-op si vacío.
    registerAlertEvaluators();

    // 2. Inicializar Redis Pub/Sub para SSE
    await redisSubscriber.subscribe("sse:events");
    console.log("[Redis] Subscribed to sse:events channel");

    redisSubscriber.on("message", (channel, message) => {
      if (channel === "sse:events") {
        try {
          const event = JSON.parse(message);
          sseManager.publish(event);
        } catch (error) {
          console.error("[Redis] Error parsing SSE event:", error);
        }
      }
    });

    // 2.bis Bridge de mutaciones in-process → Redis pub/sub.
    // Con la allow-list vacía no se suscribe al bus in-process: costo cero.
    // La lista NO es solo `.publishesMutations` — también entran las
    // sourceEntities de los widgets `.cached()`. Ver entityMutationsConfig.
    startEntityMutationsBridge();

    // 2.quater Los suscriptores del proyecto, en un solo lugar y antes del
    // primer request. Ver services/eventBus/subscribers.ts.
    registerProjectSubscribers();

    // 2.ter Invalidador de cache de widgets, consumidor del canal
    // entity:mutations. Si no hay widgets cached registrados, el
    // invalidator detecta la lista vacía y no se suscribe.
    await startWidgetCacheInvalidator();

    await server.start(); // Iniciar Apollo Server

    // Aplicar middleware de Express para GraphQL en /graphql
    // Rate limiters are applied first (unauthenticated strict, authenticated permissive)
    app.use(
      "/graphql",
      graphqlUnauthLimiter, // 30 req/min for unauthenticated (skips if has Bearer token)
      graphqlAuthLimiter, // 300 req/15min for authenticated (skips if no Bearer token)
      // El parseo de multipart va DESPUÉS de los rate limiters y solo en
      // /graphql (antes era global): así un upload no consume el parseo de
      // 100 MB antes de pasar por el límite de pedidos, y solo lo paga la
      // ruta que de verdad recibe archivos.
      //
      // maxFieldSize acota el campo 'operations' (la query + variables) al
      // mismo techo que json() —100 KB por default—: sin él quedaba en el
      // default de 1 MB de la librería, un canal para meter 10× el
      // presupuesto de cualquier ataque por variables saltándose json().
      graphqlUploadExpress({
        maxFileSize:
          Number(process.env.UPLOAD_MAX_FILE_SIZE_MB) > 0
            ? Number(process.env.UPLOAD_MAX_FILE_SIZE_MB) * 1024 * 1024
            : 26214400,
        maxFiles: 10,
        maxFieldSize:
          Number(process.env.GRAPHQL_MAX_FIELD_SIZE_KB) > 0
            ? Number(process.env.GRAPHQL_MAX_FIELD_SIZE_KB) * 1024
            : 102400,
      }),
      expressMiddleware(server, {
        // Función de contexto por request para GraphQL
        context: async ({ req, res }): Promise<MyApolloContext> => {
          const requestServiceContext = await createContext(req);
          const requestContainer = container.createChildContainer();
          requestContainer.register<ServiceContext>("ServiceContext", {
            useValue: requestServiceContext,
          });

          // --- DETAILED RESOLUTION TEST ---
          let resolvedStoreInContext: any;
          let resolutionError: any = null;
          try {
            // Intentar resolver SchemaMetadataStore USANDO EL CONTENEDOR HIJO
            resolvedStoreInContext =
              requestContainer.resolve<SchemaMetadataStore>(
                "SchemaMetadataStore"
              );
          } catch (e) {
            console.error(
              "ERROR resolving 'SchemaMetadataStore' VIA CHILD container:",
              e
            );
            resolutionError = e;
          }
          if (resolutionError) {
            // Podrías querer loguear o manejar esto
          }
          // --- END TEST ---
          return {
            ...requestServiceContext, // Propiedades del ServiceContext disponibles directamente
            container: requestContainer, // Contenedor hijo disponible como context.container
            res: res as ExpressResponse, // Express Response — needed for setting cookies (2FA device trust)
          };
        },
      }) // Fin expressMiddleware
    ); // Fin app.use /graphql

    // Ruta catch-all para manejar 404 (debe ir al final)
    // En producción/staging, el frontend es servido por su propio contenedor
    app.get("*", (_req, res) => {
      res.status(404).json({
        error: "Not found",
        message: "The requested resource was not found on this server",
      });
    });

    // Iniciar servidor HTTP
    await new Promise<void>((resolve) => httpServer.listen({ port }, resolve));

    // Colector de uso de storage por tenant (gauge tenant_storage_bytes):
    // mide desde los metadatos de la base — agnóstico del backend de archivos.
    startStorageUsageCollector();
    console.log(`🚀 Server ready at http://localhost:${port}/graphql`);

    // 3. Start Retention Scheduler (for data purge policies)
    const serverLogger = pino({ name: "server" });
    retentionScheduler = new RetentionScheduler(pgmq, serverLogger);
    const retentionIntervalHours = parseInt(
      process.env.RETENTION_INTERVAL_HOURS || "24",
      10
    );
    retentionScheduler.start(retentionIntervalHours);

    // 4. Iniciar Satellite gRPC Server (si está habilitado)
    const satelliteConfig = getSatelliteConfig();
    if (satelliteConfig.enabled) {
      const configErrors = validateSatelliteConfig(satelliteConfig);
      if (configErrors.length > 0) {
        console.error("❌ Satellite configuration errors:", configErrors);
      } else {
        const satelliteLogger = pino({ name: "satellite" });
        const registry = new SatelliteRegistry(basePrisma, satelliteLogger);
        const dispatcher = new TaskDispatcher(basePrisma, satelliteLogger);
        const satelliteTokenService = new SatelliteTokenService(
          basePrisma,
          satelliteLogger
        );

        satelliteGrpcServer = new SatelliteGrpcServer({
          port: satelliteConfig.grpc.port,
          host: satelliteConfig.grpc.host,
          tlsEnabled: satelliteConfig.grpc.tlsEnabled,
          caCertPath: satelliteConfig.grpc.caCertPath,
          serverCertPath: satelliteConfig.grpc.serverCertPath,
          serverKeyPath: satelliteConfig.grpc.serverKeyPath,
          requireClientCert: satelliteConfig.grpc.requireClientCert,
          logger: satelliteLogger,
          registry,
          dispatcher,
          prisma: basePrisma,
        });

        await satelliteGrpcServer.start();
        console.log(
          `🛰️  Satellite gRPC server ready at ${satelliteConfig.grpc.host}:${satelliteConfig.grpc.port}`
        );

        // 5. Iniciar Tunnel Server (si está habilitado)
        if (satelliteConfig.tunnel.enabled) {
          const proxyPool = new ProxyPool(registry, satelliteLogger);

          tunnelServer = new TunnelServer({
            config: {
              enabled: true,
              satellitePort: satelliteConfig.tunnel.satellitePort,
              workerPort: satelliteConfig.tunnel.workerPort,
              tlsEnabled: satelliteConfig.tunnel.tlsEnabled,
              caCertPath: satelliteConfig.tunnel.caCertPath,
              serverCertPath: satelliteConfig.tunnel.serverCertPath,
              serverKeyPath: satelliteConfig.tunnel.serverKeyPath,
            },
            logger: satelliteLogger,
            validateSatelliteToken: async (
              satelliteId: string,
              token: string
            ): Promise<boolean> => {
              // El túnel exige una sesión gRPC activa (status online) Y el mismo token
              // real que valida el gRPC: SHA256 contra authTokenHash, ligado al id.
              // Antes comparaba machineCode === token, y machineCode no es secreto
              // (viaja en el SDL y en el índice), así que cualquiera con un id conocido
              // abría el túnel de esa máquina.
              const satellite = await registry.findById(satelliteId);
              if (!satellite || satellite.status !== "online") {
                return false;
              }
              const validation = await satelliteTokenService.validateToken(
                token,
                satelliteId
              );
              return validation.valid;
            },
            onTunnelConnect: async (satelliteId: string) => {
              await registry.setTunnelConnected(satelliteId);
            },
            onTunnelDisconnect: async (satelliteId: string) => {
              await registry.setTunnelDisconnected(satelliteId);
            },
          });

          await tunnelServer.start();

          // Configurar ProxyPool con endpoint del túnel
          proxyPool.setTunnelConfig(
            "server",
            satelliteConfig.tunnel.workerPort
          );

          // Registrar ProxyPool en el contenedor DI para que los servicios lo usen
          container.register("ProxyPool", { useValue: proxyPool });

          console.log(
            `🚇 Tunnel server ready - satellites:${satelliteConfig.tunnel.satellitePort} workers:${satelliteConfig.tunnel.workerPort}`
          );
        }
      }
    }
  } catch (err) {
    console.error("❌ Error starting the node server:", err);
    process.exit(1); // Salir si el arranque falla
  }
}

// --- Graceful Shutdown ---
const shutdown = async (signal: string) => {
  console.log(`
Received ${signal}. Shutting down gracefully...`);
  try {
    // Detener Retention Scheduler
    if (retentionScheduler) {
      retentionScheduler.stop();
      console.log("Retention scheduler stopped.");
    }
    // Detener Tunnel Server primero (cierra conexiones de workers y satélites)
    if (tunnelServer) {
      await tunnelServer.stop();
      console.log("Tunnel server stopped.");
    }
    // Detener Satellite gRPC Server
    if (satelliteGrpcServer) {
      await satelliteGrpcServer.stop();
      console.log("Satellite gRPC server stopped.");
    }
    await server.stop(); // Detener Apollo Server
    httpServer.close(async () => {
      // Cerrar servidor HTTP
      console.log("HTTP server closed.");
      await stopWidgetCacheInvalidator(); // Desuscribir del canal Redis
      stopEntityMutationsBridge(); // Desuscribir del bus in-process
      await RedisClient.disconnect(); // Desconectar Redis
      console.log("Redis disconnected.");
      await basePrisma.$disconnect(); // Desconectar Prisma
      console.log("Prisma disconnected.");
      process.exit(0); // Salir limpiamente
    });
    // Forzar cierre si no se cierra después de un tiempo
    setTimeout(() => {
      console.error(
        "Could not close connections in time, forcefully shutting down"
      );
      process.exit(1);
    }, 10000); // 10 segundos timeout
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// --- Error Handling ---
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Considera añadir lógica para notificar/loguear esto apropiadamente
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  // Intenta un cierre MUY rápido y sal
  process.exit(1);
});

// --- Start Execution ---
startDevOrphanWatchdog("server");
void startServer();
