// El PDF con el índice roto: el archivo está entero y lo que falta es la tabla de objetos.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PDFDocument } from "pdf-lib";
import { conIndiceReconstruido, pdfReparado } from "../src/pdfReparado";
import { pdfDe } from "./helpers/pdfSintetico";

const ROTO = "/Volumes/Warehouse/agilerp-datasets/set-pruebas-v1/marcalba/pdf/marcalba-00518.pdf";
const hay = fs.existsSync(ROTO);

describe("el PDF con el índice roto", () => {
  (hay ? it : it.skip)("se reconstruye y queda legible (marcalba-00518)", async () => {
    const reparado = await pdfReparado(fs.readFileSync(ROTO));
    expect(reparado).not.toBeNull();
    expect(reparado!.subarray(0, 5).toString()).toBe("%PDF-");
    expect(reparado!.length).toBeGreaterThan(1000);
  });

  it("lo que no es un PDF no se repara: se dice que no", async () => {
    expect(await pdfReparado(Buffer.alloc(0))).toBeNull();
    expect(await pdfReparado(Buffer.from("esto no es un pdf, son bytes cualesquiera"))).toBeNull();
    expect(await pdfReparado(Buffer.from([0x0a, 0xf3, 0x05, 0x00, 0x54, 0x01]))).toBeNull();
  });
});

const paginasDe = async (pdf: Buffer): Promise<number> => (await PDFDocument.load(pdf, { ignoreEncryption: true })).getPageCount();

describe("pdfReparado: reescribe el mismo documento con su índice bien puesto", () => {
  it("un PDF con la tabla de referencias corrida se vuelve a armar entero", async () => {
    // El generador calculó los offsets sobre otro tamaño: todos corridos 40 bytes.
    const sano = pdfDe(3).toString("latin1");
    const corrido = sano.replace(/(\d{10}) 00000 n/g, (_, o) => `${String(Number(o) + 40).padStart(10, "0")} 00000 n`);
    expect(corrido).not.toBe(sano);

    const reparado = await pdfReparado(Buffer.from(corrido, "latin1"));
    expect(reparado).not.toBeNull();
    expect(reparado!.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await paginasDe(reparado!)).toBe(3);
  });

  it("un PDF protegido contra impresión se lee igual: rechazarlo sería perder el comprobante", async () => {
    const reparado = await pdfReparado(pdfDe(2, { cifrado: true }));
    expect(reparado).not.toBeNull();
    expect(await paginasDe(reparado!)).toBe(2);
  });

  it("una cabecera corrida un byte sigue siendo la cabecera", async () => {
    const reparado = await pdfReparado(Buffer.concat([Buffer.from("\n"), pdfDe(2)]));
    expect(reparado).not.toBeNull();
    expect(await paginasDe(reparado!)).toBe(2);
  });
});

describe("pdfReparado: cuándo dice que no", () => {
  it("un PDF sin ninguna página no tiene nada que reparar", async () => {
    expect(await pdfReparado(pdfDe(0))).toBeNull();
  });

  it("la cabecera tiene que estar en el primer kilobyte: más allá, es otro tipo de archivo", async () => {
    const basura = Buffer.alloc(1100, 0x20);
    expect(await pdfReparado(Buffer.concat([basura, pdfDe(2)]))).toBeNull();
    // Y un kilobyte justo antes de la cabecera todavía la deja adentro.
    const casi = Buffer.concat([Buffer.alloc(1020, 0x20), pdfDe(2)]);
    expect(await pdfReparado(casi)).not.toBeNull();
  });

  it("una cabecera sin documento atrás no se puede cargar", async () => {
    const solaCabecera = Buffer.from("%PDF-1.4\n" + "basura que no son objetos ".repeat(8));
    expect(await pdfReparado(solaCabecera)).toBeNull();
  });
});

describe("conIndiceReconstruido", () => {
  let dir: string;
  let pdfPath: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-reparado-"));
    pdfPath = path.join(dir, "in.pdf");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const sirveSiNoEsMal = (r: string) => r !== "mal";
  /** Un `correr` que contesta, en orden, lo que se le da: un `Error` es un rechazo. */
  const contestando = (...respuestas: Array<string | Error>) => {
    let llamadas = 0;
    return jest.fn(async (): Promise<string> => {
      const r = respuestas[Math.min(llamadas++, respuestas.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    });
  };

  it("si la primera lectura sirve, no toca nada", async () => {
    const correr = contestando("bien");
    expect(await conIndiceReconstruido(pdfPath, pdfDe(1), correr, sirveSiNoEsMal)).toBe("bien");
    expect(correr).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(pdfPath)).toBe(false);
  });

  it("si la primera no sirve, reescribe el archivo con el índice reconstruido y lee de nuevo", async () => {
    let visto: Buffer | null = null;
    let llamadas = 0;
    const correr = jest.fn(async (): Promise<string> => {
      if (++llamadas === 1) return "mal";
      visto = fs.readFileSync(pdfPath);
      return "bien";
    });
    expect(await conIndiceReconstruido(pdfPath, pdfDe(2), correr, sirveSiNoEsMal)).toBe("bien");
    expect(correr).toHaveBeenCalledTimes(2);
    expect(visto!.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await paginasDe(visto!)).toBe(2);
  });

  it("si la primera lectura revienta, también reintenta", async () => {
    // `sirve` acepta todo menos «mal»: una primera que reventó no puede pasar por buena.
    const correr = contestando(new Error("poppler"), "bien");
    expect(await conIndiceReconstruido(pdfPath, pdfDe(1), correr, sirveSiNoEsMal)).toBe("bien");
    expect(correr).toHaveBeenCalledTimes(2);
  });

  it("si el reintento no sirve, se queda con la primera", async () => {
    expect(await conIndiceReconstruido(pdfPath, pdfDe(1), contestando("mal", "mal"), sirveSiNoEsMal)).toBe("mal");
    expect(await conIndiceReconstruido(pdfPath, pdfDe(1), contestando("mal", "bien"), (r) => r === "bien")).toBe("bien");
  });

  it("si el reintento revienta, se queda con la primera", async () => {
    const correr = contestando("mal", new Error("poppler"));
    expect(await conIndiceReconstruido(pdfPath, pdfDe(1), correr, sirveSiNoEsMal)).toBe("mal");
  });

  it("si la primera revienta y la segunda también, no hay resultado", async () => {
    const correr = contestando(new Error("uno"), new Error("dos"));
    expect(await conIndiceReconstruido(pdfPath, pdfDe(1), correr, () => true)).toBeNull();
  });

  it("si el archivo no es un PDF no hay nada que reconstruir: devuelve lo que leyó", async () => {
    const correr = contestando("mal", "bien");
    const noEsPdf = Buffer.from("esto no es un pdf, son bytes cualesquiera");
    expect(await conIndiceReconstruido(pdfPath, noEsPdf, correr, sirveSiNoEsMal)).toBe("mal");
    expect(correr).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(pdfPath)).toBe(false);
  });
});
