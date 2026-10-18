/** @jest-environment ./tests/helpers/entornoOnnx.js */
// La E/S de la detección oficial: el post-proceso contra el de PaddleX con un mapa sintético, y el motor
// entero (los modelos ONNX de verdad) sobre una imagen con texto.
import * as fs from "fs";
import * as path from "path";
import { DETECCION_OFICIAL } from "../src/deteccionDeTexto";
import { cajasDelMapa, crearMotorOficial, deteccionDelPaquete } from "../src/paddleOficial";

jest.setTimeout(60_000);

describe("cajasDelMapa", () => {
  // Generado con DBPostProcess.boxes_from_bitmap de PaddleX 3.0 (opencv 4.10, pyclipper): renglones,
  // dos en la misma franja, uno inclinado, uno diminuto, dos con puntaje bajo y una zona en el umbral exacto.
  const fix = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "mapa-de-deteccion.json"), "utf8"));
  const mapa = new Float32Array(fix.mapa);
  const casos: Array<[number, number, number, number[][][]]> = fix.casos.map((c: any) => [c.thresh, c.boxThresh, c.unclipRatio, c.cajas]);
  it.each(casos)(
    "thresh %d, box_thresh %d, unclip %d: las mismas cajas que PaddleX",
    async (thresh, boxThresh, unclipRatio, cajas) => {
      const op = { ...DETECCION_OFICIAL, thresh, boxThresh, unclipRatio };
      expect(await cajasDelMapa(mapa, fix.ancho, fix.alto, fix.destW, fix.destH, op)).toEqual(cajas);
    },
  );
  it("max_candidates corta los contornos que se miran", async () => {
    const op = { ...DETECCION_OFICIAL, thresh: 0.03, boxThresh: 0, maxCandidates: 3 };
    expect((await cajasDelMapa(mapa, fix.ancho, fix.alto, fix.destW, fix.destH, op)).length).toBeLessThanOrEqual(3);
  });
  it("un mapa vacío no da cajas", async () => {
    expect(await cajasDelMapa(new Float32Array(32 * 32), 32, 32, 64, 64, DETECCION_OFICIAL)).toEqual([]);
  });
});

describe("deteccionDelPaquete", () => {
  it("es el det v4 que trae @gutenye/ocr-models, y existe", () => {
    expect(path.basename(deteccionDelPaquete())).toBe("ch_PP-OCRv4_det_infer.onnx");
    expect(fs.existsSync(deteccionDelPaquete())).toBe(true);
  });
});

describe("crearMotorOficial", () => {
  const latinos = path.join(__dirname, "..", "modelos", "paddle-latin-v5");
  async function png(): Promise<Buffer> {
    const sharp = require("sharp");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="260">
      <rect width="100%" height="100%" fill="white"/>
      <text x="40" y="80" font-family="Helvetica, Arial, sans-serif" font-size="44" fill="black">FACTURA 0003-00012345</text>
      <text x="40" y="140" font-family="Helvetica, Arial, sans-serif" font-size="44" fill="black">TOTAL 1234,56</text>
      <text x="40" y="200" font-family="Helvetica, Arial, sans-serif" font-size="44" fill="black">IVA 21%</text>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  it("lee los tres renglones, cada uno en su línea, con los dos pre-procesos del reconocimiento", async () => {
    const motor = await crearMotorOficial(
      { deteccion: deteccionDelPaquete(), reconocimiento: path.join(latinos, "rec.onnx"), diccionario: path.join(latinos, "dict.txt") },
      { logSeverityLevel: 3 },
    );
    const imagen = await png();
    for (const reconocimiento of ["gutenye", "oficial"] as const) {
      const lineas = await motor.detect(imagen, { reconocimiento });
      expect(lineas.map((l) => l.text.replace(/\s+/g, ""))).toEqual(["FACTURA0003-00012345", "TOTAL1234,56", "IVA21%"]);
      for (const l of lineas) {
        expect(l.mean).toBeGreaterThan(0.9);
        expect(l.box).toHaveLength(4);
        // las cajas hablan en píxeles de la imagen original, no de la reducida a 960
        expect(Math.max(...l.box.map((p) => p[0]))).toBeLessThanOrEqual(900);
      }
      expect(lineas[2].box[0][1]).toBeGreaterThan(150);
    }
  });

  it("la orientación: los renglones de una página derecha votan 0°, los de la misma girada, 180°", async () => {
    const delPaquete = require("../src/paddleOficial").modelosDelPaquete();
    const motor = await crearMotorOficial(
      { deteccion: deteccionDelPaquete(), reconocimiento: path.join(latinos, "rec.onnx"), diccionario: path.join(latinos, "dict.txt"), orientacion: delPaquete.orientacion },
      { logSeverityLevel: 3 },
    );
    const derecha = await png();
    const girada = await require("sharp")(derecha).rotate(180).png().toBuffer();
    const a = await motor.orientacion(derecha);
    const b = await motor.orientacion(girada);
    expect(a.renglones).toBe(3);
    expect(b.renglones).toBe(3);
    expect(a.fraccion).toBeLessThan(0.5);
    expect(b.fraccion).toBeGreaterThan(0.5);
  });

  it("sin el modelo de orientación, orientacion() falla con su motivo", async () => {
    const motor = await crearMotorOficial(
      { deteccion: deteccionDelPaquete(), reconocimiento: path.join(latinos, "rec.onnx"), diccionario: path.join(latinos, "dict.txt") },
      { logSeverityLevel: 3 },
    );
    await expect(motor.orientacion(await png())).rejects.toThrow("orientación");
  });

  it("los parámetros de la detección viajan en la llamada", async () => {
    const motor = await crearMotorOficial(
      { deteccion: deteccionDelPaquete(), reconocimiento: path.join(latinos, "rec.onnx"), diccionario: path.join(latinos, "dict.txt") },
      { logSeverityLevel: 3 },
    );
    // con box_thresh 1 ninguna caja alcanza
    expect(await motor.detect(await png(), { deteccion: { boxThresh: 1 } })).toEqual([]);
  });
});
