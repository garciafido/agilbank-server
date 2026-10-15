// Los extractos de la etapa y lo que se espera de cada uno. Los nombres de los archivos y de las
// carpetas de los casos llevan datos de los clientes, y lo commiteado acá viaja a todos los productos:
// un archivo se reconoce por su huella y un caso por su número, y los nombres se buscan al correr.
import * as fs from "fs";
import * as path from "path";
import { fingerprintOf } from "../src/identity";
import type { KnownAccount, StatementLine, WarningCode } from "../src/types";

export interface BenchFile {
  /** La huella del archivo (el SHA-256 de sus bytes), en «Ejemplos Extractos». */
  fingerprint: string;
  /** El número del caso en «Casos de prueba», si lo hay: de su cuenta.json sale la cuenta. */
  caseNumber?: string;
  /** Sin caso, el banco por su nombre, para que se usen sus sinónimos. */
  bank?: string;
  /** El nombre que se muestra en la salida; sin él, el número de consulta de BDL. */
  label?: string;
  expectedLines?: number;
  expectedVerdict: "verified" | "weak" | "abstained" | "unavailable";
  expectedWarnings?: WarningCode[];
  /** Los archivos con la misma marca traen los mismos movimientos por dos canales: tienen que dar los mismos ids. */
  sameMovements?: string;
  /** Cuántos renglones, como mínimo, tienen que salir: un retroceso a la mitad de la lectura no pasa en verde en un archivo que ya es weak. */
  minLines?: number;
  /** Cuántos renglones, como mínimo, tienen que salir con el CUIT de la contraparte (los que completan los anexos). */
  minLinesWithCuit?: number;
  /**
   * Cuántos renglones, como mínimo, tienen que encadenar. Es para un archivo que no llega a verified:
   * su veredicto ya es weak y no cambia si la lectura retrocede, pero lo que encadena sí baja.
   */
  minLinesThatChain?: number;
  /** El techo de la lectura en segundos, contada de punta a punta. */
  maxSeconds?: number;
}

export const STAGE2: BenchFile[] = [
  { fingerprint: "d6f1c868202b78debcab9b3203a78f91908ec1be3a42874b7c5558bb96995858", caseNumber: "02", expectedLines: 1156, expectedVerdict: "verified" },
  { fingerprint: "53fb8c3349b1ee051158861edebed1bdd3ca34ecc0ad446b5081615d0e92ba0b", caseNumber: "03", expectedLines: 272, expectedVerdict: "verified" },
  { fingerprint: "7f0a6d055cf357909bb9df23b3a19d206112ac856650472c93f13d3ea262b75b", caseNumber: "04", expectedLines: 620, expectedVerdict: "weak", expectedWarnings: ["sin-saldos", "no-cierra"], sameMovements: "04" },
  { fingerprint: "71aab33c08ee5e6bc941d3d3bbed985e5c4db399228dc1c8aabe381a2c057cd4", caseNumber: "04", expectedLines: 620, expectedVerdict: "weak", expectedWarnings: ["sin-saldos", "no-cierra"], sameMovements: "04" },
  { fingerprint: "bec0b4a931e40fc1b23ec35e9084fb34205e3f5053dfa02966babf1299e5f1c9", bank: "Banco Provincia de Buenos Aires", expectedVerdict: "weak", expectedWarnings: ["sin-saldos"] },
  { fingerprint: "a859ab995021d67f151703a8c42e7b7cecdd2ef9b71d231a5073443b0f504e09", bank: "Galicia", expectedLines: 712, expectedVerdict: "verified" },
  { fingerprint: "ea0583d09ab9bec79cb02c2ee0ee9259d7f10da04c06eb023e28a4ba5b88757e", bank: "Galicia", expectedLines: 300, expectedVerdict: "verified" },
  { fingerprint: "6c7f4e896e99d129340101b9265e06bc7a4374ec7ec93c8e58d84cd9cd046aa3", bank: "Galicia", expectedVerdict: "verified" },
  { fingerprint: "cb1610d47f799a531af5a06084b94eec0cd9187b9dfcb5903e0f3d5398419c09", bank: "Credicoop", expectedVerdict: "weak", expectedWarnings: ["sin-saldos"] },
  { fingerprint: "6c0b1c7623c0bc60ac6314455c362cdbda6682b159a48c38b568be5d01d8e119", bank: "Credicoop", expectedVerdict: "weak", expectedWarnings: ["sin-saldos"] },
  { fingerprint: "0544cb82a0885475c1820c0e4e8bf9067ab201094a42f6650dfb4ba56c89629b", expectedVerdict: "abstained" },
];

// Lectura visual: los PDF de junio a septiembre. Sin caso, se miden por encadenamiento y por los
// saldos impresos; el caso 01 es el Credicoop de junio. BBVA 07 a 09 traen el texto en el PDF; los
// demás se leen por OCR, a 150 dpi, y el OCR pierde el signo o la puntuación de algunos importes: no
// se reparan, y por eso esos archivos esperan weak. Lo que encadena es determinístico (dos pasadas
// dan lo mismo), y donde hay saldos que encadenan, el piso es lo medido.
export const STAGE3: BenchFile[] = [
  { fingerprint: "cc39880332fa5ff8dda3f2523f1eadae95ddf01c7149be11df8bc7118b83a265", label: "BBVA 07", bank: "BBVA Argentina", expectedVerdict: "verified", minLinesWithCuit: 4 },
  { fingerprint: "e4b5b717f7eb70cb500a294f94b82c7fc15db02cc53f54fdc97c88bc44c4a710", label: "BBVA 08", bank: "BBVA Argentina", expectedVerdict: "verified" },
  { fingerprint: "442122a1b908ced4b6f8d6f2de15a341fc4f1aa1b1af60e634d4a0aecb9ef169", label: "BBVA 09", bank: "BBVA Argentina", expectedVerdict: "verified" },
  // La fuente del PDF está rota y se lee por OCR. El OCR pierde el signo de algunos saldos: de los 7
  // renglones que no encadenan, 6 encadenan cambiándole el signo a un saldo.
  { fingerprint: "8a0ef3cf74ac6dec79b140d5528b2d6c97adcdfdb509b7d583cf7326a62cf9d9", label: "BBVA 06 (fuente rota)", bank: "BBVA Argentina", expectedVerdict: "weak", expectedWarnings: ["no-encadena", "no-cierra"], minLinesThatChain: 102, maxSeconds: 60 },
  // El OCR pierde el signo o la puntuación de algunos importes: lee saldos sin el «-» y escribe otros
  // como «9.999,999,99» o «99, 99», que no son importes. Los saldos de cierre del día encadenan menos
  // de la mitad, y el juez lee sin saldo. Contra cuenta.json, no cierra.
  { fingerprint: "7dd15e8c71142b47f2b22feb74e5d300d85f2f0cf57c94c4e7652a166765944c", label: "Credicoop 06 (caso 01)", caseNumber: "01", expectedVerdict: "weak", expectedWarnings: ["sin-saldos", "no-cierra"], minLines: 962, minLinesWithCuit: 332, maxSeconds: 300 },
  // Lo mismo que el de junio: el OCR pierde el signo o la puntuación de algunos saldos, y se controla
  // solo el total.
  { fingerprint: "932055352cd6cfe8ac89bba086ab129ef0a076341488f078d85b28570e718639", label: "Credicoop 07", bank: "Credicoop", expectedVerdict: "weak", expectedWarnings: ["sin-saldos"], minLines: 1014, minLinesWithCuit: 395, maxSeconds: 300 },
  // Lo mismo que el de junio: el OCR pierde el signo o la puntuación de algunos saldos, y los saldos
  // que quedan no encadenan con los importes.
  { fingerprint: "f035e25bf605db14b4c4e07607556976b75a6b2cbb2c7fb530546a191f1b2055", label: "Credicoop 08", bank: "Credicoop", expectedVerdict: "weak", expectedWarnings: ["sin-saldos"], minLines: 971, minLinesWithCuit: 369, maxSeconds: 300 },
  // El OCR pierde el signo de algunos importes y pega dos importes sin espacio en unas 10 filas por
  // página. A 150 dpi no queda ningún saldo por renglón: un solo saldo, nada que encadenar.
  { fingerprint: "95017b694f5ebe7161e756a2469a9e16a8d8b37a7e698ec74f79603e6299ac5a", label: "BPN 06", bank: "Banco Provincia del Neuquén", expectedVerdict: "weak", expectedWarnings: ["sin-saldos"], minLines: 378 },
  // El OCR pierde el «-» de algunos saldos: la mayoría de los renglones que no encadenan encadenan
  // cambiándole el signo a un saldo.
  { fingerprint: "0f4718f560bd8a8a2db79a3c7b9b9a02a4f02ae2cfd81b0c0cf0142be5c4bba3", label: "BPN 07", bank: "Banco Provincia del Neuquén", expectedVerdict: "weak", expectedWarnings: ["no-encadena", "no-cierra"], minLinesThatChain: 170 },
  // El OCR da cada renglón como una sola caja, de la fecha al saldo: el débito y el crédito no se
  // separan, los saldos no se leen y el signo de los importes queda sin control. Un solo saldo.
  { fingerprint: "7ec52140f9b394c60fea05c401772207660e7bceee881d0c74b4b261bab3aabd", label: "BPN 08", bank: "Banco Provincia del Neuquén", expectedVerdict: "weak", expectedWarnings: ["sin-saldos"], minLines: 193 },
  // El formato del BPN 06. El OCR pierde el signo de algunos importes y pega otros entre sí, y esos
  // renglones no encadenan.
  { fingerprint: "6651049a1eb0ce00dae977cfa2000edec1a24cb23d519db7d296e58e6a07c86d", label: "BPN 09", bank: "Banco Provincia del Neuquén", expectedVerdict: "weak", expectedWarnings: ["no-encadena", "no-cierra"], minLinesThatChain: 150 },
];

/**
 * Si los renglones salieron todos del OCR. Un concepto que viene solo de ahí puede ser una mala
 * lectura del texto: la tabla no lo tiene que cubrir, y el banco y el inventario lo informan aparte.
 */
export const fromOcr = (lines: StatementLine[]): boolean => lines.length > 0 && lines.every((l) => l.provenance.origin === "ocr");

export interface PendingConcept {
  /** El código de entidad del banco. */
  bank: string;
  /** El texto del banco normalizado, entero: un concepto que solo empieza igual sigue siendo nuevo. */
  text: string;
  reason: string;
}

/**
 * Los conceptos de los PDF con texto que no tienen un tipo claro y esperan una decisión contable. El
 * banco los informa y no falla por ellos; cuando se decida su tipo, salen de acá y entran a la tabla.
 */
export const PENDING_CONCEPTS: PendingConcept[] = [
  {
    bank: "017",
    text: "honorarios",
    reason: "Es el texto que escribió quien transfirió, no la fórmula del banco: por el texto no hay tipo.",
  },
];

export const pendingConcept = (bank: string | null, normalizedText: string): PendingConcept | undefined =>
  PENDING_CONCEPTS.find((p) => p.bank === bank && p.text === normalizedText);

export const accountOfCase = (json: Record<string, unknown>): KnownAccount => ({
  bank: json.banco as string,
  number: json.numero as string,
  cbu: json.cbu as string,
  currency: json.moneda as string,
  periodFrom: json.periodoDesde as string,
  periodTo: json.periodoHasta as string,
  openingBalance: json.saldoInicialExtracto as number,
  closingBalance: json.saldoFinalExtracto as number,
});

export interface StageFile extends BenchFile {
  path: string;
  /** El número de consulta de BDL (las cifras con que empieza el nombre), con un índice si se repite. */
  label: string;
  account: KnownAccount | undefined;
}

const consultationOf = (file: string): string => /^\d+/.exec(path.basename(file))?.[0] ?? "?";

const short = (fingerprint: string): string => `${fingerprint.slice(0, 12)}…`;

/**
 * Los archivos de la lista en la carpeta de BDL, con su cuenta. Lo que no se encuentra de una sola
 * manera (una huella que no está o que está en dos archivos, un caso sin carpeta o con dos) vuelve como
 * problema, sin nombres: los mensajes se ven en la terminal y se copian.
 */
export const locate = (root: string, list: BenchFile[]): { files: StageFile[]; problems: string[] } => {
  const examples = path.join(root, "Ejemplos Extractos");
  const cases = path.join(root, "Casos de prueba");
  const missing = [examples, cases].filter((dir) => !fs.existsSync(dir));
  if (missing.length > 0) return { files: [], problems: missing.map((dir) => `No existe la carpeta ${dir}.`) };
  const byFingerprint = new Map<string, string[]>();
  for (const name of fs.readdirSync(examples)) {
    const file = path.join(examples, name);
    if (!fs.statSync(file).isFile()) continue;
    const fingerprint = fingerprintOf(fs.readFileSync(file));
    byFingerprint.set(fingerprint, [...(byFingerprint.get(fingerprint) ?? []), file]);
  }
  const caseDirs = fs.readdirSync(cases).filter((name) => fs.statSync(path.join(cases, name)).isDirectory());

  const problems: string[] = [];
  const found: { bench: BenchFile; path: string; account: KnownAccount | undefined }[] = [];
  list.forEach((bench, k) => {
    const paths = byFingerprint.get(bench.fingerprint) ?? [];
    if (paths.length === 0) {
      problems.push(`El archivo ${k + 1} de la etapa (huella ${short(bench.fingerprint)}) no está en ${examples}.`);
      return;
    }
    if (paths.length > 1) {
      problems.push(`La huella ${short(bench.fingerprint)} está en ${paths.length} archivos (${paths.map(consultationOf).join(", ")}): no se sabe cuál medir.`);
      return;
    }
    let account: KnownAccount | undefined = bench.bank ? { bank: bench.bank } : undefined;
    if (bench.caseNumber !== undefined) {
      const dirs = caseDirs.filter((name) => name.startsWith(`${bench.caseNumber} `));
      if (dirs.length !== 1) {
        problems.push(
          dirs.length === 0
            ? `El caso ${bench.caseNumber} no tiene carpeta en ${cases}.`
            : `El caso ${bench.caseNumber} tiene ${dirs.length} carpetas en ${cases}: no se sabe cuál usar.`,
        );
        return;
      }
      const json = path.join(cases, dirs[0], "cuenta.json");
      if (!fs.existsSync(json)) {
        problems.push(`La carpeta del caso ${bench.caseNumber} no tiene cuenta.json.`);
        return;
      }
      account = accountOfCase(JSON.parse(fs.readFileSync(json, "utf8")));
    }
    found.push({ bench, path: paths[0], account });
  });

  const total = new Map<string, number>();
  for (const f of found) total.set(consultationOf(f.path), (total.get(consultationOf(f.path)) ?? 0) + 1);
  const seen = new Map<string, number>();
  const files = found.map(({ bench, path: file, account }) => {
    const number = consultationOf(file);
    seen.set(number, (seen.get(number) ?? 0) + 1);
    return { ...bench, path: file, account, label: bench.label ?? (total.get(number)! > 1 ? `${number} #${seen.get(number)}` : number) };
  });
  return { files, problems };
};
