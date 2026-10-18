// Qué detección usa PP-OCR: la de gutenye (la de siempre) o la oficial de PaddleX, por llamada o por
// AP_PADDLE_DETECCION; con qué modelos arma la oficial, y que la falla de una no se confunda con una página vacía.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const linea = (text: string, y: number) => ({ mean: 0.99, text, box: [[10, y], [200, y], [200, y + 20], [10, y + 20]] });

let creadosGutenye = 0;
jest.mock("@gutenye/ocr-node", () => ({
  default: {
    create: async () => {
      creadosGutenye++;
      return { detect: async () => [linea("GUTENYE", 10)] };
    },
  },
}));

const creadosOficiales: Array<Record<string, unknown>> = [];
const llamadasOficiales: Array<{ png: Buffer; opciones: unknown }> = [];
let fallaLaCarga = false;
let fallaLaOrientacion = false;
jest.mock("../src/paddleOficial", () => ({
  deteccionDelPaquete: () => "/paquete/det-v4.onnx",
  modelosDelPaquete: () => ({ deteccion: "/paquete/det-v4.onnx", reconocimiento: "/paquete/rec-ch.onnx", diccionario: "/paquete/keys.txt", orientacion: "/paquete/cls.onnx" }),
  crearMotorOficial: async (modelos: Record<string, unknown>) => {
    if (fallaLaCarga) throw new Error("sin onnx");
    creadosOficiales.push(modelos);
    return {
      detect: async (png: Buffer, opciones: unknown) => {
        llamadasOficiales.push({ png, opciones });
        return [linea("OFICIAL", 10)];
      },
      orientacion: async (png: Buffer, opciones: unknown) => {
        llamadasOficiales.push({ png, opciones });
        if (fallaLaOrientacion) throw new Error("sin cls");
        return { renglones: 12, fraccion: 0.9 };
      },
    };
  },
}));

function carpeta(archivos: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-modelos-"));
  for (const a of archivos) fs.writeFileSync(path.join(dir, a), "x");
  return dir;
}

async function conModulo<T>(fn: (m: typeof import("../src/paddleOcr")) => Promise<T>): Promise<T> {
  let r: T;
  await jest.isolateModulesAsync(async () => {
    r = await fn(await import("../src/paddleOcr"));
  });
  return r!;
}

describe("la detección de PP-OCR", () => {
  let aviso: jest.SpyInstance;
  beforeEach(() => {
    aviso = jest.spyOn(console, "warn").mockImplementation(() => {});
    creadosGutenye = 0;
    creadosOficiales.length = 0;
    llamadasOficiales.length = 0;
    fallaLaCarga = false;
    fallaLaOrientacion = false;
    delete process.env.AP_PADDLE_DETECCION;
    delete process.env.AP_PADDLE_MODELS_DIR;
    delete process.env.AP_PADDLE_OCR;
  });
  afterEach(() => aviso.mockRestore());

  it("sin opción ni variable, la de gutenye: no arma la oficial", async () => {
    const r = await conModulo((m) => m.runPaddleOcr(Buffer.from("png")));
    expect(r?.text).toBe("GUTENYE");
    expect(creadosOficiales).toHaveLength(0);
  });

  it("con { deteccion: \"oficial\" }, la oficial con la página, los parámetros y el pre-proceso del reconocimiento", async () => {
    const png = Buffer.from("png");
    const r = await conModulo((m) => m.runPaddleOcr(png, 1, { deteccion: "oficial", parametros: { lado: 1280 }, reconocimiento: "oficial" }));
    expect(r?.text).toBe("OFICIAL");
    expect(creadosGutenye).toBe(0);
    expect(llamadasOficiales).toEqual([{ png, opciones: { deteccion: { lado: 1280 }, reconocimiento: "oficial" } }]);
  });

  it("sin parámetros, la oficial recibe los suyos por defecto (ninguno pisado) y el reconocimiento oficial", async () => {
    await conModulo((m) => m.runPaddleOcr(Buffer.from("png"), 1, { deteccion: "oficial" }));
    expect(llamadasOficiales[0].opciones).toEqual({ deteccion: {}, reconocimiento: "oficial" });
  });

  it("AP_PADDLE_DETECCION=oficial la elige por defecto, y la opción de la llamada manda sobre la variable", async () => {
    process.env.AP_PADDLE_DETECCION = "oficial";
    const r = await conModulo(async (m) => [await m.runPaddleOcr(Buffer.from("png")), await m.runPaddleOcr(Buffer.from("png"), 1, { deteccion: "gutenye" })]);
    expect(r.map((x) => x?.text)).toEqual(["OFICIAL", "GUTENYE"]);
  });

  it("un valor desconocido en la variable no cambia nada: gutenye", async () => {
    process.env.AP_PADDLE_DETECCION = "otra";
    expect((await conModulo((m) => m.runPaddleOcr(Buffer.from("png"))))?.text).toBe("GUTENYE");
  });

  it("la oficial se arma una sola vez por proceso", async () => {
    await conModulo(async (m) => {
      await m.runPaddleOcr(Buffer.from("a"), 1, { deteccion: "oficial" });
      await m.runPaddleOcr(Buffer.from("b"), 1, { deteccion: "oficial" });
    });
    expect(creadosOficiales).toHaveLength(1);
    expect(llamadasOficiales).toHaveLength(2);
  });

  it("con la carpeta de modelos, el reconocimiento y el diccionario de la carpeta, y su det.onnx si lo trae", async () => {
    const sinDet = carpeta(["rec.onnx", "dict.txt"]);
    process.env.AP_PADDLE_MODELS_DIR = sinDet;
    await conModulo((m) => m.runPaddleOcr(Buffer.from("png"), 1, { deteccion: "oficial" }));
    const conDet = carpeta(["det.onnx", "rec.onnx", "dict.txt"]);
    process.env.AP_PADDLE_MODELS_DIR = conDet;
    await conModulo((m) => m.runPaddleOcr(Buffer.from("png"), 1, { deteccion: "oficial" }));
    expect(creadosOficiales).toEqual([
      { deteccion: "/paquete/det-v4.onnx", reconocimiento: path.join(sinDet, "rec.onnx"), diccionario: path.join(sinDet, "dict.txt"), orientacion: "/paquete/cls.onnx" },
      { deteccion: path.join(conDet, "det.onnx"), reconocimiento: path.join(conDet, "rec.onnx"), diccionario: path.join(conDet, "dict.txt"), orientacion: "/paquete/cls.onnx" },
    ]);
  });

  it("con PP-OCRv5_mobile_det.onnx en la carpeta, la oficial usa esa detección aunque haya det.onnx", async () => {
    const dir = carpeta(["PP-OCRv5_mobile_det.onnx", "det.onnx", "rec.onnx", "dict.txt"]);
    process.env.AP_PADDLE_MODELS_DIR = dir;
    await conModulo((m) => m.runPaddleOcr(Buffer.from("png"), 1, { deteccion: "oficial" }));
    expect(creadosOficiales[0].deteccion).toBe(path.join(dir, "PP-OCRv5_mobile_det.onnx"));
  });

  it("sin carpeta, los tres modelos del paquete, como gutenye", async () => {
    await conModulo((m) => m.runPaddleOcr(Buffer.from("png"), 1, { deteccion: "oficial" }));
    expect(creadosOficiales).toEqual([{ deteccion: "/paquete/det-v4.onnx", reconocimiento: "/paquete/rec-ch.onnx", diccionario: "/paquete/keys.txt", orientacion: "/paquete/cls.onnx" }]);
  });

  it("con AP_PADDLE_OCR=off tampoco corre la oficial", async () => {
    process.env.AP_PADDLE_OCR = "off";
    const r = await conModulo((m) => m.leerConPaddleDetallado(Buffer.from("png"), 1, { deteccion: "oficial" }));
    expect(r).toEqual({ fallo: expect.any(String) });
    expect(creadosOficiales).toHaveLength(0);
  });

  it("si la oficial no carga es una falla, no una página vacía, y se avisa", async () => {
    fallaLaCarga = true;
    const r = await conModulo((m) => m.leerConPaddleDetallado(Buffer.from("png"), 1, { deteccion: "oficial" }));
    expect(r).toEqual({ fallo: expect.any(String) });
    expect(aviso).toHaveBeenCalledWith("[paddleOcr] no disponible:", "sin onnx");
  });

  it("orientacionDePagina vota con la oficial, aunque la lectura sea la de gutenye, y pasa los parámetros", async () => {
    const png = Buffer.from("png");
    const r = await conModulo((m) => m.orientacionDePagina(png, { lado: 640 }));
    expect(r).toEqual({ renglones: 12, fraccion: 0.9 });
    expect(llamadasOficiales).toEqual([{ png, opciones: { deteccion: { lado: 640 } } }]);
    expect(creadosGutenye).toBe(0);
  });

  it("si el voto falla o PP-OCR está apagado, null: la página se lee como vino", async () => {
    fallaLaOrientacion = true;
    expect(await conModulo((m) => m.orientacionDePagina(Buffer.from("png")))).toBeNull();
    expect(aviso).toHaveBeenCalledWith("[paddleOcr] la orientación falló:", "sin cls");
    process.env.AP_PADDLE_OCR = "off";
    expect(await conModulo((m) => m.orientacionDePagina(Buffer.from("png")))).toBeNull();
  });

  it("paddleDisponible mira la detección elegida", async () => {
    fallaLaCarga = true;
    const r = await conModulo(async (m) => [await m.paddleDisponible(), await m.paddleDisponible({ deteccion: "oficial" })]);
    expect(r).toEqual([true, false]);
  });
});
