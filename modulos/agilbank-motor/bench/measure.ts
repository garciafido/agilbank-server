// El banco de medición de la lectura: recorre los extractos de la etapa, informa por archivo y sale
// con error si no se cumple lo que la spec pide (§8). Nunca se saltea en silencio: sin la carpeta de
// BDL, falla diciendo dónde la buscó.
import * as fs from "fs";
import * as path from "path";
import { readStatement } from "../src/readStatement";
import { locateStage2 } from "./files";

const ROOT = process.env.AB_IEB_DIR ?? "/Volumes/Warehouse/agilerp-datasets/AgilBank/entregas-bdl/2026-10-08-ieb";

const money = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amount = (cents: number | null | undefined): string => (cents === null || cents === undefined ? "-" : money.format(cents / 100));
const pair = (opening: number | null | undefined, closing: number | null | undefined): string => `${amount(opening)} / ${amount(closing)}`;
const toCents = (pesos: number | null | undefined): number | null => (typeof pesos === "number" ? Math.round(pesos * 100) : null);

const main = async (): Promise<void> => {
  if (!fs.existsSync(ROOT)) {
    console.error(`No encuentro los materiales de BDL en ${ROOT}. Montá el Warehouse o pasá AB_IEB_DIR.`);
    process.exit(2);
  }
  const { files, problems } = locateStage2(ROOT);
  if (problems.length > 0) {
    console.error(`No se pueden ubicar los extractos de la etapa:\n  ${problems.join("\n  ")}`);
    process.exit(2);
  }
  const failures: string[] = [];
  const idsBySameMovements = new Map<string, Array<{ label: string; ids: Set<string> }>>();
  let newConcepts = 0;
  console.log("consulta | renglones (esperados) | encadenan | veredicto | avisos | ms");
  for (const f of files) {
    const file = fs.readFileSync(f.path);
    const t0 = Date.now();
    const r = await readStatement(file, { account: f.account, fileName: path.basename(f.path) });
    const ms = Date.now() - t0;
    const codes = [...new Set(r.warnings.map((w) => w.code))];
    const chain = r.checks ? `${r.checks.linesThatChain}/${r.checks.linesWithBalance}` : "-";
    console.log(`${f.label} | ${r.lines.length} (${f.expectedLines ?? "-"}) | ${chain} | ${r.verdict} | ${codes.join(", ") || "-"} | ${ms}`);
    if (r.reason) console.log(`   motivo: ${r.reason}`);
    if (r.checks) {
      const read = pair(r.checks.lineBalances.openingCents, r.checks.lineBalances.closingCents);
      const printed = pair(r.checks.printedBalances.openingCents, r.checks.printedBalances.closingCents);
      const known = f.caseNumber === undefined ? "" : ` · cuenta.json ${pair(toCents(f.account?.openingBalance), toCents(f.account?.closingBalance))}`;
      console.log(`   saldos inicial / final: de los renglones ${read} · impresos ${printed}${known}`);
    }
    for (const w of r.warnings.filter((x) => x.code !== "concepto-nuevo")) console.log(`   ${w.code}: ${w.detail}`);
    newConcepts += r.warnings.filter((w) => w.code === "concepto-nuevo").length;
    if (f.expectedLines !== undefined && r.lines.length !== f.expectedLines) failures.push(`${f.label}: ${r.lines.length} renglones, se esperaban ${f.expectedLines}`);
    if (r.verdict !== f.expectedVerdict) failures.push(`${f.label}: ${r.verdict}, se esperaba ${f.expectedVerdict}`);
    for (const w of f.expectedWarnings ?? []) if (!codes.includes(w)) failures.push(`${f.label}: falta el aviso ${w}`);
    if (f.sameMovements !== undefined) {
      const group = idsBySameMovements.get(f.sameMovements) ?? [];
      group.push({ label: f.label, ids: new Set(r.lines.map((l) => l.id)) });
      idsBySameMovements.set(f.sameMovements, group);
    }
  }
  for (const [first, ...others] of idsBySameMovements.values()) {
    for (const other of others) {
      const shared = [...first.ids].filter((id) => other.ids.has(id)).length;
      const total = Math.max(first.ids.size, other.ids.size);
      console.log(`${first.label} y ${other.label}: ${shared} de ${total} ids en común`);
      if (shared !== total) failures.push(`${first.label} y ${other.label} traen los mismos movimientos y comparten ${shared} de ${total} ids`);
    }
  }
  if (newConcepts > 0) failures.push(`${newConcepts} conceptos fuera de la tabla: correr npm run inventory y completarla`);
  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} criterios sin cumplir:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log("\n✓ Se cumplen los criterios de la etapa 2.");
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
