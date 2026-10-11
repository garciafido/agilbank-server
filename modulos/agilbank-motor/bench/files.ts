// Los extractos de la etapa y lo que se espera de cada uno. Los nombres de los archivos y de las
// carpetas de los casos llevan datos de los clientes, y lo commiteado acá viaja a todos los productos:
// un archivo se reconoce por su huella y un caso por su número, y los nombres se buscan al correr.
import * as fs from "fs";
import * as path from "path";
import { fingerprintOf } from "../src/identity";
import type { KnownAccount, WarningCode } from "../src/types";

export interface BenchFile {
  /** La huella del archivo (el SHA-256 de sus bytes), en «Ejemplos Extractos». */
  fingerprint: string;
  /** El número del caso en «Casos de prueba», si lo hay: de su cuenta.json sale la cuenta. */
  caseNumber?: string;
  /** Sin caso, el banco por su nombre, para que se usen sus sinónimos. */
  bank?: string;
  expectedLines?: number;
  expectedVerdict: "verified" | "weak" | "abstained";
  expectedWarnings?: WarningCode[];
  /** Los archivos con la misma marca traen los mismos movimientos por dos canales: tienen que dar los mismos ids. */
  sameMovements?: string;
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
 * Los archivos de la etapa en la carpeta de BDL, con su cuenta. Lo que no se encuentra de una sola
 * manera (una huella que no está o que está en dos archivos, un caso sin carpeta o con dos) vuelve como
 * problema, sin nombres: los mensajes se ven en la terminal y se copian.
 */
export const locateStage2 = (root: string): { files: StageFile[]; problems: string[] } => {
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
  STAGE2.forEach((bench, k) => {
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
    return { ...bench, path: file, account, label: total.get(number)! > 1 ? `${number} #${seen.get(number)}` : number };
  });
  return { files, problems };
};
