// Corre sharp de verdad, sobre imágenes generadas en el test.
import sharp from "sharp";
import { girarPng, paginasDeImagen, pixelesGrises, prepararFoto } from "../src/foto";
import { tamanoDelPng } from "../src/paginasDelPdf";

const jpeg = async (ancho: number, alto: number, orientacion?: number): Promise<Buffer> => {
  const imagen = sharp({ create: { width: ancho, height: alto, channels: 3, background: "#ffffff" } }).jpeg();
  return (orientacion ? imagen.withMetadata({ orientation: orientacion }) : imagen).toBuffer();
};

describe("prepararFoto", () => {
  it("devuelve un PNG", async () => {
    expect(tamanoDelPng((await prepararFoto(await jpeg(30, 20)))!)).toEqual({ ancho: 30, alto: 20 });
  });

  it("la endereza según el EXIF: una foto de 40×20 tomada de costado (orientación 6) queda de 20×40", async () => {
    expect(tamanoDelPng((await prepararFoto(await jpeg(40, 20, 6)))!)).toEqual({ ancho: 20, alto: 40 });
  });

  it("una foto de más píxeles que el tope se achica sin deformarse", async () => {
    const t = tamanoDelPng((await prepararFoto(await jpeg(4000, 3000)))!)!;
    expect(t.ancho * t.alto).toBeLessThanOrEqual(4_000_000);
    expect(t.ancho * t.alto).toBeGreaterThan(3_900_000);
    expect(t.ancho / t.alto).toBeCloseTo(4 / 3, 2);
  });

  it("el tope se puede pedir", async () => {
    const t = tamanoDelPng((await prepararFoto(await jpeg(200, 100), 5_000))!)!;
    expect(t.ancho * t.alto).toBeLessThanOrEqual(5_000);
  });

  it("una foto chica no se agranda", async () => {
    expect(tamanoDelPng((await prepararFoto(await jpeg(300, 200)))!)).toEqual({ ancho: 300, alto: 200 });
  });

  it("null si no es una imagen", async () => {
    expect(await prepararFoto(Buffer.from("no es una imagen"))).toBeNull();
  });
});

/**
 * Un TIFF de varias páginas en blanco, como el de un escáner con alimentador. sharp no arma uno desde
 * cero: se le da un GIF animado de esas páginas, que sí abre como varias. Cada píxel del GIF va
 * después del código de limpieza, así todos los códigos LZW son de 3 bits.
 */
const tiffDePaginas = (ancho: number, alto: number, paginas: number): Promise<Buffer> => {
  const u16 = (n: number) => [n & 255, n >> 8];
  const gif = [...Buffer.from("GIF89a"), ...u16(ancho), ...u16(alto), 0x80, 0, 0, 255, 255, 255, 0, 0, 0];
  for (let p = 0; p < paginas; p++) {
    gif.push(0x2c, 0, 0, 0, 0, ...u16(ancho), ...u16(alto), 0, 2);
    const bytes: number[] = [];
    let acc = 0;
    let bits = 0;
    for (const c of [...Array.from({ length: ancho * alto }, () => [4, 0]).flat(), 5]) {
      acc |= c << bits;
      for (bits += 3; bits >= 8; bits -= 8, acc >>= 8) bytes.push(acc & 255);
    }
    if (bits > 0) bytes.push(acc & 255);
    for (let i = 0; i < bytes.length; i += 255) gif.push(Math.min(255, bytes.length - i), ...bytes.slice(i, i + 255));
    gif.push(0);
  }
  gif.push(0x3b);
  return sharp(Buffer.from(gif), { animated: true }).tiff().toBuffer();
};

describe("paginasDeImagen", () => {
  it("un TIFF de dos páginas tiene 2", async () => {
    expect(await paginasDeImagen(await tiffDePaginas(30, 20, 2))).toBe(2);
  });

  it("un TIFF de una página tiene 1", async () => {
    expect(await paginasDeImagen(await tiffDePaginas(30, 20, 1))).toBe(1);
  });

  it("una foto que no dice cuántas páginas tiene, como un JPG, tiene 1", async () => {
    expect(await paginasDeImagen(await jpeg(30, 20))).toBe(1);
  });

  it("null si no es una imagen", async () => {
    expect(await paginasDeImagen(Buffer.from("no es una imagen"))).toBeNull();
  });
});

describe("girarPng", () => {
  it("a 90 y 270 cambia el ancho por el alto, a 180 no", async () => {
    const png = (await prepararFoto(await jpeg(40, 20)))!;
    expect(tamanoDelPng(await girarPng(png, 90))).toEqual({ ancho: 20, alto: 40 });
    expect(tamanoDelPng(await girarPng(png, 270))).toEqual({ ancho: 20, alto: 40 });
    expect(tamanoDelPng(await girarPng(png, 180))).toEqual({ ancho: 40, alto: 20 });
  });
});

describe("pixelesGrises", () => {
  // Un rectángulo negro de 4×3 en (5, 2), sobre un fondo blanco de 12×8.
  const png = (): Promise<Buffer> =>
    sharp({ create: { width: 12, height: 8, channels: 3, background: "#ffffff" } })
      .composite([{ input: { create: { width: 4, height: 3, channels: 3, background: "#000000" } }, left: 5, top: 2 }])
      .png()
      .toBuffer();

  it("un byte por píxel, fila por fila: adentro del rectángulo oscuro, afuera claro", async () => {
    const g = (await pixelesGrises(await png()))!;
    expect([g.ancho, g.alto, g.datos.length]).toEqual([12, 8, 96]);
    const at = (x: number, y: number) => g.datos[y * g.ancho + x];
    for (const [x, y] of [[5, 2], [8, 4], [6, 3]]) expect(at(x, y)).toBeLessThan(50);
    for (const [x, y] of [[4, 2], [9, 4], [5, 1], [5, 5], [0, 0], [11, 7]]) expect(at(x, y)).toBeGreaterThan(200);
  });

  it("una imagen con canal alfa también da un byte por píxel", async () => {
    const rgba = await sharp({ create: { width: 3, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const g = (await pixelesGrises(rgba))!;
    expect([g.ancho, g.alto, g.datos.length]).toEqual([3, 2, 6]);
    expect([...g.datos].every((v) => v < 50)).toBe(true);
  });

  it("lo que no es una imagen da null", async () => {
    expect(await pixelesGrises(Buffer.from("no es un png"))).toBeNull();
  });
});
