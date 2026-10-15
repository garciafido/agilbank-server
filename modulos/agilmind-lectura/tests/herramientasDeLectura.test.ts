/**
 * Las herramientas con que se lee un documento: si faltó una, no se pudo mirar el archivo; si
 * estaban todas, se lo miró y no había nada. `programaDisponible` solo cuenta como ausente un
 * «no existe»; `herramientasDeLectura` pregunta una vez por proceso.
 *
 * `execFile` se reemplaza por uno que contesta lo que el test le dice, salvo en el último
 * bloque, que lo deja pasar para ver que un programa que no existe falla con el código que el
 * módulo espera.
 */

type Falla = (Error & { code?: string | number }) | null;
type Respuesta = (error: Falla) => void;

const mockLlamadas: Array<{ programa: string; args: string[]; opciones: unknown }> = [];
let mockFallas: Record<string, Falla> = {};
let mockDeVerdad = false;
let mockPaddle = true;
let mockPreguntasAPaddle = 0;

jest.mock("child_process", () => ({
  execFile: (programa: string, args: string[], opciones: unknown, responder: Respuesta) => {
    if (mockDeVerdad) return jest.requireActual("child_process").execFile(programa, args, opciones, responder);
    mockLlamadas.push({ programa, args, opciones });
    responder(mockFallas[programa] ?? null);
  },
}));
jest.mock("../src/paddleOcr", () => ({
  paddleDisponible: async () => {
    mockPreguntasAPaddle++;
    return mockPaddle;
  },
}));

import { programaDisponible } from "../src/herramientasDeLectura";

const falla = (code?: string | number): Falla => Object.assign(new Error("falló"), code === undefined ? {} : { code });

beforeEach(() => {
  mockLlamadas.length = 0;
  mockFallas = {};
  mockDeVerdad = false;
  mockPaddle = true;
  mockPreguntasAPaddle = 0;
});

describe("programaDisponible", () => {
  it("lo corre con sus argumentos y un tope de diez segundos", async () => {
    await programaDisponible("pdftoppm", ["-v"]);
    expect(mockLlamadas).toEqual([{ programa: "pdftoppm", args: ["-v"], opciones: { timeout: 10000 } }]);
  });

  it("está si corrió sin error", async () => {
    expect(await programaDisponible("pdftoppm", ["-v"])).toBe(true);
  });

  it("no está si el sistema dice que no existe", async () => {
    mockFallas = { tesseract: falla("ENOENT") };
    expect(await programaDisponible("tesseract", ["--version"])).toBe(false);
  });

  it("está aunque termine con error: un código de salida raro no lo vuelve ausente", async () => {
    mockFallas = { a: falla(1), b: falla("EACCES"), c: falla(), d: falla("ETIMEDOUT") };
    expect(await programaDisponible("a", [])).toBe(true);
    expect(await programaDisponible("b", [])).toBe(true);
    expect(await programaDisponible("c", [])).toBe(true);
    expect(await programaDisponible("d", [])).toBe(true);
  });
});

describe("herramientasDeLectura", () => {
  const cargar = (): typeof import("../src/herramientasDeLectura") => {
    let modulo!: typeof import("../src/herramientasDeLectura");
    jest.isolateModules(() => {
      modulo = require("../src/herramientasDeLectura");
    });
    return modulo;
  };

  it("pregunta por poppler, tesseract y PP-OCR, cada uno con lo suyo", async () => {
    await cargar().herramientasDeLectura();
    expect(mockLlamadas).toEqual([
      { programa: "pdftoppm", args: ["-v"], opciones: { timeout: 10000 } },
      { programa: "tesseract", args: ["--version"], opciones: { timeout: 10000 } },
    ]);
    expect(mockPreguntasAPaddle).toBe(1);
  });

  it("devuelve cada respuesta en su campo", async () => {
    expect(await cargar().herramientasDeLectura()).toEqual({ poppler: true, tesseract: true, paddle: true });

    mockFallas = { pdftoppm: falla("ENOENT") };
    mockPaddle = false;
    expect(await cargar().herramientasDeLectura()).toEqual({ poppler: false, tesseract: true, paddle: false });

    mockFallas = { tesseract: falla("ENOENT") };
    mockPaddle = true;
    expect(await cargar().herramientasDeLectura()).toEqual({ poppler: true, tesseract: false, paddle: true });
  });

  it("pregunta una sola vez por proceso", async () => {
    const { herramientasDeLectura } = cargar();
    const primera = await herramientasDeLectura();
    mockFallas = { pdftoppm: falla("ENOENT"), tesseract: falla("ENOENT") };
    mockPaddle = false;
    expect(await herramientasDeLectura()).toBe(primera);
    expect(mockLlamadas).toHaveLength(2);
    expect(mockPreguntasAPaddle).toBe(1);
  });
});

describe("contra un proceso de verdad", () => {
  it("node está; un programa que no existe, no", async () => {
    mockDeVerdad = true;
    expect(await programaDisponible(process.execPath, ["-v"])).toBe(true);
    expect(await programaDisponible("programa-que-no-existe-ap", ["-v"])).toBe(false);
  });

  it("un programa que existe y sale con error sigue estando", async () => {
    mockDeVerdad = true;
    expect(await programaDisponible(process.execPath, ["-e", "process.exit(3)"])).toBe(true);
  });
});
