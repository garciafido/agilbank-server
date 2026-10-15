/**
 * Motor OCR alternativo: PP-OCR (PaddleOCR) sobre ONNX, en proceso.
 * Muy superior a tesseract en FOTOS (térmicos, perspectiva, fondos ruidosos);
 * tesseract sigue primero para renders de PDF (rápido y probado). Compite en
 * las variantes de extractFromImage con el mismo juez: campos localizados.
 *
 * ── Por qué existe `overrides.onnxruntime-node` ──
 *
 * `@gutenye/ocr-node` pide `onnxruntime-node: ^1.17.3-rev.1`, así que sin pin npm
 * resuelve la más alta. Las releases nuevas dejaron de publicar el binario de
 * darwin/x64, y sin él el motor no carga en un Mac con Intel. De ahí el override
 * fijado en 1.21.0.
 *
 * Va en el package.json de ESTE módulo Y en el de cada producto que lo consume:
 * npm aplica los overrides de la RAÍZ del install, y el módulo entra como
 * dependencia `file:`, así que el suyo no gobierna al producto. El del producto lo
 * emite el generador (`package.json.ts`) — no se edita a mano.
 *
 * Se comprueba en un paso: con el pin aplicado existe
 * `node_modules/onnxruntime-node/bin/napi-v3/darwin/x64`. Para subir el pin, la
 * condición es que esa ruta siga existiendo en la versión nueva.
 *
 * ── Por qué `@gutenye/ocr-node` y `@gutenye/ocr-common` van fijos en 1.4.8 ──
 *
 * `ocr-common` 1.4.9 cambió en un patch lo que devuelve `detect()`: antes la lista
 * de líneas, ahora `{ texts, resizedImageWidth, resizedImageHeight }`. Esa forma no
 * se lee: `runPaddleOcr` la reconoce y avisa que la versión no es la esperada, en
 * lugar de tomarla por una página en blanco.
 *
 * Fijar solo `ocr-node` no alcanza: el 1.4.8 acepta cualquier `ocr-common` ^1.2.0 y
 * una instalación limpia trae el 1.4.9. Por eso el módulo declara `ocr-common`
 * aunque no lo importe: declararlo fija la copia que queda en la raíz. El
 * `ocr-node` 1.4.9, además, pide `onnxruntime-node` ^1.22, que choca con el
 * override de arriba.
 *
 * Para subir los pines: que `runPaddleOcr` lea la forma nueva de `detect()`, y que
 * el `ocr-node` nuevo acepte el `onnxruntime-node` fijado.
 *
 * ── La forma del fallo, si alguna vez no carga ──
 *
 * `getEngine` está memoizado: avisa UNA vez por proceso y después devuelve null
 * para siempre. En un worker de larga vida el aviso aparece al arrancar y no
 * vuelve nunca, `extractFromImage` saltea su último intento en silencio, y nadie
 * mide que lo saltea. Un «la cascada probó todo y no pudo» puede significar que
 * el último eslabón nunca corrió.
 *
 * Kill-switch: AP_PADDLE_OCR=off. «Apagado» y «no disponible» dan los dos null, y
 * son cosas distintas.
 */

import { existsSync } from "fs";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { agruparEnOrdenDeLectura } from "./ordenDeLectura";
import type { PaddleWord } from "./ordenDeLectura";

interface PaddleLine {
  mean: number;
  text: string;
  // Cuadrilátero [x,y] × 4 esquinas, en píxeles de la imagen de entrada.
  box: Array<[number, number]>;
}

let enginePromise: Promise<any> | null = null;

async function getEngine(): Promise<any | null> {
  if (process.env.AP_PADDLE_OCR === "off") return null;
  if (!enginePromise) {
    // Modelos alternativos por entorno — inerte sin la variable. El caso que
    // lo motiva: la recognition DEFAULT es la china (ch_PP-OCRv4) y en texto
    // latino casi no emite espacios («OBRAERYMAYPREVIAL»); apuntar a un
    // directorio con det.onnx / rec.onnx / dict.txt latinos corrige el
    // alfabeto sin tocar la detección.
    const dirDeModelos = process.env.AP_PADDLE_MODELS_DIR;
    enginePromise = import("@gutenye/ocr-node")
      .then((m: any) => {
        const Ocr = m.default.create ? m.default : m.default.default;
        // Solo errores: la carga de un ONNX convertido (paddle2onnx) emite
        // decenas de advertencias de iniciadores huérfanos —cosmética del
        // conversor— y ensuciaba el log del server en cada arranque.
        const onnxOptions = { logSeverityLevel: 3 };
        if (!dirDeModelos) return Ocr.create({ onnxOptions });
        // La detección es opcional en la carpeta: sin `det.onnx`, la del paquete. El modelo
        // latino del motor trae solo el reconocimiento y su diccionario.
        const deteccion = path.join(dirDeModelos, "det.onnx");
        return Ocr.create({
          onnxOptions,
          models: {
            ...(existsSync(deteccion) ? { detectionPath: deteccion } : {}),
            recognitionPath: path.join(dirDeModelos, "rec.onnx"),
            dictionaryPath: path.join(dirDeModelos, "dict.txt"),
          },
        });
      })
      .catch((error) => {
        console.warn("[paddleOcr] no disponible:", error instanceof Error ? error.message : String(error));
        return null;
      });
  }
  return enginePromise;
}

/** Si PP-OCR carga en este proceso: con `AP_PADDLE_OCR=off` o sin sus modelos, no. */
export async function paddleDisponible(): Promise<boolean> {
  return (await getEngine()) !== null;
}

/**
 * Lo que dio PP-OCR sobre una página: sus palabras, una página sin texto (el detector corrió y no vio
 * nada) o una falla (el runtime lanzó, el motor no está, o `detect()` no tiene la forma fijada). Una
 * página vacía dice algo de la página; una falla, solo que no se pudo mirar.
 */
export type LecturaPaddle =
  | { palabras: { text: string; words: PaddleWord[] } }
  | { vacia: true }
  | { fallo: string };

/**
 * Corre PP-OCR sobre un PNG y devuelve el texto en orden de lectura con
 * "palabras" sintéticas: cada caja se reparte horizontalmente entre sus
 * tokens en proporción a los caracteres — cajas aproximadas pero útiles para
 * los recortes de evidencia. `null` tanto si la página no tiene texto como si
 * la lectura falló: para distinguirlos, `leerConPaddleDetallado`.
 *
 * De a una página por proceso. La memoria de PP-OCR crece con los píxeles de
 * la página (~1,9 GB con el tope de 4 MP), y el worker lee varios documentos a
 * la vez: sin turno, se multiplica. El turno es del proceso — dos workers no
 * se coordinan, y entre ellos el límite es la memoria de la máquina.
 */
export function runPaddleOcr(png: Buffer, scale = 1): Promise<{ text: string; words: PaddleWord[] } | null> {
  return leerConPaddleDetallado(png, scale).then((r) => ("palabras" in r ? r.palabras : null));
}

/** Como `runPaddleOcr`, en el mismo turno, separando la página vacía de la falla. */
export function leerConPaddleDetallado(png: Buffer, scale = 1): Promise<LecturaPaddle> {
  const esta = turno.then(() => leerConPaddle(png, scale));
  turno = esta.catch(() => undefined);
  return esta;
}

let turno: Promise<unknown> = Promise.resolve();

const VACIA: LecturaPaddle = { vacia: true };

async function leerConPaddle(png: Buffer, scale: number): Promise<LecturaPaddle> {
  const engine = await getEngine();
  if (!engine) return { fallo: "PP-OCR no está disponible en este proceso." };

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ap-paddle-"));
  const imgPath = path.join(dir, "in.png");
  try {
    await fs.writeFile(imgPath, png);
    const detectado: unknown = await engine.detect(imgPath);
    if (!Array.isArray(detectado)) {
      const motivo = "detect() no devolvió la lista de líneas: la versión de @gutenye/ocr-common no es la fijada";
      console.warn(`[paddleOcr] ${motivo}`);
      return { fallo: motivo };
    }
    const lines = detectado as PaddleLine[];
    // Cero cajas NO es una excepción: el detector corrió y no vio texto. Es el
    // resultado de una página en blanco… y también el de una escaneada cabeza
    // abajo. Callarlo hace indistinguible «no había nada» de «no lo supimos
    // leer», que es la diferencia que importa al diagnosticar.
    if (!lines?.length) {
      console.warn(`[paddleOcr] el detector no encontró texto (${png.length} bytes, escala ${scale})`);
      return VACIA;
    }
    const flat = agruparEnOrdenDeLectura(lines, scale);
    if (!flat.text.trim().length) {
      console.warn(`[paddleOcr] ${lines.length} cajas detectadas pero el texto quedó vacío`);
      return VACIA;
    }
    return { palabras: flat };
  } catch (error) {
    // Lo que lanza el runtime nativo no siempre es un Error: `.message` daba
    // «undefined» en 1.300 fallas de una campaña y nadie supo de qué morían.
    const motivo = error instanceof Error ? error.message : String(error);
    console.warn("[paddleOcr] falló:", motivo);
    return { fallo: motivo };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
