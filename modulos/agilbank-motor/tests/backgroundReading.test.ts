import { configureBackgroundReading, latestCorrections, markStatementFailed, readStatementStage } from "../src/backgroundReading";
import { fakeDb } from "./api/fakeDb";

const CSV = Buffer.from(
  "Fecha;Concepto;Importe;Saldo\n01/07/2026;Saldo anterior;;1.000,00\n02/07/2026;COMISION MANTENIMIENTO;-10,00;990,00\n03/07/2026;Transf recibida;100,00;1.090,00\n",
);
const FILE_DATA = { baseName: "AbStatement.file/2026/07/05/", uuid: "u-1", filename: "julio.csv" };
const KEY = "AbStatement.file/2026/07/05/u-1/julio.csv";
const statement = (over: Record<string, unknown> = {}) => ({
  id: "s1", tenant_id_: "T1", status: "queued", originalName: "julio.csv", file_server_data: FILE_DATA, declaredAccount: null, ...over,
});

const storage = (files: Record<string, Buffer>) => {
  const asked: string[] = [];
  return { asked, storage: () => ({ downloadBuffer: async (key: string) => { asked.push(key); if (!files[key]) throw new Error("no está"); return files[key]; } }) };
};

describe("readStatementStage", () => {
  it("baja el archivo, lo lee y guarda la lectura, el veredicto y el encabezado", async () => {
    const s = storage({ [KEY]: CSV });
    configureBackgroundReading({ storage: s.storage });
    const b = fakeDb({ abStatement: [statement()] });
    const out = await readStatementStage({ prisma: b.db, currentUser: { tenant_id_: "T1" } }, "s1", "w1");
    expect(out).toEqual({ status: "read" });
    expect(s.asked).toEqual([KEY]);
    const row = b.rows.abStatement[0];
    expect(row).toMatchObject({ status: "read", error: null, lineCount: row.reading.lines.length });
    expect(row.verdict).toBe(row.reading.verdict);
    expect(row.reading.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(row.processedAt).toBeInstanceOf(Date);
    expect(b.wheres.every((w) => w.tenant_id_ === "T1")).toBe(true);
  });

  it("guarda el encabezado en columnas: banco, CBU, período y saldos en pesos con dos decimales", async () => {
    configureBackgroundReading({ storage: storage({ [KEY]: CSV }).storage });
    const b = fakeDb({ abStatement: [statement({ declaredAccount: { cbu: "1910001800005555555555" } })] });
    await readStatementStage({ prisma: b.db, currentUser: { tenant_id_: "T1" } }, "s1");
    const row = b.rows.abStatement[0];
    expect(row).toMatchObject({
      bankCode: "191",
      cbu: "1910001800005555555555",
      periodFrom: new Date("2026-07-02T00:00:00.000Z"),
      periodTo: new Date("2026-07-03T00:00:00.000Z"),
      openingBalance: "1000.00",
      closingBalance: "1090.00",
      lineCount: row.reading.lines.length,
    });
    expect(row.lineCount).toBeGreaterThan(0);
  });

  it("un archivo que no es un extracto se guarda leído, sin encabezado: todas las columnas del encabezado en null", async () => {
    const key = "AbStatement.file/2026/07/05/u-1/nota.txt";
    configureBackgroundReading({ storage: storage({ [key]: Buffer.from("hola") }).storage });
    const b = fakeDb({ abStatement: [statement({ originalName: "nota.txt", file_server_data: { ...FILE_DATA, filename: "nota.txt" } })] });
    expect(await readStatementStage({ prisma: b.db, currentUser: { tenant_id_: "T1" } }, "s1")).toEqual({ status: "read" });
    expect(b.rows.abStatement[0]).toMatchObject({
      status: "read", verdict: "abstained", bankCode: null, cbu: null, periodFrom: null, periodTo: null, openingBalance: null, closingBalance: null, lineCount: 0,
    });
  });

  it("un encabezado sin saldos guarda los saldos en null, no en NaN", async () => {
    const sinSaldos = Buffer.from("Fecha;Concepto;Importe\n02/07/2026;Transf recibida;100,00\n03/07/2026;Transf enviada;-50,00\n");
    configureBackgroundReading({ storage: storage({ [KEY]: sinSaldos }).storage });
    const b = fakeDb({ abStatement: [statement()] });
    await readStatementStage({ prisma: b.db, currentUser: { tenant_id_: "T1" } }, "s1");
    const { header } = b.rows.abStatement[0].reading;
    const row = b.rows.abStatement[0];
    expect(header.openingBalanceCents).toBeNull();
    expect(row.openingBalance).toBeNull();
    expect(row.closingBalance).toBeNull();
  });

  it("aplica las correcciones de la empresa y no las de otra", async () => {
    configureBackgroundReading({ storage: storage({ [KEY]: CSV }).storage });
    const b = fakeDb({
      abStatement: [statement()],
      abConceptCorrection: [
        { id: "c1", tenant_id_: "T1", bankCode: null, operationCode: null, bankText: "COMISION MANTENIMIENTO", canonicalType: "sellos", createdAt_: new Date(2026, 6, 1) },
        { id: "c2", tenant_id_: "T2", bankCode: null, operationCode: null, bankText: "Transf recibida", canonicalType: "intereses", createdAt_: new Date(2026, 6, 1) },
      ],
    });
    await readStatementStage({ prisma: b.db, currentUser: { tenant_id_: "T1" } }, "s1");
    const lines = b.rows.abStatement[0].reading.lines as Array<{ bank: { text: string }; type: { code: string; source: string } }>;
    const comision = lines.find((l) => /COMISION/.test(l.bank.text))!;
    expect(comision.type).toMatchObject({ code: "sellos", source: "company" });
    const transf = lines.find((l) => /Transf/.test(l.bank.text))!;
    expect(transf.type.code).not.toBe("intereses");
  });

  it("de dos correcciones del mismo concepto rige la más nueva, esté donde esté en la tabla", async () => {
    configureBackgroundReading({ storage: storage({ [KEY]: CSV }).storage });
    const b = fakeDb({
      abStatement: [statement()],
      abConceptCorrection: [
        { id: "c1", tenant_id_: "T1", bankCode: null, operationCode: null, bankText: "COMISION MANTENIMIENTO", canonicalType: "sellos", createdAt_: new Date(2026, 6, 1) },
        { id: "c2", tenant_id_: "T1", bankCode: null, operationCode: null, bankText: "Comision  mantenimiento", canonicalType: "intereses", createdAt_: new Date(2026, 6, 3) },
        { id: "c3", tenant_id_: "T1", bankCode: null, operationCode: null, bankText: "COMISION MANTENIMIENTO", canonicalType: "comision", createdAt_: new Date(2026, 6, 2) },
      ],
    });
    await readStatementStage({ prisma: b.db, currentUser: { tenant_id_: "T1" } }, "s1");
    const lines = b.rows.abStatement[0].reading.lines as Array<{ bank: { text: string }; type: { code: string } }>;
    expect(lines.find((l) => /COMISION/.test(l.bank.text))!.type.code).toBe("intereses");
  });

  it("pide a la base las columnas que la lectura usa, del extracto y de las correcciones", async () => {
    configureBackgroundReading({ storage: storage({ [KEY]: CSV }).storage });
    const b = fakeDb({ abStatement: [statement()] });
    const selects: Record<string, unknown> = {};
    for (const [name, method] of [["abStatement", "findFirst"], ["abConceptCorrection", "findMany"]] as const) {
      const original = b.db[name][method] as (args: never) => Promise<unknown>;
      (b.db[name] as unknown as Record<string, unknown>)[method] = async (args: { select: unknown }) => { selects[name] = args.select; return original(args as never); };
    }
    await readStatementStage({ prisma: b.db, currentUser: { tenant_id_: "T1" } }, "s1");
    expect(selects).toEqual({
      abStatement: { id: true, originalName: true, file_server_data: true, declaredAccount: true },
      abConceptCorrection: { bankCode: true, operationCode: true, bankText: true, canonicalType: true },
    });
  });

  it("pasa la cuenta declarada a la lectura", async () => {
    configureBackgroundReading({ storage: storage({ [KEY]: CSV }).storage });
    const b = fakeDb({ abStatement: [statement({ declaredAccount: { cbu: "1910001800005555555555" } })] });
    await readStatementStage({ prisma: b.db, currentUser: { tenant_id_: "T1" } }, "s1");
    expect(b.rows.abStatement[0].reading.header.cbu).toBe("1910001800005555555555");
  });

  it("un extracto de otra empresa no se lee: devuelve not-found sin tocar nada", async () => {
    const s = storage({ [KEY]: CSV });
    configureBackgroundReading({ storage: s.storage });
    const b = fakeDb({ abStatement: [statement({ tenant_id_: "T2" })] });
    expect(await readStatementStage({ prisma: b.db, currentUser: { tenant_id_: "T1" } }, "s1")).toEqual({ status: "not-found" });
    expect(s.asked).toEqual([]);
    expect(b.rows.abStatement[0].status).toBe("queued");
  });

  it("sin empresa en el trabajo: tira, sin consultar la base", async () => {
    configureBackgroundReading({ storage: storage({}).storage });
    const b = fakeDb({ abStatement: [statement()] });
    await expect(readStatementStage({ prisma: b.db, currentUser: null }, "s1")).rejects.toThrow("El trabajo de lectura no trae empresa.");
    await expect(readStatementStage({ prisma: b.db }, "s1")).rejects.toThrow("El trabajo de lectura no trae empresa.");
    expect(b.wheres).toEqual([]);
  });

  it("ante un error deja el extracto en queued con la causa y relanza, para que el worker reintente", async () => {
    configureBackgroundReading({ storage: storage({}).storage });
    const b = fakeDb({ abStatement: [statement()] });
    await expect(readStatementStage({ prisma: b.db, currentUser: { tenant_id_: "T1" } }, "s1")).rejects.toThrow("no está");
    expect(b.rows.abStatement[0]).toMatchObject({ status: "queued", error: "no está" });
  });

  it("lo marca processing antes de bajar el archivo", async () => {
    const b = fakeDb({ abStatement: [statement()] });
    let statusWhileDownloading = "";
    configureBackgroundReading({ storage: () => ({ downloadBuffer: async () => { statusWhileDownloading = b.rows.abStatement[0].status; return CSV; } }) });
    await readStatementStage({ prisma: b.db, currentUser: { tenant_id_: "T1" } }, "s1");
    expect(statusWhileDownloading).toBe("processing");
  });
});

describe("readStatementStage sin configurar", () => {
  it("falla con un mensaje que dice qué falta", async () => {
    await jest.isolateModulesAsync(async () => {
      const fresh = await import("../src/backgroundReading");
      const b = fakeDb({ abStatement: [statement()] });
      await expect(fresh.readStatementStage({ prisma: b.db, currentUser: { tenant_id_: "T1" } }, "s1")).rejects.toThrow(
        "La lectura de extractos no está configurada: falta configureBackgroundReading en el arranque del worker.",
      );
    });
  });
});

describe("latestCorrections", () => {
  it("de las correcciones del mismo concepto queda la primera (las filas vienen de la más nueva a la más vieja)", () => {
    expect(latestCorrections([
      { bankCode: "191", operationCode: "X", bankText: "Comisión  Mant.", canonicalType: "comision" },
      { bankCode: "191", operationCode: "X", bankText: "COMISION MANT", canonicalType: "sellos" },
      { bankCode: "191", operationCode: "Y", bankText: "COMISION MANT", canonicalType: "iva" },
      { bankCode: null, operationCode: null, bankText: "COMISION MANT", canonicalType: "intereses" },
    ])).toEqual([
      { bankCode: "191", operationCode: "X", text: "Comisión  Mant.", type: "comision" },
      { bankCode: "191", operationCode: "Y", text: "COMISION MANT", type: "iva" },
      { bankCode: null, operationCode: null, text: "COMISION MANT", type: "intereses" },
    ]);
  });
});

describe("latestCorrections: la clave del concepto", () => {
  const row = (bankCode: string | null, operationCode: string | null, bankText: string, canonicalType: string) => ({ bankCode, operationCode, bankText, canonicalType });

  it("el mismo texto y código de operación en otro banco es otro concepto", () => {
    expect(latestCorrections([row("191", "X", "COMISION", "a"), row("200", "X", "COMISION", "b"), row(null, "X", "COMISION", "c")]).map((c) => c.type)).toEqual(["a", "b", "c"]);
  });

  it("los campos de la clave no se mezclan: (banco 1, operación 23) no es (banco 12, operación 3)", () => {
    expect(latestCorrections([row("1", "23", "T", "a"), row("12", "3", "T", "b")]).map((c) => c.type)).toEqual(["a", "b"]);
  });
});

describe("markStatementFailed", () => {
  const events = [{ id: "w1", tenant_id_: "T1" }, { id: "w2", tenant_id_: "T1" }, { id: "w3", tenant_id_: "T1" }];

  it("al agotarse los reintentos marca failed el extracto del mensaje, salvo que ya esté leído", async () => {
    const b = fakeDb({ abStatement: [statement({ status: "queued" }), statement({ id: "s2", status: "read" })], workerEvent: events });
    await markStatementFailed({ payload: { workerEventId: "w1", input: { statementId: "s1" } }, prisma: b.db });
    await markStatementFailed({ payload: { workerEventId: "w2", input: { statementId: "s2" } }, prisma: b.db });
    expect(b.rows.abStatement.map((r) => r.status)).toEqual(["failed", "read"]);
  });

  it("no marca el extracto de otra empresa que la del evento del worker", async () => {
    const b = fakeDb({ abStatement: [statement({ tenant_id_: "T2" })], workerEvent: events });
    await markStatementFailed({ payload: { workerEventId: "w1", input: { statementId: "s1" } }, prisma: b.db });
    expect(b.rows.abStatement[0].status).toBe("queued");
  });

  it("un evento sin empresa no escribe nada", async () => {
    const b = fakeDb({ abStatement: [statement()], workerEvent: [{ id: "w1", tenant_id_: null }, { id: "w2" }] });
    await markStatementFailed({ payload: { workerEventId: "w1", input: { statementId: "s1" } }, prisma: b.db });
    await markStatementFailed({ payload: { workerEventId: "w2", input: { statementId: "s1" } }, prisma: b.db });
    expect(b.rows.abStatement[0].status).toBe("queued");
  });

  it("un evento que no existe no escribe nada", async () => {
    const b = fakeDb({ abStatement: [statement()], workerEvent: events });
    await markStatementFailed({ payload: { workerEventId: "nope", input: { statementId: "s1" } }, prisma: b.db });
    expect(b.rows.abStatement[0].status).toBe("queued");
  });

  it("un mensaje sin id de extracto o sin id de evento no consulta ni escribe", async () => {
    const b = fakeDb({ abStatement: [statement()], workerEvent: events });
    const payloads = [
      undefined, {}, { input: {} },
      { workerEventId: "w1" }, { workerEventId: "w1", input: {} }, { workerEventId: "w1", input: { statementId: "" } }, { workerEventId: "w1", input: { statementId: 3 } },
      { input: { statementId: "s1" } }, { workerEventId: "", input: { statementId: "s1" } }, { workerEventId: 7, input: { statementId: "s1" } },
    ];
    for (const payload of payloads) await markStatementFailed({ payload, prisma: b.db });
    expect(b.wheres).toEqual([]);
    expect(b.rows.abStatement[0].status).toBe("queued");
  });
});
