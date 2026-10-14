import { Readable } from "stream";
import { parseAccount, readUpload, type UploadRequest } from "../../src/api/multipart";

const BOUNDARY = "----limite";
type Part = { name: string; value: string | Buffer; filename?: string; type?: string };

/** Un cuerpo multipart armado a mano, como lo manda un cliente. */
const body = (parts: Part[]): Buffer =>
  Buffer.concat([
    ...parts.flatMap((p) => [
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${p.name}"` +
          (p.filename !== undefined ? `; filename="${p.filename}"` : "") +
          `\r\n` + (p.type ? `Content-Type: ${p.type}\r\n` : "") + `\r\n`,
      ),
      Buffer.isBuffer(p.value) ? p.value : Buffer.from(p.value),
      Buffer.from("\r\n"),
    ]),
    Buffer.from(`--${BOUNDARY}--\r\n`),
  ]);

const request = (bytes: Buffer, type = `multipart/form-data; boundary=${BOUNDARY}`): UploadRequest => ({
  headers: { "content-type": type },
  stream: Readable.from([bytes]),
});

const FILE = Buffer.from("Fecha;Concepto;Importe;Saldo\n01/07/2026;Transf;100,00;1.100,00\n");

describe("readUpload", () => {
  it("lee el archivo, su nombre, su tipo y la cuenta", async () => {
    const r = await readUpload(request(body([
      { name: "archivo", value: FILE, filename: "julio.csv", type: "text/csv" },
      { name: "cuenta", value: '{"cbu":"1910001800005555555555"}' },
    ])));
    expect(r).toEqual({ ok: true, upload: { file: FILE, fileName: "julio.csv", mimeType: "text/csv", account: { cbu: "1910001800005555555555" } } });
  });

  it("la parte nombre pisa el nombre del archivo; sin cuenta, account es undefined", async () => {
    const r = await readUpload(request(body([
      { name: "nombre", value: "  Extracto julio.csv " },
      { name: "archivo", value: FILE, filename: "x.csv" },
    ])));
    expect(r.ok && r.upload.fileName).toBe("Extracto julio.csv");
    expect(r.ok && r.upload.account).toBeUndefined();
  });

  it("la cuenta antes o después del archivo da lo mismo", async () => {
    const cuenta = { name: "cuenta", value: '{"moneda":"Pesos"}' };
    const archivo = { name: "archivo", value: FILE, filename: "a.csv" };
    const antes = await readUpload(request(body([cuenta, archivo])));
    const despues = await readUpload(request(body([archivo, cuenta])));
    expect(antes).toEqual(despues);
    expect(antes.ok && antes.upload.account).toEqual({ moneda: "Pesos" });
  });

  it("sin nombre en ningún lado, el archivo se llama extracto; sin tipo, application/octet-stream", async () => {
    const r = await readUpload(request(body([{ name: "archivo", value: FILE, filename: "" }])));
    expect(r.ok && r.upload.fileName).toBe("extracto");
    expect(r.ok && r.upload.mimeType).toBe("application/octet-stream");
  });

  it("un cuerpo que no es multipart: not-multipart (también urlencoded y sin encabezado)", async () => {
    expect(await readUpload(request(FILE, "application/octet-stream"))).toEqual({ ok: false, problem: "not-multipart" });
    expect(await readUpload(request(FILE, "application/x-www-form-urlencoded"))).toEqual({ ok: false, problem: "not-multipart" });
    expect(await readUpload({ headers: {}, stream: Readable.from([FILE]) })).toEqual({ ok: false, problem: "not-multipart" });
  });

  it("sin la parte archivo, o con un archivo de cero bytes: missing-file", async () => {
    expect(await readUpload(request(body([{ name: "cuenta", value: "{}" }])))).toEqual({ ok: false, problem: "missing-file" });
    expect(await readUpload(request(body([{ name: "archivo", value: Buffer.alloc(0), filename: "v.csv" }])))).toEqual({ ok: false, problem: "missing-file" });
  });

  it("un archivo que pasa el tope: too-large", async () => {
    const r = await readUpload(request(body([{ name: "archivo", value: Buffer.alloc(11, 65), filename: "g.csv" }])), 10);
    expect(r).toEqual({ ok: false, problem: "too-large" });
  });

  it("un archivo justo en el tope se acepta", async () => {
    const r = await readUpload(request(body([{ name: "archivo", value: Buffer.alloc(10, 65), filename: "g.csv" }])), 10);
    expect(r.ok && r.upload.file.length).toBe(10);
  });

  it("dos partes archivo: invalid", async () => {
    const r = await readUpload(request(body([
      { name: "archivo", value: FILE, filename: "a.csv" },
      { name: "archivo", value: FILE, filename: "b.csv" },
    ])));
    expect(r).toEqual({ ok: false, problem: "invalid" });
  });

  it("una cuenta que no es JSON: invalid-account-json", async () => {
    const r = await readUpload(request(body([{ name: "archivo", value: FILE, filename: "a.csv" }, { name: "cuenta", value: "{no" }])));
    expect(r).toEqual({ ok: false, problem: "invalid-account-json" });
  });

  it("un cuerpo multipart cortado a la mitad: invalid", async () => {
    const entero = body([{ name: "archivo", value: FILE, filename: "a.csv" }]);
    expect(await readUpload(request(entero.subarray(0, entero.length - 20)))).toEqual({ ok: false, problem: "invalid" });
  });

  it("una conexión que se corta: invalid", async () => {
    const stream = new Readable({ read() { this.destroy(new Error("ECONNRESET")); } });
    expect(await readUpload({ headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` }, stream })).toEqual({ ok: false, problem: "invalid" });
  });

  it("un nombre con tildes llega entero", async () => {
    const r = await readUpload(request(body([{ name: "archivo", value: FILE, filename: "extracto-año.csv" }])));
    expect(r.ok && r.upload.fileName).toBe("extracto-año.csv");
  });
});

describe("readUpload: formas de las partes", () => {
  const archivo = { name: "archivo", value: FILE, filename: "a.csv" };
  const JSON_TYPE = `multipart/form-data; boundary=${BOUNDARY}`;

  it("multipart sin boundary: not-multipart", async () => {
    expect(await readUpload(request(FILE, "multipart/form-data"))).toEqual({ ok: false, problem: "not-multipart" });
  });

  it("archivo como campo de texto (sin nombre de archivo ni tipo): se toma como archivo", async () => {
    const r = await readUpload(request(body([{ name: "archivo", value: "a;b\n1;2\n" }])));
    expect(r).toEqual({ ok: true, upload: { file: Buffer.from("a;b\n1;2\n"), fileName: "extracto", mimeType: "application/octet-stream", account: undefined } });
  });

  it("archivo como campo de texto de más de 64 KB: invalid, no un archivo cortado", async () => {
    const r = await readUpload(request(body([{ name: "archivo", value: "x".repeat(64 * 1024 + 1) }])));
    expect(r).toEqual({ ok: false, problem: "invalid" });
  });

  it("un archivo binario sin nombre de archivo (octet-stream): se llama extracto y conserva el tipo", async () => {
    const r = await readUpload(request(body([{ name: "archivo", value: FILE, type: "application/octet-stream" }])));
    expect(r.ok && [r.upload.fileName, r.upload.mimeType, r.upload.file.equals(FILE)]).toEqual(["extracto", "application/octet-stream", true]);
  });

  it.each([
    ["dos campos archivo", [{ name: "archivo", value: "uno" }, { name: "archivo", value: "dos" }]],
    ["un campo archivo y después un archivo", [{ name: "archivo", value: "uno" }, archivo]],
    ["un archivo y después un campo archivo", [archivo, { name: "archivo", value: "dos" }]],
  ] as Array<[string, Part[]]>)("%s: invalid", async (_caso, parts) => {
    expect(await readUpload(request(body(parts)))).toEqual({ ok: false, problem: "invalid" });
  });

  it("un archivo con otro nombre de parte se ignora; sin parte archivo es missing-file", async () => {
    expect(await readUpload(request(body([{ name: "adjunto", value: FILE, filename: "a.csv", type: "text/csv" }])))).toEqual({ ok: false, problem: "missing-file" });
  });

  it("un archivo con otro nombre de parte no se confunde con el archivo", async () => {
    const r = await readUpload(request(body([
      { name: "adjunto", value: Buffer.from("otro"), filename: "otro.csv", type: "text/csv" },
      { name: "archivo", value: "el extracto" },
    ])));
    expect(r.ok && r.upload.file.toString()).toBe("el extracto");
    expect(r.ok && r.upload.fileName).toBe("extracto");
  });

  it("una cuenta de más de 64 KB: invalid-account-json aunque lo que entró sea un JSON completo", async () => {
    const cuenta = `{"banco":"X"}${" ".repeat(64 * 1024)}`;
    expect(await readUpload(request(body([archivo, { name: "cuenta", value: cuenta }])))).toEqual({ ok: false, problem: "invalid-account-json" });
  });

  it("el nombre del archivo pierde la carpeta y los espacios de los extremos", async () => {
    const r = await readUpload(request(body([{ name: "archivo", value: FILE, filename: "../../etc/ extracto.csv " }])));
    expect(r.ok && r.upload.fileName).toBe("extracto.csv");
  });

  it("un nombre solo de espacios cae a extracto", async () => {
    const r = await readUpload(request(body([{ name: "archivo", value: FILE, filename: "   " }])));
    expect(r.ok && r.upload.fileName).toBe("extracto");
  });

  it("un cuerpo mucho más grande que el tope: too-large", async () => {
    const r = await readUpload(request(body([{ name: "archivo", value: Buffer.alloc(3 * 1024 * 1024, 65), filename: "g.csv" }])), 10);
    expect(r).toEqual({ ok: false, problem: "too-large" });
  });

  it("la parte nombre vacía no pisa el nombre del archivo", async () => {
    const r = await readUpload(request(body([{ name: "nombre", value: "   " }, archivo])));
    expect(r.ok && r.upload.fileName).toBe("a.csv");
  });

  it("el tipo del archivo es el que declara la parte", async () => {
    const r = await readUpload({ headers: { "content-type": JSON_TYPE }, stream: Readable.from([body([{ ...archivo, type: "application/vnd.ms-excel" }])]) });
    expect(r.ok && r.upload.mimeType).toBe("application/vnd.ms-excel");
  });
});

describe("parseAccount", () => {
  it("sin cuenta: ok sin cuenta", () => {
    expect(parseAccount(undefined)).toEqual({ ok: true, account: undefined });
  });
  it("traduce las claves del contrato a las del motor", () => {
    expect(parseAccount({
      banco: "BANCO X", numero: "CC 191-1", cbu: "1910001800005555555555", moneda: "Pesos",
      periodoDesde: "2026-07-01", periodoHasta: "2026-07-31", saldoInicial: 1250432.15, saldoFinal: 980432.1, otra: "se ignora",
    })).toEqual({ ok: true, account: {
      bank: "BANCO X", number: "CC 191-1", cbu: "1910001800005555555555", currency: "Pesos",
      periodFrom: "2026-07-01", periodTo: "2026-07-31", openingBalance: 1250432.15, closingBalance: 980432.1,
    } });
  });
  it("los null se aceptan y no se copian", () => {
    expect(parseAccount({ banco: null, saldoInicial: null })).toEqual({ ok: true, account: {} });
  });
  it("lo que no es un objeto: campo null", () => {
    for (const raw of [null, 3, "x", [1]]) expect(parseAccount(raw)).toEqual({ ok: false, field: null });
  });
  it.each([
    ["banco", 3], ["numero", {}], ["cbu", 12], ["moneda", true], ["banco", "x".repeat(201)],
    ["periodoDesde", "01/07/2026"], ["periodoHasta", "2026-02-30"], ["periodoDesde", 20260701],
    ["saldoInicial", "100"], ["saldoFinal", Number.POSITIVE_INFINITY], ["saldoFinal", Number.NaN],
  ])("%s inválido: devuelve el campo", (field, value) => {
    expect(parseAccount({ [field]: value })).toEqual({ ok: false, field });
  });
  it("un texto de 200 caracteres se acepta", () => {
    expect(parseAccount({ banco: "x".repeat(200) })).toEqual({ ok: true, account: { bank: "x".repeat(200) } });
  });
  it("las fechas y los importes en null se aceptan y no se copian", () => {
    expect(parseAccount({ periodoDesde: null, periodoHasta: null, saldoFinal: null })).toEqual({ ok: true, account: {} });
  });
  it.each([
    ["x2026-07-01"], ["2026-07-01x"], ["2026-07-01 "], ["2026-7-1"], [["2026-07-01"]],
  ])("una fecha que no es exactamente AAAA-MM-DD (%p): devuelve el campo", (value) => {
    expect(parseAccount({ periodoDesde: value })).toEqual({ ok: false, field: "periodoDesde" });
  });
});
