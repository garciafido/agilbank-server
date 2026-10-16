import { Readable } from "stream";
import { correctionsApi } from "./corrections";
import { bearerToken, fail, INTERNAL_ERROR, type ApiRequest, type ApiResponse, type Authorize, type ClientSystem, type Db } from "./http";
import { MAX_RECONCILE_JSON_BYTES, reconciliationsApi } from "./reconciliations";
import { statementsApi } from "./statements";

type Handler = (...args: any[]) => unknown;

/** Lo que el router usa de express, y nada más. */
interface RouterLike {
  get(path: string, ...handlers: Handler[]): unknown;
  post(path: string, ...handlers: Handler[]): unknown;
  use(...handlers: Handler[]): unknown;
}

export interface Transport<R> {
  Router(): R;
  json(options: { limit: number }): Handler;
}

export interface ProductPieces {
  db: Db;
  /** Devuelve el sistema cliente, o tira un error cuyo `name` es `AmbitoInsuficienteError` o `SistemaClienteNoAutorizadoError`. */
  authorizeClient(token: string | undefined, scope: string): Promise<ClientSystem>;
  /** Se pide en cada subida: el proveedor puede leer su configuración tarde. */
  storage(): { uploadStream(stream: Readable, key: string, options: { contentType: string }): Promise<unknown> };
  /** Crea el evento y publica en la cola en la misma transacción. */
  enqueueReading(statementId: string, authorId: string, tenantId: string): Promise<unknown>;
}

export const MAX_JSON_BYTES = 64 * 1024;

const REASON_BY_ERROR = new Map<unknown, "no-scope" | "unauthorized">([
  ["AmbitoInsuficienteError", "no-scope"],
  ["SistemaClienteNoAutorizadoError", "unauthorized"],
]);

export const authorizationAsResult = (authorizeClient: ProductPieces["authorizeClient"]): Authorize => async (token, scope) => {
  try {
    return { ok: true, client: await authorizeClient(token, scope) };
  } catch (e) {
    const reason = REASON_BY_ERROR.get((e as { name?: unknown } | null)?.name);
    if (reason) return { ok: false, reason, message: (e as Error).message };
    throw e;
  }
};

type ExpressRequest = { headers: Record<string, unknown>; body?: unknown; params?: Record<string, string> };
type ExpressResponse = { status: (n: number) => { json: (b: unknown) => unknown } };

const toRequest = (req: ExpressRequest): ApiRequest => ({ headers: req.headers, body: req.body, params: req.params ?? {} });

const guarded = (run: (req: any) => Promise<ApiResponse>) => async (req: any, res: ExpressResponse): Promise<void> => {
  let out: ApiResponse;
  try {
    out = await run(req);
  } catch (e) {
    console.error("[agilbank] error interno en la API", e);
    out = INTERNAL_ERROR;
  }
  res.status(out.status).json(out.body);
};

const NO_CREDENTIAL = fail(401, "NO_AUTORIZADO", "Falta la credencial: el pedido lleva Authorization: Bearer y el token.");

/**
 * Antes del parser de 16 MB: sin un Bearer, ni se lee el cuerpo. Solo mira que haya token; validarlo, el
 * ámbito y la empresa siguen en el manejador.
 */
const requireBearer = (req: ExpressRequest, res: ExpressResponse, next: () => void): unknown =>
  !bearerToken(req.headers) ? res.status(NO_CREDENTIAL.status).json(NO_CREDENTIAL.body) : next();

const NOT_JSON = fail(415, "CUERPO_NO_SOPORTADO", "La conciliación se envía como JSON: el pedido lleva Content-Type: application/json.");

/**
 * Antes del parser: sin `application/json`, express deja el cuerpo vacío y el pedido se conciliaría sin valores,
 * con todos los renglones pendientes. Un error de transporte no puede salir como una conclusión contable.
 */
const requireJson = (req: ExpressRequest, res: ExpressResponse, next: () => void): unknown => {
  const type = req.headers["content-type"];
  const json = typeof type === "string" && type.split(";")[0].trim().toLowerCase() === "application/json";
  return json ? next() : res.status(NOT_JSON.status).json(NOT_JSON.body);
};

/** El código de un cuerpo inválido y el tope, según la ruta: las dos que llevan JSON son las correcciones y la conciliación. */
const bodyRules = (req: unknown): { codigo: string; limit: string } => {
  const path = (req as { path?: unknown } | null)?.path;
  return typeof path === "string" && path.endsWith("/conciliacion")
    ? { codigo: "PEDIDO_INVALIDO", limit: "16 MB" }
    : { codigo: "CORRECCION_INVALIDA", limit: "64 KB" };
};

/**
 * Los errores del parser de JSON, con la forma del contrato. Nada sigue de largo:
 * el manejador por defecto de express responde HTML y, fuera de producción, con la pila.
 * `_next` queda declarado porque express reconoce un manejador de errores por sus cuatro argumentos.
 */
const jsonErrors = (err: unknown, req: unknown, res: ExpressResponse, _next: (e: unknown) => void): unknown => {
  const type = (err as { type?: unknown } | null)?.type;
  const { codigo, limit } = bodyRules(req);
  if (type === "entity.too.large") return res.status(413).json({ codigo: "CUERPO_DEMASIADO_GRANDE", error: `El cuerpo pesa más de ${limit}.` });
  if (type === "entity.parse.failed") return res.status(400).json({ codigo, error: "El cuerpo no es un JSON válido.", campo: null });
  if (type === "encoding.unsupported" || type === "charset.unsupported") {
    return res.status(415).json({ codigo: "CUERPO_NO_SOPORTADO", error: "El cuerpo usa una codificación de contenido o un juego de caracteres que no se acepta: manden JSON en UTF-8." });
  }
  if (type === "request.aborted" || type === "request.size.invalid") {
    return res.status(400).json({ codigo, error: "El cuerpo llegó incompleto.", campo: null });
  }
  console.error("[agilbank] error interno en la API", err);
  return res.status(INTERNAL_ERROR.status).json(INTERNAL_ERROR.body);
};

/** Las rutas del contrato (§3, §4 y §6) y las de la conciliación, para montar bajo `/api`. */
export function agilbankRoutes<R>(transport: Transport<R>, pieces: ProductPieces): R {
  const authorize = authorizationAsResult(pieces.authorizeClient);
  const statements = statementsApi({
    db: pieces.db,
    authorize,
    upload: async (bytes, key, mimeType) => {
      await pieces.storage().uploadStream(Readable.from(bytes), key, { contentType: mimeType });
    },
    enqueueReading: pieces.enqueueReading,
  });
  const corrections = correctionsApi({ db: pieces.db, authorize });
  const reconciliations = reconciliationsApi({ db: pieces.db, authorize });
  const router = transport.Router();
  const r = router as unknown as RouterLike;
  // El envío lee el cuerpo del pedido con busboy: no lleva parser.
  r.post("/v1/extractos", guarded((req: ExpressRequest & NodeJS.ReadableStream) => statements.receive({ headers: req.headers, stream: req })));
  r.get("/v1/extractos/por-huella/:huella", guarded((req: ExpressRequest) => statements.byFingerprint(toRequest(req))));
  r.get("/v1/extractos/:idExtracto", guarded((req: ExpressRequest) => statements.byId(toRequest(req))));
  r.post("/v1/correcciones", transport.json({ limit: MAX_JSON_BYTES }), guarded((req: ExpressRequest) => corrections.create(toRequest(req))));
  r.post("/v1/extractos/:idExtracto/conciliacion", requireBearer, requireJson, transport.json({ limit: MAX_RECONCILE_JSON_BYTES }), guarded((req: ExpressRequest) => reconciliations.reconcileStatement(toRequest(req))));
  r.get("/v1/conciliaciones/:idConciliacion", guarded((req: ExpressRequest) => reconciliations.byId(toRequest(req))));
  // Como el envío de un extracto: busboy lee el cuerpo.
  r.post("/v1/lotes", guarded((req: ExpressRequest & NodeJS.ReadableStream) => reconciliations.uploadBatch({ headers: req.headers, stream: req })));
  r.use(jsonErrors);
  return router;
}
