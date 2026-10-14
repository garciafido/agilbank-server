import { Readable } from "stream";
import { agilbankRoutes, authorizationAsResult, MAX_JSON_BYTES, type ProductPieces } from "../../src/api/routes";
import { fakeDb } from "./fakeDb";

type Route = { verb: string; path: string; handlers: any[] };

const fakeTransport = () => {
  const routes: Route[] = [];
  const router: Record<string, unknown> = {};
  for (const verb of ["get", "post", "use"]) router[verb] = (...args: any[]) => {
    const [first, ...rest] = args;
    if (typeof first === "string") routes.push({ verb, path: first, handlers: rest });
    else routes.push({ verb, path: "*", handlers: args });
  };
  return { routes, transport: { Router: () => router, json: (options: unknown) => ({ parser: "json", options }) } as never };
};

const pieces = (over: Partial<ProductPieces> = {}): ProductPieces => ({
  db: fakeDb({ abStatement: [{ id: "s1", tenant_id_: "T1", contentHash: "a".repeat(64), status: "queued", verdict: null, reading: null }] }).db,
  authorizeClient: async () => ({ id: "c", name: "PN", tenantId: "T1", serviceUserId: "u1" }),
  storage: () => ({ uploadStream: async () => undefined }),
  enqueueReading: async () => undefined,
  ...over,
});

const call = async (routes: Route[], verb: string, path: string, req: Record<string, unknown>) => {
  const route = routes.find((r) => r.verb === verb && r.path === path);
  if (!route) throw new Error(`no está montada: ${verb} ${path}`);
  const out: { status?: number; body?: any } = {};
  const res = { status: (n: number) => ({ json: (b: unknown) => { out.status = n; out.body = b; } }) };
  await route.handlers[route.handlers.length - 1]({ headers: {}, params: {}, ...req }, res);
  return out;
};

it("monta cada camino con su verbo, su parser y su techo; por-huella antes que el id", () => {
  const t = fakeTransport();
  agilbankRoutes(t.transport, pieces());
  expect(t.routes.map((r) => [r.verb, r.path, r.handlers.length > 1 ? r.handlers[0] : null])).toEqual([
    ["post", "/v1/extractos", null],
    ["get", "/v1/extractos/por-huella/:huella", null],
    ["get", "/v1/extractos/:idExtracto", null],
    ["post", "/v1/correcciones", { parser: "json", options: { limit: MAX_JSON_BYTES } }],
    ["use", "*", null],
  ]);
  expect(MAX_JSON_BYTES).toBe(64 * 1024);
});

it("la consulta por id responde por el router", async () => {
  const t = fakeTransport();
  agilbankRoutes(t.transport, pieces());
  const r = await call(t.routes, "get", "/v1/extractos/:idExtracto", { params: { idExtracto: "s1" } });
  expect(r).toEqual({ status: 200, body: { idExtracto: "s1", huella: "a".repeat(64), estado: "en-proceso", reintentarEn: 5 } });
});

it("el envío lee el cuerpo del propio pedido", async () => {
  const t = fakeTransport();
  agilbankRoutes(t.transport, pieces());
  const req = Object.assign(Readable.from([Buffer.from("x")]), { headers: { "content-type": "application/pdf" }, params: {} });
  const route = t.routes[0];
  const out: { status?: number; body?: any } = {};
  await route.handlers[0](req, { status: (n: number) => ({ json: (b: unknown) => { out.status = n; out.body = b; } }) });
  expect(out.status).toBe(415);
});

it("la consulta por huella responde por el router, sin pasar por el id", async () => {
  const t = fakeTransport();
  agilbankRoutes(t.transport, pieces());
  const ok = await call(t.routes, "get", "/v1/extractos/por-huella/:huella", { params: { huella: "a".repeat(64) } });
  expect(ok).toEqual({ status: 200, body: { idExtracto: "s1", huella: "a".repeat(64), estado: "en-proceso", reintentarEn: 5 } });
  const mal = await call(t.routes, "get", "/v1/extractos/por-huella/:huella", { params: { huella: "no" } });
  expect(mal.status).toBe(400);
});

it("el envío sube el archivo al almacenamiento del producto, con su clave y su tipo, y encola", async () => {
  const t = fakeTransport();
  const FILE = Buffer.from("Fecha;Concepto;Importe;Saldo\n01/07/2026;Transf;100,00;1.100,00\n");
  const uploads: Array<{ key: string; options: unknown; bytes: Buffer }> = [];
  const enqueued: unknown[][] = [];
  const db = fakeDb();
  agilbankRoutes(t.transport, pieces({
    db: db.db,
    storage: () => ({
      uploadStream: async (stream, key, options) => {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(chunk as Buffer);
        uploads.push({ key, options, bytes: Buffer.concat(chunks) });
      },
    }),
    enqueueReading: async (...args) => { enqueued.push(args); },
  }));
  const body = Buffer.concat([
    Buffer.from('--b\r\nContent-Disposition: form-data; name="archivo"; filename="julio.csv"\r\nContent-Type: text/csv\r\n\r\n'),
    FILE,
    Buffer.from("\r\n--b--\r\n"),
  ]);
  const req = Object.assign(Readable.from([body]), { headers: { authorization: "Bearer t", "content-type": "multipart/form-data; boundary=b" }, params: {} });
  const out: { status?: number; body?: any } = {};
  await t.routes[0].handlers[0](req, { status: (n: number) => ({ json: (b: unknown) => { out.status = n; out.body = b; } }) });
  expect(out.status).toBe(202);
  expect(uploads).toHaveLength(1);
  expect(uploads[0].key).toMatch(/^AbStatement\.file\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]{36}\/julio\.csv$/);
  expect(uploads[0].options).toEqual({ contentType: "text/csv" });
  expect(uploads[0].bytes.equals(FILE)).toBe(true);
  expect(enqueued).toEqual([[out.body.idExtracto, "u1", "T1"]]);
});

it("las correcciones reciben el cuerpo ya parseado", async () => {
  const t = fakeTransport();
  const db = fakeDb();
  agilbankRoutes(t.transport, pieces({ db: db.db }));
  const r = await call(t.routes, "post", "/v1/correcciones", { body: { textoDelBanco: "COMISION", tipo: "comision" } });
  expect(r.status).toBe(201);
  expect(db.rows.abConceptCorrection).toHaveLength(1);
});

it("un error inesperado responde 500 ERROR_INTERNO sin la causa", async () => {
  const t = fakeTransport();
  const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
  agilbankRoutes(t.transport, pieces({ db: { abStatement: { findFirst: async () => { throw new Error("secreto"); } } } }));
  const r = await call(t.routes, "get", "/v1/extractos/:idExtracto", { params: { idExtracto: "s1" } });
  expect(r).toEqual({ status: 500, body: { codigo: "ERROR_INTERNO", error: "No se pudo completar el pedido." } });
  expect(errors).toHaveBeenCalledWith("[agilbank] error interno en la API", expect.objectContaining({ message: "secreto" }));
  errors.mockRestore();
});

it("un error inesperado en las correcciones responde 500 ERROR_INTERNO sin la causa", async () => {
  const t = fakeTransport();
  const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
  agilbankRoutes(t.transport, pieces({ authorizeClient: async () => { throw new Error("secreto"); } }));
  const r = await call(t.routes, "post", "/v1/correcciones", { body: { textoDelBanco: "COMISION", tipo: "comision" } });
  expect(r).toEqual({ status: 500, body: { codigo: "ERROR_INTERNO", error: "No se pudo completar el pedido." } });
  expect(errors).toHaveBeenCalled();
  errors.mockRestore();
});

describe("los errores del parser de JSON", () => {
  const middleware = () => {
    const t = fakeTransport();
    agilbankRoutes(t.transport, pieces());
    return t.routes.find((r) => r.verb === "use")!.handlers[0];
  };
  const run = (err: unknown) => {
    const out: { status?: number; body?: any; next?: unknown } = {};
    middleware()(err, {}, { status: (n: number) => ({ json: (b: unknown) => { out.status = n; out.body = b; } }) }, (e: unknown) => { out.next = e; });
    return out;
  };
  it("tiene cuatro argumentos, como pide express para un manejador de errores", () => {
    expect(middleware().length).toBe(4);
  });
  it("un cuerpo de más de 64 KB: 413 CUERPO_DEMASIADO_GRANDE", () => {
    expect(run({ type: "entity.too.large" })).toEqual({ status: 413, body: { codigo: "CUERPO_DEMASIADO_GRANDE", error: "El cuerpo pesa más de 64 KB." } });
  });
  it("un JSON roto: 400 CORRECCION_INVALIDA con campo null", () => {
    expect(run({ type: "entity.parse.failed" })).toEqual({ status: 400, body: { codigo: "CORRECCION_INVALIDA", error: "El cuerpo no es un JSON válido.", campo: null } });
  });
  it.each(["encoding.unsupported", "charset.unsupported"])("%s: 415 CUERPO_NO_SOPORTADO", (type) => {
    expect(run({ type })).toEqual({ status: 415, body: { codigo: "CUERPO_NO_SOPORTADO", error: "El cuerpo usa una codificación que no se acepta: JSON en UTF-8, sin comprimir." } });
  });
  it.each(["request.aborted", "request.size.invalid"])("%s: 400 CORRECCION_INVALIDA, cuerpo incompleto", (type) => {
    expect(run({ type })).toEqual({ status: 400, body: { codigo: "CORRECCION_INVALIDA", error: "El cuerpo llegó incompleto.", campo: null } });
  });
  it("cualquier otro error: 500 ERROR_INTERNO, se registra y no sigue de largo", () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const err = new Error("otro");
    expect(run(err)).toEqual({ status: 500, body: { codigo: "ERROR_INTERNO", error: "No se pudo completar el pedido." } });
    expect(errors).toHaveBeenCalledWith("[agilbank] error interno en la API", err);
    errors.mockRestore();
  });
  it("un error sin forma (null) también es 500", () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
    expect(run(null)).toEqual({ status: 500, body: { codigo: "ERROR_INTERNO", error: "No se pudo completar el pedido." } });
    errors.mockRestore();
  });
});

describe("authorizationAsResult", () => {
  const named = (name: string) => Object.assign(new Error("m"), { name });
  it("traduce los errores del producto por su nombre", async () => {
    expect(await authorizationAsResult(async () => { throw named("AmbitoInsuficienteError"); })("t", "s")).toEqual({ ok: false, reason: "no-scope", message: "m" });
    expect(await authorizationAsResult(async () => { throw named("SistemaClienteNoAutorizadoError"); })("t", "s")).toEqual({ ok: false, reason: "unauthorized", message: "m" });
  });
  it("cualquier otro error se propaga", async () => {
    await expect(authorizationAsResult(async () => { throw new Error("db"); })("t", "s")).rejects.toThrow("db");
    await expect(authorizationAsResult(async () => { throw null; })("t", "s")).rejects.toBeNull();
  });
  it("autorizado: el sistema cliente", async () => {
    const client = { id: "c", name: "n", tenantId: "T", serviceUserId: "u" };
    expect(await authorizationAsResult(async () => client)("t", "s")).toEqual({ ok: true, client });
  });
});
