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

  it("la carpeta del motor trae el reconocimiento latino y su diccionario", () => {
    const dir = path.join(__dirname, "..", "modelos", "paddle-latin-v5");
    expect(fs.existsSync(path.join(dir, "rec.onnx"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "dict.txt"))).toBe(true);
  });
});
