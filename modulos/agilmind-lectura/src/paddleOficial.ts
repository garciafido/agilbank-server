/**
 * PP-OCR con el pre y el post-proceso oficiales de la detección (PaddleX 3.0), sobre los mismos
 * modelos ONNX que usa gutenye. Es la E/S de `deteccionDeTexto.ts` y `reconocimientoDeRenglones.ts`:
 * onnxruntime corre las redes, OpenCV busca los contornos, la caja mínima y el recorte, y Clipper
 * agranda las cajas.
 *
 * ── Qué cambia contra @gutenye/ocr-common 1.4.8 ──
 *
 * gutenye pasa a la red la imagen entera (múltiplo de 32), sin la normalización de ImageNet, binariza
 * con 0,03 y no filtra las cajas por su probabilidad media. Con ese umbral los renglones vecinos se
 * pegan. Acá la imagen se limita (DetResizeForTest), se normaliza, se binariza con 0,3 y la caja
 * necesita una probabilidad media de 0,6. Los recortes salen de la imagen original, no de la reducida.
 *
 * El reconocimiento conserva lo que consume el orden de lectura: el descarte por debajo de 0,5 y la
 * agrupación por línea media de gutenye. Su pre-proceso puede ser el de gutenye o el oficial.
 *
 * ── Por qué las dependencias se piden a gutenye ──
 *
 * onnxruntime-node, @techstark/opencv-js y js-clipper son las que trae @gutenye/ocr-node 1.4.8, con
 * sus versiones fijadas. Se resuelven desde su carpeta para usar exactamente esas copias, y para que
 * el override de onnxruntime-node que explica `paddleOcr.ts` siga gobernando.
 */
import { createRequire } from "module";
import * as path from "path";
import {
  DETECCION_OFICIAL,
  aEscalaOriginal,
  binarizar,
  distanciaDeDespliegue,
  limitesDeCaja,
  medidasDeEntrada,
  normalizarBgrChw,
  ordenarCaja,
  ordenarCajas,
  puntosDelRectangulo,
  type OpcionesDeteccion,
  type Punto,
} from "./deteccionDeTexto";
import {
  ALTO_DE_RENGLON,
  agruparComoGutenye,
  decodificarCtc,
  medidasDeRenglon,
  tensorDeRenglon,
  type LineaReconocida,
  type ModoReconocimiento,
} from "./reconocimientoDeRenglones";
import { fraccionGirada, medidasDeOrientacion, type VotoDeRenglones } from "./orientacionDeLaPagina";

interface Dependencias {
  ort: any;
  cv: any;
  clipper: any;
  sharp: any;
}

let dependencias: Promise<Dependencias> | null = null;

function cargarDependencias(): Promise<Dependencias> {
  if (!dependencias) {
    dependencias = (async () => {
      const desdeNode = createRequire(require.resolve("@gutenye/ocr-node"));
      const desdeCommon = createRequire(desdeNode.resolve("@gutenye/ocr-common"));
      let cv = desdeCommon("@techstark/opencv-js");
      if (cv instanceof Promise) cv = await cv;
      if (!cv.Mat) await new Promise<void>((listo) => (cv.onRuntimeInitialized = () => listo()));
      return { ort: desdeNode("onnxruntime-node"), cv, clipper: desdeCommon("js-clipper"), sharp: require("sharp") };
    })();
  }
  return dependencias;
}

/**
 * Los modelos que trae @gutenye/ocr-models, los mismos que usa gutenye sin carpeta propia: la detección
 * PP-OCRv4 y el reconocimiento chino. Su `node.js` es ESM y solo arma estas rutas: se arman acá igual.
 */
export function modelosDelPaquete(): Required<ModelosOficiales> {
  const desdeNode = createRequire(require.resolve("@gutenye/ocr-node"));
  const assets = path.join(path.dirname(desdeNode.resolve("@gutenye/ocr-models/node")), "assets");
  return {
    deteccion: path.join(assets, "ch_PP-OCRv4_det_infer.onnx"),
    reconocimiento: path.join(assets, "ch_PP-OCRv4_rec_infer.onnx"),
    diccionario: path.join(assets, "ppocr_keys_v1.txt"),
    orientacion: path.join(assets, "ch_ppocr_mobile_v2.0_cls_infer.onnx"),
  };
}

/** La detección del paquete (PP-OCRv4 det): la que usa gutenye cuando la carpeta no trae `det.onnx`. */
export function deteccionDelPaquete(): string {
  return modelosDelPaquete().deteccion;
}

function cajaMinima(cv: any, contorno: any): { puntos: Punto[]; lado: number } {
  const r = cv.minAreaRect(contorno);
  const pts = puntosDelRectangulo(r.center.x, r.center.y, r.size.width, r.size.height, r.angle);
  // cv2.boxPoints devuelve float32: el orden por x depende de esa precisión.
  return { puntos: ordenarCaja(pts.map(([x, y]) => [Math.fround(x), Math.fround(y)] as Punto)), lado: Math.min(r.size.width, r.size.height) };
}

function puntajeMedio(cv: any, prob: any, caja: Punto[]): number {
  const { xmin, xmax, ymin, ymax } = limitesDeCaja(caja, prob.cols, prob.rows);
  const mascara = cv.Mat.zeros(ymax - ymin + 1, xmax - xmin + 1, cv.CV_8UC1);
  const poligono = cv.matFromArray(4, 1, cv.CV_32SC2, caja.flatMap(([x, y]) => [Math.trunc(x - xmin), Math.trunc(y - ymin)]));
  const poligonos = new cv.MatVector();
  poligonos.push_back(poligono);
  cv.fillPoly(mascara, poligonos, new cv.Scalar(1));
  const region = prob.roi(new cv.Rect(xmin, ymin, xmax - xmin + 1, ymax - ymin + 1));
  const media = cv.mean(region, mascara)[0];
  for (const m of [region, poligonos, poligono, mascara]) m.delete();
  return media;
}

function desplegar(clipper: any, caja: Punto[], ratio: number): Punto[][] {
  const off = new clipper.ClipperOffset();
  // pyclipper trabaja con enteros: trunca las coordenadas al entrar.
  off.AddPath(caja.map(([x, y]) => ({ X: Math.trunc(x), Y: Math.trunc(y) })), clipper.JoinType.jtRound, clipper.EndType.etClosedPolygon);
  const salida: Array<Array<{ X: number; Y: number }>> = [];
  off.Execute(salida, distanciaDeDespliegue(caja, ratio));
  return salida.map((p) => p.map((q) => [q.X, q.Y] as Punto));
}

/**
 * DBPostProcess.boxes_from_bitmap sobre el mapa de probabilidad de la red (ancho × alto): las cajas en
 * píxeles de una imagen de destW × destH, en el orden de los contornos.
 */
export async function cajasDelMapa(mapa: Float32Array, ancho: number, alto: number, destW: number, destH: number, op: OpcionesDeteccion): Promise<Punto[][]> {
  const { cv, clipper } = await cargarDependencias();
  const prob = cv.matFromArray(alto, ancho, cv.CV_32FC1, mapa);
  const mascara = cv.matFromArray(alto, ancho, cv.CV_8UC1, binarizar(mapa, op.thresh));
  const contornos = new cv.MatVector();
  const jerarquia = new cv.Mat();
  cv.findContours(mascara, contornos, jerarquia, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  mascara.delete();
  jerarquia.delete();
  const cajas: Punto[][] = [];
  try {
    for (let i = 0; i < Math.min(contornos.size(), op.maxCandidates); i++) {
      const contorno = contornos.get(i);
      const chica = cajaMinima(cv, contorno);
      contorno.delete();
      if (chica.lado < 3) continue;
      if (op.boxThresh > puntajeMedio(cv, prob, chica.puntos)) continue;
      const desplegada = desplegar(clipper, chica.puntos, op.unclipRatio);
      if (desplegada.length !== 1 || !desplegada[0].length) continue;
      const poligono = cv.matFromArray(desplegada[0].length, 1, cv.CV_32SC2, desplegada[0].flat());
      const grande = cajaMinima(cv, poligono);
      poligono.delete();
      if (grande.lado < 5) continue;
      cajas.push(aEscalaOriginal(grande.puntos, destW / ancho, destH / alto, destW, destH));
    }
  } finally {
    contornos.delete();
    prob.delete();
  }
  return cajas;
}

export interface ModelosOficiales {
  deteccion: string;
  reconocimiento: string;
  diccionario: string;
  /** El clasificador de orientación de renglones; sin él, `orientacion()` falla. */
  orientacion?: string;
}

export interface OpcionesOficiales {
  deteccion?: Partial<OpcionesDeteccion>;
  reconocimiento?: ModoReconocimiento;
}

export interface MotorOficial {
  /** Las líneas de la página con la forma de `detect()` de gutenye: texto, confianza y cuadrilátero. */
  detect(png: Buffer, opciones?: OpcionesOficiales): Promise<LineaReconocida[]>;
  /** Cuántos renglones detectó y qué parte de ellos el clasificador ve a 180°. */
  orientacion(png: Buffer, opciones?: Pick<OpcionesOficiales, "deteccion">): Promise<VotoDeRenglones>;
}

interface Imagen {
  data: Buffer;
  w: number;
  h: number;
}

export async function crearMotorOficial(modelos: ModelosOficiales, onnxOptions: Record<string, unknown> = {}): Promise<MotorOficial> {
  const { ort, cv, sharp } = await cargarDependencias();
  const fs = await import("fs/promises");
  const detector = await ort.InferenceSession.create(modelos.deteccion, onnxOptions);
  const lector = await ort.InferenceSession.create(modelos.reconocimiento, onnxOptions);
  const diccionario = [...(await fs.readFile(modelos.diccionario, "utf8")).split("\n"), " "];
  const clasificador = modelos.orientacion ? await ort.InferenceSession.create(modelos.orientacion, onnxOptions) : null;

  const matDe = (img: Imagen) =>
    cv.matFromImageData({ data: new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length), width: img.w, height: img.h });

  async function detectar(png: Buffer, op: OpcionesDeteccion): Promise<{ cajas: Punto[][]; imagen: Imagen }> {
    const { data, info } = await sharp(png).toColourspace("srgb").ensureAlpha(1).raw().toBuffer({ resolveWithObject: true });
    const imagen: Imagen = { data, w: info.width, h: info.height };
    const entrada = medidasDeEntrada(imagen.w, imagen.h, op);
    const rgba = matDe(imagen);
    let rgb = new cv.Mat();
    cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
    rgba.delete();
    if (entrada.w !== imagen.w || entrada.h !== imagen.h) {
      const chica = new cv.Mat();
      cv.resize(rgb, chica, new cv.Size(entrada.w, entrada.h), 0, 0, cv.INTER_LINEAR);
      rgb.delete();
      rgb = chica;
    }
    const tensor = new ort.Tensor("float32", normalizarBgrChw(rgb.data, entrada.w, entrada.h), [1, 3, entrada.h, entrada.w]);
    rgb.delete();
    const salida = (await detector.run({ [detector.inputNames[0]]: tensor }))[detector.outputNames[0]];
    const cajas = await cajasDelMapa(salida.data, salida.dims[3], salida.dims[2], imagen.w, imagen.h, op);
    return { cajas: ordenarCajas(cajas.map((caja) => ({ caja }))).map((c) => c.caja), imagen };
  }

  /** CropByPolys.get_minarea_rect_crop: la caja mínima de los puntos enteros, enderezada; si es alta, girada. */
  function recortar(origen: any, caja: Punto[]): Imagen | null {
    const puntos = cv.matFromArray(4, 1, cv.CV_32SC2, caja.flatMap(([x, y]) => [Math.trunc(x), Math.trunc(y)]));
    const p = cajaMinima(cv, puntos).puntos;
    puntos.delete();
    const dist = (a: Punto, b: Punto) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const ancho = Math.trunc(Math.max(dist(p[0], p[1]), dist(p[2], p[3])));
    const alto = Math.trunc(Math.max(dist(p[0], p[3]), dist(p[1], p[2])));
    if (ancho < 1 || alto < 1) return null;
    const desde = cv.matFromArray(4, 1, cv.CV_32FC2, p.flat());
    const hacia = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, ancho, 0, ancho, alto, 0, alto]);
    const M = cv.getPerspectiveTransform(desde, hacia);
    let recorte = new cv.Mat();
    cv.warpPerspective(origen, recorte, M, new cv.Size(ancho, alto), cv.INTER_CUBIC, cv.BORDER_REPLICATE, new cv.Scalar());
    for (const m of [desde, hacia, M]) m.delete();
    if (recorte.rows / recorte.cols >= 1.5) {
      const girado = new cv.Mat();
      cv.rotate(recorte, girado, cv.ROTATE_90_COUNTERCLOCKWISE);
      recorte.delete();
      recorte = girado;
    }
    const r: Imagen = { data: Buffer.from(recorte.data), w: recorte.cols, h: recorte.rows };
    recorte.delete();
    return r;
  }

  async function aAltoDeRenglon(r: Imagen, modo: ModoReconocimiento): Promise<{ data: Uint8Array; w: number; anchoTensor: number }> {
    if (modo === "gutenye") {
      // Como ImageRaw.resize de gutenye: sharp, alto 48 y el ancho que dé la proporción.
      const { data, info } = await sharp(r.data, { raw: { width: r.w, height: r.h, channels: 4 } })
        .resize({ height: ALTO_DE_RENGLON, fit: "contain" })
        .raw()
        .toBuffer({ resolveWithObject: true });
      return { data, w: info.width, anchoTensor: info.width };
    }
    const { ancho, anchoTensor } = medidasDeRenglon(r.w, r.h);
    const origen = matDe(r);
    const destino = new cv.Mat();
    cv.resize(origen, destino, new cv.Size(ancho, ALTO_DE_RENGLON), 0, 0, cv.INTER_LINEAR);
    const data = Uint8Array.from(destino.data);
    origen.delete();
    destino.delete();
    return { data, w: ancho, anchoTensor };
  }

  return {
    async detect(png, opciones = {}) {
      const op = { ...DETECCION_OFICIAL, ...opciones.deteccion };
      const modo = opciones.reconocimiento ?? "gutenye";
      const { cajas, imagen } = await detectar(png, op);
      const origen = matDe(imagen);
      const lineas: LineaReconocida[] = [];
      try {
        for (const caja of cajas) {
          const recorte = recortar(origen, caja);
          if (!recorte) continue;
          const { data, w, anchoTensor } = await aAltoDeRenglon(recorte, modo);
          const tensor = new ort.Tensor("float32", tensorDeRenglon(data, w, anchoTensor, modo), [1, 3, ALTO_DE_RENGLON, anchoTensor]);
          const salida = (await lector.run({ [lector.inputNames[0]]: tensor }))[lector.outputNames[0]];
          lineas.push({ ...decodificarCtc(salida.data, salida.dims[1], salida.dims[2], diccionario), box: caja });
        }
      } finally {
        origen.delete();
      }
      return agruparComoGutenye(lineas);
    },

    async orientacion(png, opciones = {}) {
      if (!clasificador) throw new Error("sin el modelo de orientación de renglones");
      const { cajas, imagen } = await detectar(png, { ...DETECCION_OFICIAL, ...opciones.deteccion });
      const origen = matDe(imagen);
      const probabilidades: Array<[number, number]> = [];
      try {
        for (const caja of cajas) {
          const recorte = recortar(origen, caja);
          if (!recorte) continue;
          const { ancho, anchoTensor } = medidasDeOrientacion(recorte.w, recorte.h);
          const desde = matDe(recorte);
          const hasta = new cv.Mat();
          cv.resize(desde, hasta, new cv.Size(ancho, ALTO_DE_RENGLON), 0, 0, cv.INTER_LINEAR);
          const tensor = new ort.Tensor("float32", tensorDeRenglon(Uint8Array.from(hasta.data), ancho, anchoTensor, "oficial"), [1, 3, ALTO_DE_RENGLON, anchoTensor]);
          desde.delete();
          hasta.delete();
          const p = (await clasificador.run({ [clasificador.inputNames[0]]: tensor }))[clasificador.outputNames[0]].data;
          probabilidades.push([p[0], p[1]]);
        }
      } finally {
        origen.delete();
      }
      return { renglones: probabilidades.length, fraccion: fraccionGirada(probabilidades) };
    },
  };
}
