import { Readable } from "stream";
import { createHash } from "crypto";
import { publicView, statementFileKey, statementsApi, type StatementsDeps } from "../../src/api/statements";
import type { Authorize } from "../../src/api/http";
import { fakeDb } from "./fakeDb";

const BOUNDARY = "----limite";
const multipart = (file: Buffer, extra = "", filename = "julio.csv"): Readable =>
  Readable.from([Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="archivo"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`),
    file,
    Buffer.from(`\r\n${extra}--${BOUNDARY}--\r\n`),
  ])]);
const accountPart = (json: string) => `--${BOUNDARY}\r\nContent-Disposition: form-data; name="cuenta"\r\n\r\n${json}\r\n`;
const HEADERS = { authorization: "Bearer t", "content-type": `multipart/form-data; boundary=${BOUNDARY}` };
const FILE = Buffer.from("Fecha;Concepto;Importe;Saldo\n01/07/2026;Transf;100,00;1.100,00\n");
const HASH = createHash("sha256").update(FILE).digest("hex");

const allow = (tenantId: string | null = "T1"): Authorize => async () => ({ ok: true, client: { id: "c1", name: "PN", tenantId, serviceUserId: "u1" } });

const setup = (seed: Parameters<typeof fakeDb>[0] = {}, over: Partial<StatementsDeps> = {}) => {
  const base = fakeDb(seed);
  const uploads: Array<{ key: string; mimeType: string; size: number }> = [];
  const enqueued: Array<[string, string, string]> = [];
  const api = statementsApi({
    db: base.db,
    authorize: allow(),
    upload: async (bytes, key, mimeType) => { uploads.push({ key, mimeType, size: bytes.length }); },
    enqueueReading: async (id, author, tenant) => { enqueued.push([id, author, tenant]); },
    ...over,
  });
  return { ...base, api, uploads, enqueued };
};

describe("statementFileKey", () => {
  it("arma la clave del almacenamiento con la fecha local y solo el nombre base", () => {
    const k = statementFileKey("../../etc/julio.csv", new Date(2026, 6, 5, 10), "u-1");
    expect(k).toEqual({ baseName: "AbStatement.file/2026/07/05/", uuid: "u-1", fileName: "julio.csv", key: "AbStatement.file/2026/07/05/u-1/julio.csv" });
  });
  it("las barras invertidas también cortan, y un nombre vacío se llama extracto", () => {
    expect(statementFileKey("C:\\tmp\\a.xlsx", new Date(2026, 0, 1), "u").fileName).toBe("a.xlsx");
    expect(statementFileKey("  ", new Date(2026, 0, 1), "u").fileName).toBe("extracto");
  });
});

describe("statementFileKey: el nombre acotado", () => {
  const name = (original: string) => statementFileKey(original, new Date(2026, 0, 1), "u").fileName;

  it.each([".", "..", "a/..", "a/.", "..\\", " .. ", "/"])("%j no es un nombre: se llama extracto", (original) => {
    expect(name(original)).toBe("extracto");
  });
  it("los caracteres de control se quitan, también el NUL", () => {
    expect(name("jul\u0000io\t.c\u001fsv\u007f\u0085")).toBe("julio.csv");
    expect(name("\u0000..")).toBe("extracto");
  });
  it("se corta a 200 bytes en UTF-8, sin partir un carácter: el sistema de archivos cuenta bytes", () => {
    expect(name("x".repeat(64 * 1024))).toBe("x".repeat(200));
    expect(name("y".repeat(200))).toBe("y".repeat(200));
    expect(name("ñ".repeat(300))).toBe("ñ".repeat(100));
    expect(name("\u{1F600}".repeat(300))).toBe("\u{1F600}".repeat(50));
    expect(name("a" + "ñ".repeat(150))).toBe("a" + "ñ".repeat(99));
  });
  it("lo que queda después de la carpeta se recorta", () => {
    expect(name("carpeta/  julio.csv  ")).toBe("julio.csv");
    expect(name("a/ . ")).toBe("extracto");
  });
  it("la clave usa el nombre acotado", () => {
    expect(statementFileKey("..", new Date(2026, 0, 1), "u").key).toBe("AbStatement.file/2026/01/01/u/extracto");
  });
  it("puntos dentro del nombre se conservan", () => {
    expect(name("..julio..csv")).toBe("..julio..csv");
  });
});

describe("publicView", () => {
  const row = { id: "s1", contentHash: "h", verdict: null, reading: null };
  it("queued y processing son en-proceso, con reintentarEn", () => {
    expect(publicView({ ...row, status: "queued" })).toEqual({ idExtracto: "s1", huella: "h", estado: "en-proceso", reintentarEn: 5 });
    expect(publicView({ ...row, status: "processing" })).toEqual({ idExtracto: "s1", huella: "h", estado: "en-proceso", reintentarEn: 5 });
  });
  it("failed es fallido, sin lectura", () => {
    expect(publicView({ ...row, status: "failed" })).toEqual({ idExtracto: "s1", huella: "h", estado: "fallido" });
  });
  it("read es leido, con el resumen canónico armado desde la lectura guardada", () => {
    const reading = { fingerprint: "h", verdict: "abstained", reason: "No es un extracto.", header: null, lines: [], warnings: [], checks: null };
    const view = publicView({ ...row, status: "read", verdict: "abstained", reading }) as { estado: string; lectura: { veredicto: string; motivo: string } };
    expect(view.estado).toBe("leido");
    expect(view.lectura.veredicto).toBe("sin-lectura");
    expect(view.lectura.motivo).toBe("No es un extracto.");
  });
});

describe("receive", () => {
  it("un archivo nuevo: lo sube, crea el extracto en queued con la cuenta, encola y responde 202", async () => {
    const s = setup();
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE, accountPart('{"cbu":"1910001800005555555555","saldoFinal":10}')) });
    expect(r.status).toBe(202);
    const row = s.rows.abStatement[0];
    expect(r.body).toEqual({ idExtracto: row.id, huella: HASH, estado: "en-proceso" });
    expect(row).toMatchObject({
      tenant_id_: "T1", createdBy_id_: "u1", contentHash: HASH, status: "queued", originalName: "julio.csv", file: "julio.csv",
      declaredAccount: { cbu: "1910001800005555555555", closingBalance: 10 },
    });
    expect(row.file_server_data).toEqual({ baseName: expect.stringMatching(/^AbStatement\.file\/\d{4}\/\d{2}\/\d{2}\/$/), filename: "julio.csv", mimetype: "text/csv", size: FILE.length, uuid: expect.any(String) });
    expect(row.file_data).toEqual({ name: "julio.csv", mimetype: "text/csv", size: FILE.length, url: "AbStatement.file" });
    expect(s.uploads).toEqual([{ key: `${row.file_server_data.baseName}${row.file_server_data.uuid}/julio.csv`, mimeType: "text/csv", size: FILE.length }]);
    expect(s.enqueued).toEqual([[row.id, "u1", "T1"]]);
  });

  it("el mismo archivo de la misma empresa: 200 con el mismo id y su estado, sin subir ni encolar", async () => {
    const s = setup({ abStatement: [{ id: "s1", tenant_id_: "T1", contentHash: HASH, status: "processing", verdict: null, reading: null }] });
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r).toEqual({ status: 200, body: { idExtracto: "s1", huella: HASH, estado: "en-proceso", reintentarEn: 5 } });
    expect(s.uploads).toEqual([]);
    expect(s.enqueued).toEqual([]);
  });

  it("el mismo archivo de OTRA empresa es otro extracto", async () => {
    const s = setup({ abStatement: [{ id: "s1", tenant_id_: "T2", contentHash: HASH, status: "read", verdict: "verified", reading: null }] });
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r.status).toBe(202);
    expect(s.rows.abStatement).toHaveLength(2);
  });

  it.each([
    ["failed", null],
    ["read", "unavailable"],
  ])("un reenvío de un extracto %s/%s se vuelve a leer: 202 y encola", async (status, verdict) => {
    const s = setup({ abStatement: [{ id: "s1", tenant_id_: "T1", contentHash: HASH, status, verdict, reading: { x: 1 }, error: "boom" }] });
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r).toEqual({ status: 202, body: { idExtracto: "s1", huella: HASH, estado: "en-proceso" } });
    expect(s.rows.abStatement[0]).toMatchObject({ status: "queued", verdict: null, error: null });
    expect(s.wheres[1]).toEqual({ id: "s1", tenant_id_: "T1", status, verdict, lastUpdatedAt_: null });
    expect(s.enqueued).toEqual([["s1", "u1", "T1"]]);
    expect(s.uploads).toEqual([]);
  });

  it("un extracto fallido de OTRA empresa con la misma huella no se toca: el envío crea uno nuevo", async () => {
    const other = { id: "x2", tenant_id_: "T2", contentHash: HASH, status: "failed", verdict: null, reading: null, error: "boom" };
    const s = setup({ abStatement: [{ ...other }] });
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r.status).toBe(202);
    expect(s.rows.abStatement).toHaveLength(2);
    expect(s.rows.abStatement[0]).toEqual(other);
    expect(s.rows.abStatement[1]).toMatchObject({ tenant_id_: "T1", status: "queued" });
    expect(s.enqueued).toEqual([[s.rows.abStatement[1].id, "u1", "T1"]]);
  });

  it("si encolar falla en un archivo nuevo, el extracto queda failed, el error se propaga y el reenvío lo vuelve a leer", async () => {
    let fails = true;
    const s = setup({}, { enqueueReading: async (id, author, tenant) => { if (fails) throw new Error("cola caída"); s.enqueued.push([id, author, tenant]); } });
    await expect(s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).rejects.toThrow("cola caída");
    expect(s.rows.abStatement).toHaveLength(1);
    expect(s.rows.abStatement[0]).toMatchObject({ tenant_id_: "T1", status: "failed" });
    expect(s.wheres.at(-1)).toEqual({ id: s.rows.abStatement[0].id, tenant_id_: "T1" });
    fails = false;
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r.status).toBe(202);
    expect(s.rows.abStatement).toHaveLength(1);
    expect(s.enqueued).toEqual([[s.rows.abStatement[0].id, "u1", "T1"]]);
  });

  it("si encolar falla en una relectura, el extracto vuelve a failed y el error se propaga", async () => {
    const s = setup(
      { abStatement: [{ id: "s1", tenant_id_: "T1", contentHash: HASH, status: "read", verdict: "unavailable", reading: null }] },
      { enqueueReading: async () => { throw new Error("cola caída"); } },
    );
    await expect(s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).rejects.toThrow("cola caída");
    expect(s.rows.abStatement[0]).toMatchObject({ status: "failed" });
    expect(s.wheres.at(-1)).toEqual({ id: "s1", tenant_id_: "T1" });
  });

  it.each([
    ["el nombre del archivo", () => multipart(FILE, "", "../../etc/x.csv"), "x.csv"],
    ["la parte nombre", () => multipart(FILE, `--${BOUNDARY}\r\nContent-Disposition: form-data; name="nombre"\r\n\r\n../../etc/y.csv\r\n`), "y.csv"],
  ])("%s con barras: se guarda solo el nombre base", async (_caso, stream, base) => {
    const s = setup();
    const r = await s.api.receive({ headers: HEADERS, stream: stream() });
    expect(r.status).toBe(202);
    expect(s.uploads[0].key).toMatch(new RegExp(`/[0-9a-f-]{36}/${base.replace(".", "\\.")}$`));
    expect(s.uploads[0].key.startsWith("AbStatement.file/")).toBe(true);
    expect(s.uploads[0].key).not.toContain("..");
    expect(s.rows.abStatement[0]).toMatchObject({ originalName: base, file: base });
    expect(s.rows.abStatement[0].file_server_data.filename).toBe(base);
    expect(s.rows.abStatement[0].file_data.name).toBe(base);
  });

  describe("una lectura parcial", () => {
    const partial = (causa: unknown, verdict = "weak", over: Record<string, unknown> = {}) => ({
      id: "s1", tenant_id_: "T1", contentHash: HASH, status: "read", verdict,
      reading: {
        fingerprint: HASH, verdict, reason: null, header: null, lines: [], checks: null,
        warnings: [
          { code: "no-encadena", detail: "x", blocksProposals: false, data: { causa: "tiempo" } },
          { code: "lectura-parcial", detail: "x", blocksProposals: true, data: { paginas: 4, paginasLeidas: 2, causa } },
        ],
      },
      ...over,
    });

    it.each(["tiempo", "render", "ocr"])("cortada por %s es una falla nuestra de un momento: el reenvío la vuelve a leer", async (causa) => {
      const s = setup({ abStatement: [partial(causa)] });
      const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
      expect(r).toEqual({ status: 202, body: { idExtracto: "s1", huella: HASH, estado: "en-proceso" } });
      expect(s.enqueued).toEqual([["s1", "u1", "T1"]]);
      expect(s.rows.abStatement[0]).toMatchObject({ status: "queued", verdict: null, readStarts: 0 });
    });

    it("también si el veredicto es verificada: lo que falta no se controló", async () => {
      const s = setup({ abStatement: [partial("tiempo", "verified")] });
      expect((await s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).status).toBe(202);
    });

    it.each([["paginas"], [undefined], [null]])("cortada por %s no se vuelve a leer: el tope de páginas es del archivo", async (causa) => {
      const s = setup({ abStatement: [partial(causa)] });
      expect((await s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).status).toBe(200);
      expect(s.enqueued).toEqual([]);
    });

    it("la causa de otro aviso no cuenta: tiene que ser la de lectura-parcial", async () => {
      const row = partial("paginas");
      const s = setup({ abStatement: [row] });
      expect((await s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).status).toBe(200);
    });

    it("en cola o en proceso no se vuelve a leer aunque la lectura guardada sea parcial por tiempo", async () => {
      const s = setup({ abStatement: [partial("tiempo", "weak", { status: "processing" })] });
      expect((await s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).status).toBe(200);
      expect(s.enqueued).toEqual([]);
    });

    it("un aviso lectura-parcial sin datos no se vuelve a leer", async () => {
      const row = partial("tiempo");
      row.reading.warnings = [{ code: "lectura-parcial", detail: "x", blocksProposals: true } as never];
      const s = setup({ abStatement: [row] });
      expect((await s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).status).toBe(200);
    });
  });

  it("un extracto leído con otro veredicto no se vuelve a leer", async () => {
    const s = setup({ abStatement: [{ id: "s1", tenant_id_: "T1", contentHash: HASH, status: "read", verdict: "weak", reading: { fingerprint: HASH, verdict: "weak", reason: null, header: null, lines: [], warnings: [], checks: null } }] });
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r.status).toBe(200);
    expect(s.enqueued).toEqual([]);
  });

  it("si otro pedido ya tomó la relectura, no encola dos veces", async () => {
    const s = setup({ abStatement: [{ id: "s1", tenant_id_: "T1", contentHash: HASH, status: "failed", verdict: null, reading: null }] });
    const original = s.db.abStatement.updateMany;
    s.db.abStatement.updateMany = async (args: never) => {
      s.rows.abStatement[0].status = "queued";
      return original(args);
    };
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r).toEqual({ status: 200, body: { idExtracto: "s1", huella: HASH, estado: "en-proceso", reintentarEn: 5 } });
    expect(s.enqueued).toEqual([]);
  });

  it("dos envíos simultáneos: el que pierde la carrera devuelve el existente", async () => {
    const s = setup();
    const original = s.db.abStatement.findFirst;
    let first = true;
    s.db.abStatement.findFirst = async (args: never) => {
      if (first) {
        first = false;
        s.rows.abStatement.push({ id: "otro", tenant_id_: "T1", contentHash: HASH, status: "queued", verdict: null, reading: null });
        return null;
      }
      return original(args);
    };
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r).toEqual({ status: 200, body: { idExtracto: "otro", huella: HASH, estado: "en-proceso", reintentarEn: 5 } });
    expect(s.enqueued).toEqual([]);
  });

  it("un error de la base que no es P2002 se propaga", async () => {
    const s = setup();
    s.db.abStatement.create = async () => { throw new Error("se cayó"); };
    await expect(s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).rejects.toThrow("se cayó");
  });

  it.each([
    [{ ...HEADERS, "content-type": "application/pdf" }, FILE, 415, "ENVIO_NO_MULTIPART"],
  ])("un cuerpo que no es multipart: %#", async (headers, file, status, codigo) => {
    const s = setup();
    const r = await s.api.receive({ headers, stream: Readable.from([file]) });
    expect(r.status).toBe(status);
    expect((r.body as { codigo: string }).codigo).toBe(codigo);
  });

  it("sin archivo: 400 FALTA_ARCHIVO; cuenta rota: 400 CUENTA_INVALIDA; cuenta con un campo mal: el campo", async () => {
    const s = setup();
    const sin = await s.api.receive({ headers: HEADERS, stream: Readable.from([Buffer.from(`${accountPart("{}")}--${BOUNDARY}--\r\n`)]) });
    expect(sin).toMatchObject({ status: 400, body: { codigo: "FALTA_ARCHIVO" } });
    const rota = await s.api.receive({ headers: HEADERS, stream: multipart(FILE, accountPart("{no")) });
    expect(rota).toMatchObject({ status: 400, body: { codigo: "CUENTA_INVALIDA", campo: null } });
    const mal = await s.api.receive({ headers: HEADERS, stream: multipart(FILE, accountPart('{"saldoFinal":"10"}')) });
    expect(mal).toMatchObject({ status: 400, body: { codigo: "CUENTA_INVALIDA", campo: "saldoFinal" } });
    expect(s.rows.abStatement).toEqual([]);
    expect(s.enqueued).toEqual([]);
  });

  it("dos archivos: 400 ENVIO_INVALIDO; una conexión cortada: 400 ENVIO_INVALIDO, sin crear nada", async () => {
    const s = setup();
    const dos = Readable.from([Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="archivo"; filename="a"\r\n\r\nA\r\n` +
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="archivo"; filename="b"\r\n\r\nB\r\n--${BOUNDARY}--\r\n`)]);
    expect(await s.api.receive({ headers: HEADERS, stream: dos })).toMatchObject({ status: 400, body: { codigo: "ENVIO_INVALIDO" } });
    const cortada = new Readable({ read() { this.destroy(new Error("ECONNRESET")); } });
    expect(await s.api.receive({ headers: HEADERS, stream: cortada })).toMatchObject({ status: 400, body: { codigo: "ENVIO_INVALIDO" } });
    expect(s.rows.abStatement).toEqual([]);
    expect(s.uploads).toEqual([]);
  });

  it("la autorización va primero: sin credencial no se lee el cuerpo", async () => {
    const s = setup({}, { authorize: async () => ({ ok: false, reason: "unauthorized", message: "no" }) });
    let read = false;
    const stream = new Readable({ read() { read = true; this.push(null); } });
    const r = await s.api.receive({ headers: HEADERS, stream });
    expect(r).toEqual({ status: 401, body: { codigo: "NO_AUTORIZADO", error: "no" } });
    expect(read).toBe(false);
  });
});

describe("byId y byFingerprint", () => {
  const seed = { abStatement: [
    { id: "s1", tenant_id_: "T1", contentHash: HASH, status: "queued", verdict: null, reading: null },
    { id: "s2", tenant_id_: "T2", contentHash: "b".repeat(64), status: "queued", verdict: null, reading: null },
  ] };
  const req = (params: Record<string, string>) => ({ headers: { authorization: "Bearer t" }, body: undefined, params });

  it("devuelve el extracto de la empresa, filtrando por ella", async () => {
    const s = setup(seed);
    expect(await s.api.byId(req({ idExtracto: "s1" }))).toEqual({ status: 200, body: { idExtracto: "s1", huella: HASH, estado: "en-proceso", reintentarEn: 5 } });
    expect(s.wheres[0]).toEqual({ id: "s1", tenant_id_: "T1" });
  });
  it("uno de otra empresa da 404, igual que uno inexistente", async () => {
    const s = setup(seed);
    for (const id of ["s2", "nada"]) {
      expect(await s.api.byId(req({ idExtracto: id }))).toEqual({ status: 404, body: { codigo: "NO_ENCONTRADO", error: "No hay ningún extracto con ese identificador en esta empresa." } });
    }
  });
  it("sin id: 400 SIN_IDENTIFICADOR, sin consultar la base", async () => {
    const s = setup(seed);
    expect(await s.api.byId(req({}))).toMatchObject({ status: 400, body: { codigo: "SIN_IDENTIFICADOR" } });
    expect(s.wheres).toEqual([]);
  });
  it("por huella: acepta mayúsculas y filtra por empresa", async () => {
    const s = setup(seed);
    expect((await s.api.byFingerprint(req({ huella: HASH.toUpperCase() }))).status).toBe(200);
    expect(s.wheres[0]).toEqual({ tenant_id_: "T1", contentHash: HASH });
    expect((await s.api.byFingerprint(req({ huella: "b".repeat(64) }))).status).toBe(404);
  });
  it.each(["abc", "g".repeat(64), "a".repeat(65), ""])("una huella mal formada (%s): 400 HUELLA_INVALIDA", async (huella) => {
    const s = setup(seed);
    expect(await s.api.byFingerprint(req({ huella }))).toMatchObject({ status: 400, body: { codigo: "HUELLA_INVALIDA" } });
    expect(s.wheres).toEqual([]);
  });
  it("las consultas no exigen usuario de servicio", async () => {
    const s = setup(seed, { authorize: async () => ({ ok: true, client: { id: "c", name: "n", tenantId: "T1", serviceUserId: null } }) });
    expect((await s.api.byId(req({ idExtracto: "s1" }))).status).toBe(200);
  });
});

describe("el contrato de los errores y de los ámbitos", () => {
  const sinArchivo = () => Readable.from([Buffer.from(`${accountPart("{}")}--${BOUNDARY}--\r\n`)]);
  const sinFilename = () => Readable.from([Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="archivo"\r\n\r\n${FILE}\r\n--${BOUNDARY}--\r\n`)]);
  const dosArchivos = () => Readable.from([Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="archivo"; filename="a"\r\n\r\nA\r\n` +
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="archivo"; filename="b"\r\n\r\nB\r\n--${BOUNDARY}--\r\n`)]);

  it.each([
    ["no es multipart", { ...HEADERS, "content-type": "application/pdf" }, () => Readable.from([FILE]), 415, "ENVIO_NO_MULTIPART", "El extracto se envía como multipart/form-data, con la parte archivo."],
    ["está cortado o trae dos archivos", HEADERS, dosArchivos, 400, "ENVIO_INVALIDO", "El envío no se pudo leer: el cuerpo está cortado o trae más de un archivo."],
    ["no trae archivo", HEADERS, sinArchivo, 400, "FALTA_ARCHIVO", "Falta la parte archivo, o llegó vacía."],
    ["trae el archivo sin filename", HEADERS, sinFilename, 400, "ENVIO_INVALIDO", "La parte archivo tiene que llevar el nombre del archivo (filename)."],
    ["trae una cuenta que no es JSON", HEADERS, () => multipart(FILE, accountPart("{no")), 400, "CUENTA_INVALIDA", "La parte cuenta no es un JSON válido."],
  ] as const)("un envío que %s: %i %s con su mensaje", async (_caso, headers, stream, status, codigo, error) => {
    const s = setup();
    const r = await s.api.receive({ headers, stream: stream() });
    expect(r).toEqual({ status, body: { codigo, error, ...(codigo === "CUENTA_INVALIDA" ? { campo: null } : {}) } });
  });

  it("un archivo demasiado grande: 413 ARCHIVO_DEMASIADO_GRANDE con su mensaje", async () => {
    const s = setup();
    const grande = Buffer.alloc(60 * 1024 * 1024 + 1, 65);
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(grande) });
    expect(r).toEqual({ status: 413, body: { codigo: "ARCHIVO_DEMASIADO_GRANDE", error: "El archivo pesa más de 60 MB." } });
    expect(s.rows.abStatement).toEqual([]);
    expect(s.uploads).toEqual([]);
  });

  it("un archivo de justo 60 MB se acepta", async () => {
    const s = setup();
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(Buffer.alloc(60 * 1024 * 1024, 65)) });
    expect(r.status).toBe(202);
    expect(s.uploads[0].size).toBe(60 * 1024 * 1024);
  });

  it("una cuenta con un campo mal formado: el mensaje del campo", async () => {
    const s = setup();
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE, accountPart('{"saldoFinal":"10"}')) });
    expect(r).toEqual({ status: 400, body: { codigo: "CUENTA_INVALIDA", error: "Un dato de la cuenta no tiene la forma del contrato.", campo: "saldoFinal" } });
  });

  it("el envío exige usuario de servicio: sin él, 403 y no se lee el cuerpo", async () => {
    let read = false;
    const stream = new Readable({ read() { read = true; this.push(null); } });
    const s = setup({}, { authorize: async () => ({ ok: true, client: { id: "c", name: "n", tenantId: "T1", serviceUserId: null } }) });
    expect(await s.api.receive({ headers: HEADERS, stream })).toEqual({
      status: 403, body: { codigo: "SIN_USUARIO_DE_SERVICIO", error: "La integración no tiene un usuario de servicio." },
    });
    expect(read).toBe(false);
  });

  it("el envío y las consultas piden el ámbito ab:leer", async () => {
    const scopes: string[] = [];
    const s = setup({}, { authorize: async (_t, scope) => { scopes.push(scope); return { ok: true, client: { id: "c", name: "n", tenantId: "T1", serviceUserId: "u1" } }; } });
    await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    await s.api.byId({ headers: {}, body: undefined, params: { idExtracto: "x" } });
    await s.api.byFingerprint({ headers: {}, body: undefined, params: { huella: HASH } });
    expect(scopes).toEqual(["ab:leer", "ab:leer", "ab:leer"]);
  });

  it.each([
    ["unauthorized", 401, "NO_AUTORIZADO"],
    ["no-scope", 403, "AMBITO_INSUFICIENTE"],
  ] as const)("las consultas con una credencial rechazada (%s): %i %s, sin consultar la base", async (reason, status, codigo) => {
    const s = setup({}, { authorize: async () => ({ ok: false, reason, message: "no" }) });
    const req = { headers: {}, body: undefined, params: { idExtracto: "x", huella: HASH } };
    expect(await s.api.byId(req)).toEqual({ status, body: { codigo, error: "no" } });
    expect(await s.api.byFingerprint(req)).toEqual({ status, body: { codigo, error: "no" } });
    expect(s.wheres).toEqual([]);
  });

  it("una credencial sin empresa no consulta nada: 403 SIN_EMPRESA", async () => {
    const s = setup({}, { authorize: allow(null) });
    const req = { headers: {}, body: undefined, params: { idExtracto: "x", huella: HASH } };
    expect(await s.api.byId(req)).toMatchObject({ status: 403, body: { codigo: "SIN_EMPRESA" } });
    expect(await s.api.byFingerprint(req)).toMatchObject({ status: 403, body: { codigo: "SIN_EMPRESA" } });
    expect(await s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).toMatchObject({ status: 403, body: { codigo: "SIN_EMPRESA" } });
    expect(s.wheres).toEqual([]);
  });
});

describe("las consultas: mensajes y huella ausente", () => {
  const req = (params: Record<string, string>) => ({ headers: { authorization: "Bearer t" }, body: undefined, params });

  it("sin id: el mensaje de SIN_IDENTIFICADOR", async () => {
    expect(await setup().api.byId(req({}))).toEqual({ status: 400, body: { codigo: "SIN_IDENTIFICADOR", error: "Falta el identificador del extracto." } });
  });
  it("una huella mal formada o ausente: el mensaje de HUELLA_INVALIDA", async () => {
    const esperado = { status: 400, body: { codigo: "HUELLA_INVALIDA", error: "La huella es el SHA-256 del archivo en hexadecimal: 64 caracteres." } };
    expect(await setup().api.byFingerprint(req({ huella: "abc" }))).toEqual(esperado);
    expect(await setup().api.byFingerprint(req({}))).toEqual(esperado);
  });
  it("por huella, uno que no existe: el mensaje de NO_ENCONTRADO", async () => {
    expect(await setup().api.byFingerprint(req({ huella: HASH }))).toEqual({
      status: 404, body: { codigo: "NO_ENCONTRADO", error: "No recibimos ningún extracto con esa huella en esta empresa." },
    });
  });
  it("por huella no exige usuario de servicio", async () => {
    const s = setup(
      { abStatement: [{ id: "s1", tenant_id_: "T1", contentHash: HASH, status: "queued", verdict: null, reading: null }] },
      { authorize: async () => ({ ok: true, client: { id: "c", name: "n", tenantId: "T1", serviceUserId: null } }) },
    );
    expect((await s.api.byFingerprint(req({ huella: HASH }))).status).toBe(200);
  });
  it("un extracto leído se devuelve con su lectura pública, y uno fallido como fallido", async () => {
    const reading = { fingerprint: HASH, verdict: "abstained", reason: "No es un extracto.", header: null, lines: [], warnings: [], checks: null };
    const s = setup({ abStatement: [
      { id: "s1", tenant_id_: "T1", contentHash: HASH, status: "read", verdict: "abstained", reading },
      { id: "s2", tenant_id_: "T1", contentHash: "c".repeat(64), status: "failed", verdict: null, reading: null },
    ] });
    expect(await s.api.byId(req({ idExtracto: "s1" }))).toMatchObject({ status: 200, body: { estado: "leido", lectura: { veredicto: "sin-lectura" } } });
    expect(await s.api.byId(req({ idExtracto: "s2" }))).toEqual({ status: 200, body: { idExtracto: "s2", huella: "c".repeat(64), estado: "fallido" } });
  });
});

describe("receive: lo que se reenvía y las carreras", () => {
  it("un extracto en cola o en proceso con un veredicto de unavailable no se vuelve a leer: solo lo hace uno leído o fallido", async () => {
    const s = setup({ abStatement: [{ id: "s1", tenant_id_: "T1", contentHash: HASH, status: "queued", verdict: "unavailable", reading: null }] });
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r.status).toBe(200);
    expect(s.enqueued).toEqual([]);
    expect(s.rows.abStatement[0].status).toBe("queued");
  });

  it("si otro pedido ya tomó la relectura, la respuesta es el estado actual del extracto de esta empresa y no el de otro", async () => {
    const otro = { id: "x9", tenant_id_: "T2", contentHash: "f".repeat(64), status: "failed", verdict: null, reading: null };
    const s = setup({ abStatement: [otro, { id: "s1", tenant_id_: "T1", contentHash: HASH, status: "failed", verdict: null, reading: null }] });
    const original = s.db.abStatement.updateMany;
    s.db.abStatement.updateMany = async (args: never) => {
      s.rows.abStatement[1].status = "queued";
      return original(args);
    };
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r).toEqual({ status: 200, body: { idExtracto: "s1", huella: HASH, estado: "en-proceso", reintentarEn: 5 } });
    expect(s.wheres.at(-1)).toEqual({ id: "s1", tenant_id_: "T1" });
  });

  it("si otro pedido ya tomó la relectura y el extracto desapareció, se responde con lo que se había leído", async () => {
    const s = setup({ abStatement: [{ id: "s1", tenant_id_: "T1", contentHash: HASH, status: "failed", verdict: null, reading: null }] });
    const original = s.db.abStatement.findFirst;
    let calls = 0;
    s.db.abStatement.findFirst = async (args: never) => (++calls === 1 ? original(args) : null);
    s.db.abStatement.updateMany = async () => ({ count: 0 });
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r).toEqual({ status: 200, body: { idExtracto: "s1", huella: HASH, estado: "fallido" } });
  });

  const carrera = (error: unknown, seed: Parameters<typeof fakeDb>[0] = {}, ganador?: Record<string, unknown>) => {
    const s = setup(seed);
    s.db.abStatement.create = async () => {
      if (ganador) s.rows.abStatement.push(ganador);
      throw error;
    };
    return s;
  };
  const P2002 = Object.assign(new Error("Unique"), { code: "P2002" });

  it("un error que no es de unicidad se propaga aunque exista un extracto con esa huella", async () => {
    const s = carrera(Object.assign(new Error("otro"), { code: "P2000" }), {}, { id: "otro", tenant_id_: "T1", contentHash: HASH, status: "queued", verdict: null, reading: null });
    await expect(s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).rejects.toThrow("otro");
  });

  it("un error sin forma (null) se propaga tal cual", async () => {
    const s = carrera(null);
    await expect(s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).rejects.toBeNull();
  });

  it("una colisión de unicidad sin ganador que encontrar se propaga", async () => {
    const s = carrera(P2002);
    await expect(s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).rejects.toBe(P2002);
  });

  it("en la carrera se devuelve el ganador de esta empresa, no el de otra con la misma huella", async () => {
    const ajeno = { id: "ajeno", tenant_id_: "T2", contentHash: HASH, status: "read", verdict: "verified", reading: null };
    const s = carrera(P2002, { abStatement: [ajeno] }, { id: "otro", tenant_id_: "T1", contentHash: HASH, status: "queued", verdict: null, reading: null });
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r).toEqual({ status: 200, body: { idExtracto: "otro", huella: HASH, estado: "en-proceso", reintentarEn: 5 } });
    expect(s.wheres.at(-1)).toEqual({ tenant_id_: "T1", contentHash: HASH });
  });

  it("el extracto nuevo se crea pidiendo de vuelta solo su id", async () => {
    const s = setup();
    const create = s.db.abStatement.create;
    const selects: unknown[] = [];
    s.db.abStatement.create = async (args: { select?: unknown }) => { selects.push(args.select); return create(args as never); };
    await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(selects).toEqual([{ id: true }]);
  });
});

describe("receive: un extracto en proceso que quedó viejo, y las marcas de cada escritura", () => {
  const MIN = 60 * 1000;
  const ago = (ms: number) => new Date(Date.now() - ms);
  const inProcess = (status: string, over: Record<string, unknown> = {}) =>
    ({ id: "s1", tenant_id_: "T1", contentHash: HASH, status, verdict: null, reading: null, version_: "v0", createdAt_: ago(60 * MIN), readStarts: 2, ...over });

  afterEach(() => jest.restoreAllMocks());

  it.each(["queued", "processing"])("uno %s sin cambios hace 31 minutos se vuelve a leer: 202, una vez", async (status) => {
    const before = ago(31 * MIN);
    const s = setup({ abStatement: [inProcess(status, { lastUpdatedAt_: before })] });
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r).toEqual({ status: 202, body: { idExtracto: "s1", huella: HASH, estado: "en-proceso" } });
    expect(s.wheres[1]).toEqual({ id: "s1", tenant_id_: "T1", status, verdict: null, lastUpdatedAt_: before });
    const row = s.rows.abStatement[0];
    expect(row).toMatchObject({ status: "queued", verdict: null, error: null, readStarts: 2 });
    expect(row.lastUpdatedAt_.getTime()).toBeGreaterThan(before.getTime());
    expect(row.version_).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.enqueued).toEqual([["s1", "u1", "T1"]]);
    const again = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(again.status).toBe(200);
    expect(s.enqueued).toHaveLength(1);
  });

  it.each(["queued", "processing"])("uno %s con cambios hace 10 minutos no: 200, sin encolar", async (status) => {
    const s = setup({ abStatement: [inProcess(status, { lastUpdatedAt_: ago(10 * MIN) })] });
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r).toEqual({ status: 200, body: { idExtracto: "s1", huella: HASH, estado: "en-proceso", reintentarEn: 5 } });
    expect(s.enqueued).toEqual([]);
    expect(s.rows.abStatement[0].status).toBe(status);
  });

  it("el plazo es de más de 30 minutos: a los 30 justos todavía no", async () => {
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(now);
    const justo = setup({ abStatement: [inProcess("queued", { lastUpdatedAt_: new Date(now - 30 * MIN) })] });
    expect((await justo.api.receive({ headers: HEADERS, stream: multipart(FILE) })).status).toBe(200);
    const pasado = setup({ abStatement: [inProcess("queued", { lastUpdatedAt_: new Date(now - 30 * MIN - 1) })] });
    expect((await pasado.api.receive({ headers: HEADERS, stream: multipart(FILE) })).status).toBe(202);
  });

  it("sin lastUpdatedAt_ cuenta el alta: uno creado hace 31 minutos se relee, uno de hace 10 no", async () => {
    const viejo = setup({ abStatement: [inProcess("queued", { lastUpdatedAt_: null, createdAt_: ago(31 * MIN) })] });
    expect((await viejo.api.receive({ headers: HEADERS, stream: multipart(FILE) })).status).toBe(202);
    expect(viejo.wheres[1]).toMatchObject({ lastUpdatedAt_: null });
    const nuevo = setup({ abStatement: [inProcess("queued", { lastUpdatedAt_: null, createdAt_: ago(10 * MIN) })] });
    expect((await nuevo.api.receive({ headers: HEADERS, stream: multipart(FILE) })).status).toBe(200);
  });

  it("si otro pedido cambió el extracto después de leerlo, el reclamo no lo toma", async () => {
    const s = setup({ abStatement: [inProcess("processing", { lastUpdatedAt_: ago(31 * MIN) })] });
    const original = s.db.abStatement.updateMany;
    s.db.abStatement.updateMany = async (args: never) => {
      s.rows.abStatement[0].lastUpdatedAt_ = new Date();
      return original(args);
    };
    const r = await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    expect(r.status).toBe(200);
    expect(s.enqueued).toEqual([]);
  });

  it.each([
    ["failed", null],
    ["read", "unavailable"],
  ])("el reenvío de uno %s/%s vuelve a contar los arranques desde cero", async (status, verdict) => {
    const s = setup({ abStatement: [inProcess(status, { verdict, lastUpdatedAt_: ago(MIN), readStarts: 3 })] });
    expect((await s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).status).toBe(202);
    expect(s.rows.abStatement[0]).toMatchObject({ status: "queued", readStarts: 0 });
  });

  it("un leído con otro veredicto no se relee aunque sea viejo", async () => {
    const s = setup({ abStatement: [inProcess("read", { verdict: "weak", lastUpdatedAt_: ago(120 * MIN), reading: { fingerprint: HASH, verdict: "weak", reason: null, header: null, lines: [], warnings: [], checks: null } })] });
    expect((await s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).status).toBe(200);
    expect(s.enqueued).toEqual([]);
  });

  it("el alta escribe lastUpdatedAt_ igual a createdAt_, y version_", async () => {
    const s = setup();
    await s.api.receive({ headers: HEADERS, stream: multipart(FILE) });
    const row = s.rows.abStatement[0];
    expect(row.lastUpdatedAt_).toBeInstanceOf(Date);
    expect(row.lastUpdatedAt_).toEqual(row.createdAt_);
    expect(row.version_).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("si encolar falla, el failed también deja lastUpdatedAt_ y una version_ nueva", async () => {
    const before = ago(31 * MIN);
    const s = setup({ abStatement: [inProcess("failed", { lastUpdatedAt_: before })] }, { enqueueReading: async () => { throw new Error("cola caída"); } });
    const versions: string[] = [];
    const original = s.db.abStatement.updateMany;
    s.db.abStatement.updateMany = async (args: { data: { version_: string } }) => { versions.push(args.data.version_); return original(args as never); };
    await expect(s.api.receive({ headers: HEADERS, stream: multipart(FILE) })).rejects.toThrow("cola caída");
    const row = s.rows.abStatement[0];
    expect(row.status).toBe("failed");
    expect(row.lastUpdatedAt_.getTime()).toBeGreaterThan(before.getTime());
    expect(versions).toHaveLength(2);
    expect(new Set([...versions, "v0"]).size).toBe(3);
    expect(versions.every((v) => /^[0-9a-f-]{36}$/.test(v))).toBe(true);
  });

  it("las consultas no cambian: un en-proceso viejo se sigue viendo en-proceso", async () => {
    const s = setup({ abStatement: [inProcess("queued", { lastUpdatedAt_: ago(31 * MIN) })] });
    expect(await s.api.byId({ headers: { authorization: "Bearer t" }, body: undefined, params: { idExtracto: "s1" } })).toEqual({
      status: 200, body: { idExtracto: "s1", huella: HASH, estado: "en-proceso", reintentarEn: 5 },
    });
  });
});
