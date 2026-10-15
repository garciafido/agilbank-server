// Las herramientas con que se lee un documento: poppler (texto y render de PDF), tesseract y
// PP-OCR.
//
// Cuando una lectura no da nada hace falta saber de quién es: si faltó una herramienta, no se
// pudo mirar el archivo —una falla nuestra—; si estaban todas, se lo miró y no había nada. Desde
// adentro de la lectura no se distingue: un render que falta da `null` tanto sin pdftoppm como
// con un PDF roto. Se pregunta una vez por proceso.

import { execFile } from "child_process";
import { paddleDisponible } from "./paddleOcr";

export interface HerramientasDeLectura {
  poppler: boolean;
  tesseract: boolean;
  paddle: boolean;
}

/** Si el programa está instalado. Solo «no existe» cuenta como ausente: un código de salida raro no. */
export function programaDisponible(programa: string, args: string[]): Promise<boolean> {
  return new Promise((listo) => {
    execFile(programa, args, { timeout: 10000 }, (error) => {
      listo(!(error && (error as NodeJS.ErrnoException).code === "ENOENT"));
    });
  });
}

let consulta: Promise<HerramientasDeLectura> | null = null;

export function herramientasDeLectura(): Promise<HerramientasDeLectura> {
  if (!consulta) {
    consulta = Promise.all([
      programaDisponible("pdftoppm", ["-v"]),
      programaDisponible("tesseract", ["--version"]),
      paddleDisponible(),
    ]).then(([poppler, tesseract, paddle]) => ({ poppler, tesseract, paddle }));
  }
  return consulta;
}
