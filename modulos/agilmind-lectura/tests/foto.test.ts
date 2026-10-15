// Corre sharp de verdad, sobre imágenes generadas en el test.
import sharp from "sharp";
import { girarPng, pixelesGrises, prepararFoto } from "../src/foto";
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
