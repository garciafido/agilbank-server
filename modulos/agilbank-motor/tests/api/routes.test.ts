import { Readable } from "stream";
import { MAX_RECONCILE_JSON_BYTES } from "../../src/api/reconciliations";
import { agilbankRoutes, authorizationAsResult, MAX_JSON_BYTES, type ProductPieces } from "../../src/api/routes";
import { line } from "../reconcile/fixtures";
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
  // Lo que corre antes del manejador: el corte sin credencial (una función) y el parser.
  expect(t.routes.map((r) => [r.verb, r.path, r.handlers.slice(0, -1)])).toEqual([
    ["post", "/v1/extractos", []],
    ["get", "/v1/extractos/por-huella/:huella", []],
    ["get", "/v1/extractos/:idExtracto", []],
    ["post", "/v1/correcciones", [{ parser: "json", options: { limit: MAX_JSON_BYTES } }]],
    ["post", "/v1/extractos/:idExtracto/conciliacion", [expect.any(Function), expect.any(Function), { parser: "json", options: { limit: MAX_RECONCILE_JSON_BYTES } }]],
    ["get", "/v1/conciliaciones/:idConciliacion", []],
    ["post", "/v1/lotes", []],
    ["post", "/v1/decisiones", [expect.any(Function), expect.any(Function), { parser: "json", options: { limit: MAX_RECONCILE_JSON_BYTES } }]],
    ["use", "*", []],
  ]);
  expect(MAX_JSON_BYTES).toBe(64 * 1024);
});

describe("las rutas de la conciliación", () => {
  const read = { id: "s2", tenant_id_: "T1", status: "read", verdict: "verified", reading: { warnings: [], lines: [line({ id: "l1", amountCents: 1000 })] } };
  it("la conciliación recibe el cuerpo ya parseado y el id del extracto", async () => {
    const t = fakeTransport();
    const db = fakeDb({ abStatement: [read] });
    agilbankRoutes(t.transport, pieces({ db: db.db }));
    const r = await call(t.routes, "post", "/v1/extractos/:idExtracto/conciliacion", { params: { idExtracto: "s2" }, body: { valores: [{ idValor: 9, importe: 10, fechaComprobante: "2026-07-10" }] } });
    expect(r.status).toBe(200);
    expect(r.body.propuestas).toEqual([expect.objectContaining({ idRenglon: "l1", tipo: "apareo", valores: [9] })]);
    expect(db.rows.abReconciliation).toHaveLength(1);
  });
  it("la consulta de una conciliación responde por el router", async () => {
    const t = fakeTransport();
    agilbankRoutes(t.transport, pieces({ db: fakeDb({ abReconciliation: [{ id: "c1", tenant_id_: "T1", result: { proposals: [], originalIds: {} } }] }).db }));
    expect(await call(t.routes, "get", "/v1/conciliaciones/:idConciliacion", { params: { idConciliacion: "c1" } })).toEqual({ status: 200, body: { idConciliacion: "c1", propuestas: [] } });
  });
  it("la subida de un lote lee el cuerpo del propio pedido", async () => {
    const t = fakeTransport();
    const db = fakeDb();
    agilbankRoutes(t.transport, pieces({ db: db.db }));
    const csv = "Monto;Estado\n100,00;OK\n";
    const body = Buffer.from(`--b\r\nContent-Disposition: form-data; name="archivo"; filename="pagos.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--b--\r\n`);
    const req = Object.assign(Readable.from([body]), { headers: { authorization: "Bearer t", "content-type": "multipart/form-data; boundary=b" }, params: {} });
    const route = t.routes.find((x) => x.verb === "post" && x.path === "/v1/lotes")!;
    const out: { status?: number; body?: any } = {};
    await route.handlers[0](req, { status: (n: number) => ({ json: (b: unknown) => { out.status = n; out.body = b; } }) });
    expect(out).toEqual({ status: 201, body: { idLote: db.rows.abPaymentBatch[0].id, transferencias: 1, conError: 0 } });
  });
  describe("la conciliación sin credencial corta antes de parsear el cuerpo", () => {
    const gate = () => {
      const t = fakeTransport();
      agilbankRoutes(t.transport, pieces());
      return t.routes.find((x) => x.path === "/v1/extractos/:idExtracto/conciliacion")!.handlers[0];
    };
    const run = (headers: Record<string, unknown>) => {
      const out: { status?: number; body?: unknown; next: number } = { next: 0 };
      gate()({ headers }, { status: (n: number) => ({ json: (b: unknown) => { out.status = n; out.body = b; } }) }, () => { out.next++; });
      return out;
    };
    it.each([[{}], [{ authorization: "Basic abc" }], [{ authorization: "Bearer" }], [{ authorization: "Bearer " }], [{ authorization: ["Bearer t"] }]])("%j: 401 NO_AUTORIZADO, y el parser no corre", (headers) => {
      expect(run(headers)).toEqual({ status: 401, body: { codigo: "NO_AUTORIZADO", error: "Falta la credencial: el pedido lleva Authorization: Bearer y el token." }, next: 0 });
    });
    it("con un Bearer sigue al parser, sin responder: la autorización completa es del manejador", () => {
      expect(run({ authorization: "Bearer t" })).toEqual({ next: 1 });
      expect(run({ authorization: "bearer t" })).toEqual({ next: 1 });
    });
  });
  describe("la conciliación sin Content-Type JSON corta antes de parsear el cuerpo", () => {
    const UNSUPPORTED = { codigo: "CUERPO_NO_SOPORTADO", error: "La conciliación se envía como JSON: el pedido lleva Content-Type: application/json." };
    /** Corre la cadena de la ruta como express: cada paso sigue al siguiente solo si llama a next; el parser falso no hace nada. */
    const chain = async (headers: Record<string, unknown>, body: unknown) => {
      const t = fakeTransport();
      const db = fakeDb({ abStatement: [read] });
      agilbankRoutes(t.transport, pieces({ db: db.db }));
      const handlers = t.routes.find((x) => x.path === "/v1/extractos/:idExtracto/conciliacion")!.handlers;
      const out: { status?: number; body?: any } = {};
      const res = { status: (n: number) => ({ json: (b: unknown) => { out.status = n; out.body = b; } }) };
      const req = { headers: { authorization: "Bearer t", ...headers }, params: { idExtracto: "s2" }, body };
      const step = async (i: number): Promise<void> => {
        const h = handlers[i];
        if (typeof h !== "function") return step(i + 1);
        await h(req, res, () => step(i + 1));
      };
      await step(0);
      return { out, saved: db.rows.abReconciliation ?? [] };
    };
    const valores = { valores: [{ idValor: 9, importe: 10, fechaComprobante: "2026-07-10" }] };
    it.each([[{}], [{ "content-type": "text/plain" }], [{ "content-type": "application/x-www-form-urlencoded" }], [{ "content-type": "application/jsonx" }], [{ "content-type": ["application/json"] }]])(
      "%j: 415 CUERPO_NO_SOPORTADO y no guarda nada",
      async (headers) => {
        expect(await chain(headers, {})).toEqual({ out: { status: 415, body: UNSUPPORTED }, saved: [] });
      },
    );
    it.each(["application/json", "application/json; charset=utf-8", "Application/JSON;charset=UTF-8", " application/json "])("%s: concilia", async (type) => {
      const r = await chain({ "content-type": type }, valores);
      expect(r.out.status).toBe(200);
      expect(r.saved).toHaveLength(1);
    });
    it("sin credencial manda el 401 aunque tampoco haya Content-Type", async () => {
      const t = fakeTransport();
      agilbankRoutes(t.transport, pieces());
      const out: { status?: number } = {};
      const [bearer] = t.routes.find((x) => x.path === "/v1/extractos/:idExtracto/conciliacion")!.handlers;
      bearer({ headers: {} }, { status: (n: number) => ({ json: () => { out.status = n; } }) }, () => undefined);
      expect(out.status).toBe(401);
    });
  });
  it("las tres piden el ámbito ab:conciliar", async () => {
    const t = fakeTransport();
    const scopes: string[] = [];
    agilbankRoutes(t.transport, pieces({ authorizeClient: async (_token, scope) => { scopes.push(scope); throw Object.assign(new Error("m"), { name: "AmbitoInsuficienteError" }); } }));
    expect((await call(t.routes, "post", "/v1/extractos/:idExtracto/conciliacion", { params: { idExtracto: "s1" }, body: {} })).status).toBe(403);
    expect((await call(t.routes, "get", "/v1/conciliaciones/:idConciliacion", { params: { idConciliacion: "c1" } })).status).toBe(403);
    const req = Object.assign(Readable.from([Buffer.from("x")]), { headers: {}, params: {} });
    const out: { status?: number } = {};
    await t.routes.find((x) => x.path === "/v1/lotes")!.handlers[0](req, { status: (n: number) => ({ json: () => { out.status = n; } }) });
    expect(out.status).toBe(403);
    expect(scopes).toEqual(["ab:conciliar", "ab:conciliar", "ab:conciliar"]);
  });
  it("un error inesperado en la conciliación responde 500 ERROR_INTERNO", async () => {
    const t = fakeTransport();
    const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
    agilbankRoutes(t.transport, pieces({ db: { abStatement: { findFirst: async () => { throw new Error("secreto"); } } } }));
    const r = await call(t.routes, "post", "/v1/extractos/:idExtracto/conciliacion", { params: { idExtracto: "s1" }, body: {} });
    expect(r).toEqual({ status: 500, body: { codigo: "ERROR_INTERNO", error: "No se pudo completar el pedido." } });
    errors.mockRestore();
  });
});

describe("la ruta de decisiones", () => {
  const rec = {
    id: "C1", tenant_id_: "T1", statementId: "S1", bankCode: "191",
    result: { proposals: [{ id: "p1", proposal: { kind: "pending", lineId: "l1", reason: "x", marks: [] } }], originalIds: {}, lines: { l1: { conceptKey: "191||x", canonicalType: "comision" } } },
  };
  const decisiones = [{ idConciliacion: "C1", idPropuesta: "p1", resultado: "aceptada", elegido: { tipo: "pendiente" } }];
  /** Corre la cadena de la ruta como express: cada paso sigue al siguiente solo si llama a next; el parser falso no hace nada. */
  const chain = async (headers: Record<string, unknown>, body: unknown, over: Partial<ProductPieces> = {}) => {
    const t = fakeTransport();
    const db = fakeDb({ abReconciliation: [rec] });
    agilbankRoutes(t.transport, pieces({ db: db.db, ...over }));
    const handlers = t.routes.find((x) => x.path === "/v1/decisiones")!.handlers;
    const out: { status?: number; body?: any } = {};
    const res = { status: (n: number) => ({ json: (b: unknown) => { out.status = n; out.body = b; } }) };
    const req = { headers, params: {}, body };
    const step = async (i: number): Promise<void> => {
      const h = handlers[i];
      if (typeof h !== "function") return step(i + 1);
      await h(req, res, () => step(i + 1));
    };
    await step(0);
    return { out, saved: db.rows.abDecision };
  };
  const JSON_H = { authorization: "Bearer t", "content-type": "application/json" };
  it("llega al manejador con el cuerpo ya parseado y registra", async () => {
    expect(await chain(JSON_H, { decisiones })).toEqual({ out: { status: 200, body: { registradas: ["p1"], rechazadas: [] } }, saved: [expect.objectContaining({ proposalId: "p1", tenant_id_: "T1" })] });
  });
  it.each([[{}], [{ authorization: "Basic abc", "content-type": "application/json" }], [{ authorization: "Bearer ", "content-type": "application/json" }]])("%j: 401 NO_AUTORIZADO sin parsear ni guardar", async (headers) => {
    expect(await chain(headers, { decisiones })).toEqual({ out: { status: 401, body: { codigo: "NO_AUTORIZADO", error: "Falta la credencial: el pedido lleva Authorization: Bearer y el token." } }, saved: [] });
  });
  it.each([[{}], [{ "content-type": "text/plain" }], [{ "content-type": "application/jsonx" }]])("%j: 415 CUERPO_NO_SOPORTADO, con el mensaje de las decisiones", async (headers) => {
    expect(await chain({ authorization: "Bearer t", ...headers }, { decisiones })).toEqual({
      out: { status: 415, body: { codigo: "CUERPO_NO_SOPORTADO", error: "Las decisiones se envían como JSON: el pedido lleva Content-Type: application/json." } }, saved: [],
    });
  });
  it("pide el ámbito ab:decidir", async () => {
    const scopes: string[] = [];
    const r = await chain(JSON_H, { decisiones }, { authorizeClient: async (_token, scope) => { scopes.push(scope); throw Object.assign(new Error("m"), { name: "AmbitoInsuficienteError" }); } });
    expect(r).toEqual({ out: { status: 403, body: { codigo: "AMBITO_INSUFICIENTE", error: "m" } }, saved: [] });
    expect(scopes).toEqual(["ab:decidir"]);
  });
  it("un error inesperado responde 500 ERROR_INTERNO", async () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await chain(JSON_H, { decisiones }, { db: { abReconciliation: { findFirst: async () => { throw new Error("secreto"); } } } });
    expect(r.out).toEqual({ status: 500, body: { codigo: "ERROR_INTERNO", error: "No se pudo completar el pedido." } });
    errors.mockRestore();
  });
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
  const run = (err: unknown, req: unknown = {}) => {
    const out: { status?: number; body?: any; next?: unknown } = {};
    middleware()(err, req, { status: (n: number) => ({ json: (b: unknown) => { out.status = n; out.body = b; } }) }, (e: unknown) => { out.next = e; });
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
    expect(run({ type })).toEqual({ status: 415, body: { codigo: "CUERPO_NO_SOPORTADO", error: "El cuerpo usa una codificación de contenido o un juego de caracteres que no se acepta: manden JSON en UTF-8." } });
  });
  it.each(["request.aborted", "request.size.invalid"])("%s: 400 CORRECCION_INVALIDA, cuerpo incompleto", (type) => {
    expect(run({ type })).toEqual({ status: 400, body: { codigo: "CORRECCION_INVALIDA", error: "El cuerpo llegó incompleto.", campo: null } });
  });
  describe("en la conciliación, con el código y el tope de esa ruta", () => {
    const conciliacion = { path: "/v1/extractos/S1/conciliacion" };
    it("un cuerpo de más de 16 MB: 413 CUERPO_DEMASIADO_GRANDE", () => {
      expect(run({ type: "entity.too.large" }, conciliacion)).toEqual({ status: 413, body: { codigo: "CUERPO_DEMASIADO_GRANDE", error: "El cuerpo pesa más de 16 MB." } });
    });
    it("un JSON roto: 400 PEDIDO_INVALIDO con campo null", () => {
      expect(run({ type: "entity.parse.failed" }, conciliacion)).toEqual({ status: 400, body: { codigo: "PEDIDO_INVALIDO", error: "El cuerpo no es un JSON válido.", campo: null } });
    });
    it.each(["request.aborted", "request.size.invalid"])("%s: 400 PEDIDO_INVALIDO, cuerpo incompleto", (type) => {
      expect(run({ type }, conciliacion)).toEqual({ status: 400, body: { codigo: "PEDIDO_INVALIDO", error: "El cuerpo llegó incompleto.", campo: null } });
    });
    it("bajo el prefijo donde se monta, también", () => {
      expect(run({ type: "entity.parse.failed" }, { path: "/api/v1/extractos/S1/conciliacion" }).body.codigo).toBe("PEDIDO_INVALIDO");
    });
    it("en las decisiones, DECISION_INVALIDA y el tope de 16 MB", () => {
      expect(run({ type: "entity.too.large" }, { path: "/v1/decisiones" })).toEqual({ status: 413, body: { codigo: "CUERPO_DEMASIADO_GRANDE", error: "El cuerpo pesa más de 16 MB." } });
      expect(run({ type: "entity.parse.failed" }, { path: "/api/v1/decisiones" })).toEqual({ status: 400, body: { codigo: "DECISION_INVALIDA", error: "El cuerpo no es un JSON válido.", campo: null } });
      expect(run({ type: "request.aborted" }, { path: "/v1/decisiones" }).body.codigo).toBe("DECISION_INVALIDA");
      expect(run({ type: "entity.parse.failed" }, { path: "/v1/decisiones/x" }).body.codigo).toBe("CORRECCION_INVALIDA");
    });
    it("en las correcciones sigue el suyo", () => {
      expect(run({ type: "entity.too.large" }, { path: "/v1/correcciones" }).body.error).toBe("El cuerpo pesa más de 64 KB.");
      expect(run({ type: "entity.parse.failed" }, { path: "/v1/correcciones" }).body.codigo).toBe("CORRECCION_INVALIDA");
      expect(run({ type: "entity.parse.failed" }, { path: "/v1/conciliacion/x" }).body.codigo).toBe("CORRECCION_INVALIDA");
      expect(run({ type: "entity.parse.failed" }, null).body.codigo).toBe("CORRECCION_INVALIDA");
    });
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
