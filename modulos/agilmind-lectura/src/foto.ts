// E/S: decodifica, endereza y achica una foto con sharp. Queda fuera de la mutación.
import sharp from "sharp";

/** El tope de PP-OCR: con 4 MP pide ~1,9 GB y tarda ~4 s; con 35 MP, 15 GB y 32 s (medido en AgilPost). */
const MAX_PIXELES = 4_000_000;

/**
 * La foto como PNG, derecha según su EXIF y con `maxPixeles` como mucho. Una foto de un teléfono
 * guarda los píxeles como salieron del sensor y dice en el EXIF cómo girarlos: sin enderezarla, el
 * OCR lee los renglones de costado. `null` si no es una imagen que sharp sepa abrir.
 */
export async function prepararFoto(buffer: Buffer, maxPixeles = MAX_PIXELES): Promise<Buffer | null> {
  try {
    const { data, info } = await sharp(buffer).rotate().png().toBuffer({ resolveWithObject: true });
    const pixeles = info.width * info.height;
    if (pixeles <= maxPixeles) return data;
    const escala = Math.sqrt(maxPixeles / pixeles);
    return await sharp(data)
      .resize(Math.floor(info.width * escala), Math.floor(info.height * escala))
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/** El PNG girado en sentido horario. */
export async function girarPng(png: Buffer, grados: 90 | 180 | 270): Promise<Buffer> {
  return sharp(png).rotate(grados).png().toBuffer();
}

/**
 * Los píxeles de una imagen en escala de grises: un byte por píxel, fila por fila, de 0 (negro) a 255
 * (blanco). Es lo que hace falta para medir dónde hay tinta. `null` si no es una imagen que sharp sepa abrir.
 */
export async function pixelesGrises(png: Buffer): Promise<{ ancho: number; alto: number; datos: Uint8Array } | null> {
  try {
    const { data, info } = await sharp(png).removeAlpha().grayscale().raw().toBuffer({ resolveWithObject: true });
    return { ancho: info.width, alto: info.height, datos: new Uint8Array(data.buffer, data.byteOffset, data.length) };
  } catch {
    return null;
  }
}
