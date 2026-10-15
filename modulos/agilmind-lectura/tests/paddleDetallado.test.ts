// La lectura detallada separa lo que runPaddleOcr junta en null: una página sin texto y una falla.
let detectar: () => Promise<unknown> = async () => [];
jest.mock("@gutenye/ocr-node", () => ({
  default: { create: async () => ({ detect: () => detectar() }) },
}));

import { leerConPaddleDetallado, runPaddleOcr } from "../src/paddleOcr";
import * as lectura from "../src/index";

const linea = (text: string, x: number, y: number) => ({ mean: 0.99, text, box: [[x, y], [x + 100, y], [x + 100, y + 20], [x, y + 20]] });

describe("leerConPaddleDetallado", () => {
  let aviso: jest.SpyInstance;
  beforeEach(() => {
    aviso = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => aviso.mockRestore());

  it("con texto, las palabras: lo mismo que runPaddleOcr", async () => {
    detectar = async () => [linea("FECHA IMPORTE", 10, 10)];
    const r = await leerConPaddleDetallado(Buffer.from("png"));
    expect(r).toEqual({ palabras: await runPaddleOcr(Buffer.from("png")) });
    expect("palabras" in r && r.palabras.text).toContain("FECHA");
  });

  it("sin cajas, la página está vacía: no es una falla", async () => {
    detectar = async () => [];
    expect(await leerConPaddleDetallado(Buffer.from("png"))).toEqual({ vacia: true });
  });

  it("con cajas sin texto, también vacía", async () => {
    detectar = async () => [linea("   ", 10, 10)];
    expect(await leerConPaddleDetallado(Buffer.from("png"))).toEqual({ vacia: true });
  });

  it("si el runtime lanza, una falla con su motivo, aunque lo lanzado no sea un Error", async () => {
    detectar = async () => {
      throw new Error("sin memoria");
    };
    expect(await leerConPaddleDetallado(Buffer.from("png"))).toEqual({ fallo: "sin memoria" });
    detectar = async () => {
      throw "código 137";
    };
    expect(await leerConPaddleDetallado(Buffer.from("png"))).toEqual({ fallo: "código 137" });
  });

  it("si detect() no devuelve la lista de líneas, una falla: la versión no es la fijada", async () => {
    detectar = async () => ({ texts: [] });
    expect(await leerConPaddleDetallado(Buffer.from("png"))).toEqual({ fallo: expect.stringMatching(/versión/) });
  });

  it("runPaddleOcr sigue dando null en los dos casos", async () => {
    detectar = async () => [];
    expect(await runPaddleOcr(Buffer.from("png"))).toBeNull();
    detectar = async () => {
      throw new Error("sin memoria");
    };
    expect(await runPaddleOcr(Buffer.from("png"))).toBeNull();
  });

  it("comparte el turno con runPaddleOcr: de a una página por proceso", async () => {
    let enCurso = 0;
    let maximo = 0;
    detectar = async () => {
      enCurso++;
      maximo = Math.max(maximo, enCurso);
      await new Promise((r) => setTimeout(r, 20));
      enCurso--;
      return [];
    };
    await Promise.all([leerConPaddleDetallado(Buffer.from("a")), runPaddleOcr(Buffer.from("b")), leerConPaddleDetallado(Buffer.from("c"))]);
    expect(maximo).toBe(1);
  });

  it("el paquete la publica", () => {
    expect(lectura.leerConPaddleDetallado).toBe(leerConPaddleDetallado);
  });
});

describe("leerConPaddleDetallado sin PP-OCR", () => {
  it("apagado, una falla: no se pudo mirar", async () => {
    jest.resetModules();
    process.env.AP_PADDLE_OCR = "off";
    try {
      const { leerConPaddleDetallado: leer } = await import("../src/paddleOcr");
      expect(await leer(Buffer.from("png"))).toEqual({ fallo: "PP-OCR no está disponible en este proceso." });
    } finally {
      delete process.env.AP_PADDLE_OCR;
    }
  });
});
