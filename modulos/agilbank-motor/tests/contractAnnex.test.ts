import * as fs from "fs";
import * as path from "path";
import { catalog } from "../src/catalog/catalog";

const CONTRATO = fs.readFileSync(path.join(__dirname, "../docs/contrato/borrador-contrato-agilbank.md"), "utf8");
const AVISOS = ["varias-cuentas", "no-cierra", "no-encadena", "cuenta-distinta", "sin-saldos", "lectura-parcial", "concepto-nuevo"];

/** El texto de un título hasta el próximo título del mismo nivel o de uno superior. */
function seccion(nivel: number, titulo: string): string {
  const lineas = CONTRATO.split("\n");
  const inicio = lineas.findIndex((l) => l.startsWith(`${"#".repeat(nivel)} ${titulo}`));
  if (inicio < 0) throw new Error(`El contrato no tiene la sección «${titulo}».`);
  const encabezado = new RegExp(`^#{1,${nivel}} `);
  const fin = lineas.findIndex((l, i) => i > inicio && encabezado.test(l));
  return lineas.slice(inicio, fin < 0 ? undefined : fin).join("\n");
}

const ANEXO = seccion(2, "Anexo");
const SECCION_AVISOS = seccion(3, "Los avisos");

describe("el borrador del contrato", () => {
  it.each(catalog.types.map((t) => t.code))("su anexo trae el tipo %s", (code) => {
    expect(ANEXO).toContain(`\`${code}\``);
  });

  it.each(AVISOS)("documenta el aviso %s", (code) => {
    expect(SECCION_AVISOS).toContain(`\`${code}\``);
  });
});
