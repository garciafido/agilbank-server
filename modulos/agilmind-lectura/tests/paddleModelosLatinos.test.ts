// La carpeta de modelos de PP-OCR: el reconocimiento y el diccionario propios, y la detección
// del paquete cuando la carpeta no trae la suya.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const creados: Array<Record<string, unknown>> = [];
jest.mock("@gutenye/ocr-node", () => ({
  default: {
    create: async (opciones: Record<string, unknown>) => {
      creados.push(opciones);
      return { detect: async () => [] };
    },
  },
}));

function carpeta(archivos: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-modelos-"));
  for (const a of archivos) fs.writeFileSync(path.join(dir, a), "x");
  return dir;
}

async function motorCon(dir: string): Promise<Record<string, unknown>> {
  process.env.AP_PADDLE_MODELS_DIR = dir;
  creados.length = 0;
  const aviso = jest.spyOn(console, "warn").mockImplementation(() => {});
  await jest.isolateModulesAsync(async () => {
    const { runPaddleOcr } = await import("../src/paddleOcr");
    await runPaddleOcr(Buffer.from("png"));
  });
  aviso.mockRestore();
  delete process.env.AP_PADDLE_MODELS_DIR;
  return (creados[0].models ?? {}) as Record<string, unknown>;
}

describe("los modelos de PP-OCR", () => {
  it("sin det.onnx en la carpeta, la detección es la del paquete", async () => {
    const dir = carpeta(["rec.onnx", "dict.txt"]);
    const modelos = await motorCon(dir);
    expect(modelos.detectionPath).toBeUndefined();
    expect(modelos.recognitionPath).toBe(path.join(dir, "rec.onnx"));
    expect(modelos.dictionaryPath).toBe(path.join(dir, "dict.txt"));
  });

  it("con det.onnx en la carpeta, usa esa", async () => {
    const dir = carpeta(["det.onnx", "rec.onnx", "dict.txt"]);
    expect((await motorCon(dir)).detectionPath).toBe(path.join(dir, "det.onnx"));
  });

  it("la detección v5 de la carpeta es de la oficial: gutenye sigue con la del paquete", async () => {
    const dir = carpeta(["PP-OCRv5_mobile_det.onnx", "rec.onnx", "dict.txt"]);
    expect((await motorCon(dir)).detectionPath).toBeUndefined();
  });

  it("la carpeta del motor trae la detección PP-OCRv5 mobile convertida, la del sha256 del LEEME", () => {
    const archivo = path.join(__dirname, "..", "modelos", "paddle-latin-v5", "PP-OCRv5_mobile_det.onnx");
    const sha = require("crypto").createHash("sha256").update(fs.readFileSync(archivo)).digest("hex");
    expect(sha).toBe("d7fe3ea74652890722c0f4d02458b7261d9f5ae6c92904d05707c9eb155c7924");
  });

  it("la carpeta del motor trae el reconocimiento latino y su diccionario", () => {
    const dir = path.join(__dirname, "..", "modelos", "paddle-latin-v5");
    expect(fs.existsSync(path.join(dir, "rec.onnx"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "dict.txt"))).toBe(true);
  });
});
