/**
 * El orden de lectura geométrico del OCR, contra las cajas REALES de una
 * factura escaneada con ~1,2° de inclinación (formulario continuo de
 * imprenta): cada fila visual de la tabla sale del detector como 2-3 cajas
 * a alturas distintas, y ordenar solo por «y» las intercala en zigzag —
 * números de una fila, descripción de otra. El agrupador corrige la
 * pendiente global y arma filas por banda, de izquierda a derecha.
 */

import * as fs from "fs";
import * as path from "path";
import { agruparEnOrdenDeLectura } from "../src/index";

const cajas: Array<{ text: string; box: Array<[number, number]> }> = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "factura-escalonada-cajas.json"), "utf8"),
);
const { text } = agruparEnOrdenDeLectura(cajas.map((c) => ({ ...c, mean: 1 })), 1);
const lineas = text.split("\n");

describe("agruparEnOrdenDeLectura — la tabla escalonada del escaneo inclinado", () => {
  it("junta las cajas de una fila visual en una línea, de izquierda a derecha", () => {
    expect(lineas).toContain("clip bateria 50 2.00 unidades 1200.00 0.00 2400.00 21% 2904,00");
    expect(lineas).toContain("lamparares 12v 2,00 unidades 1600.00 0,00 320000 21% 3872,00");
  });

  it("el encabezado de la tabla queda entero en una sola línea", () => {
    const header = lineas.find((l) => l.includes("Codigo"));
    expect(header).toContain("Producto/ Servicio");
    expect(header).toContain("Precio Unit.");
    expect(header).toContain("Subtotal c/IVA");
  });

  it("la caja pegada (descripción + importe ajeno) cae en SU fila, anclada al borde izquierdo", () => {
    // Paddle detectó «ficha hembra ridru» y el c/IVA de OTRA fila como una
    // sola caja ancha; el centro de esa caja queda entre dos filas, pero su
    // borde izquierdo está exactamente en la fila de la descripción.
    const fila = lineas.find((l) => l.startsWith("ficha hembra ridru"));
    expect(fila).toContain("6,00 unidades");
    expect(fila).toContain("1650,00");
  });

  it("el pie no se mezcla con el último renglón", () => {
    const siloc = lineas.find((l) => l.includes("siloc"));
    expect(siloc).toBeDefined();
    expect(siloc).not.toContain("Subtotal");
    expect(text).toContain("Subtotal: 211798,40");
  });
});
