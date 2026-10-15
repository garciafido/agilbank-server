// El banco de medición de la lectura: recorre los extractos de la etapa, informa por archivo y sale
// con error si no se cumple lo que la spec pide (§8). Nunca se saltea en silencio: sin la carpeta de
// BDL, falla diciendo dónde la buscó.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { readStatement } from "../src/readStatement";
import { normalizeConcept } from "../src/values";
import { catalog } from "../src/catalog/catalog";
import { checkFile, pendingInTable } from "./criteria";
import { PENDING_CONCEPTS, STAGE2, STAGE3, fromOcr, locate, pendingConcept, type PendingConcept } from "./files";

const ROOT = process.env.AB_IEB_DIR ?? "/Volumes/Warehouse/agilerp-datasets/AgilBank/entregas-bdl/2026-10-08-ieb";
// Con la máquina cargada, el techo de tiempo de producción corta la lectura y la calidad se mezcla con
// la velocidad: AB_BENCH_BUDGET_MS lo sube para medir solo la lectura. maxSeconds se chequea igual.
const BUDGET_MS = process.env.AB_BENCH_BUDGET_MS ? Number(process.env.AB_BENCH_BUDGET_MS) : undefined;
// Producción lee con los modelos latinos (los Dockerfiles fijan la variable); sin ella PP-OCR carga los
// de fábrica y el banco mide otra lectura.
process.env.AP_PADDLE_MODELS_DIR ??= path.join(__dirname, "../node_modules/@agilmind/lectura/modelos/paddle-latin-v5");

const money = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amount = (cents: number | null | undefined): string => (cents === null || cents === undefined ? "-" : money.format(cents / 100));
const pair = (opening: number | null | undefined, closing: number | null | undefined): string => `${amount(opening)} / ${amount(closing)}`;
const toCents = (pesos: number | null | undefined): number | null => (typeof pesos === "number" ? Math.round(pesos * 100) : null);

const main = async (): Promise<void> => {
  if (!fs.existsSync(ROOT)) {
    console.error(`No encuentro los materiales de BDL en ${ROOT}. Montá el Warehouse o pasá AB_IEB_DIR.`);
    process.exit(2);
  }
  const { files, problems } = locate(ROOT, [...STAGE2, ...STAGE3]);
  if (problems.length > 0) {
    console.error(`No se pueden ubicar los extractos de la etapa:\n  ${problems.join("\n  ")}`);
    process.exit(2);
  }
  const failures: string[] = pendingInTable(PENDING_CONCEPTS, catalog).map((p) => `«${p.text}» del banco ${p.bank} ya está en la tabla: sacarlo de PENDING_CONCEPTS`);
  const idsBySameMovements = new Map<string, Array<{ label: string; ids: Set<string> }>>();
  let newConcepts = 0;
  let newOcrConcepts = 0;
  const pending = new Map<PendingConcept, number>();
  const timeWarnings: string[] = [];
  const load = os.loadavg()[0];
  console.log(`carga: ${load.toFixed(2)} · techo de la lectura visual: ${BUDGET_MS === undefined ? "el de producción" : `${BUDGET_MS} ms`} · modelos: ${process.env.AP_PADDLE_MODELS_DIR}`);
  console.log("consulta | renglones (esperados) | encadenan | con CUIT | páginas | veredicto | avisos | ms");
  for (const f of files) {
    const file = fs.readFileSync(f.path);
    const t0 = Date.now();
    const r = await readStatement(file, { account: f.account, fileName: path.basename(f.path), visual: BUDGET_MS === undefined ? undefined : { budgetMs: BUDGET_MS } });
    const ms = Date.now() - t0;
    const codes = [...new Set(r.warnings.map((w) => w.code))];
    const chain = r.checks ? `${r.checks.linesThatChain}/${r.checks.linesWithBalance}` : "-";
    const withCuit = r.lines.filter((l) => l.counterparty?.cuit).length;
    const partial = r.warnings.find((w) => w.code === "lectura-parcial")?.data;
    const pages = partial ? `${partial.paginasLeidas}/${partial.paginas}` : "-";
    console.log(`${f.label} | ${r.lines.length} (${f.expectedLines ?? "-"}) | ${chain} | ${withCuit} | ${pages} | ${r.verdict} | ${codes.join(", ") || "-"} | ${ms}`);
    if (r.reason) console.log(`   motivo: ${r.reason}`);
    if (r.checks) {
      const read = pair(r.checks.lineBalances.openingCents, r.checks.lineBalances.closingCents);
      const printed = pair(r.checks.printedBalances.openingCents, r.checks.printedBalances.closingCents);
      const known = f.caseNumber === undefined ? "" : ` · cuenta.json ${pair(toCents(f.account?.openingBalance), toCents(f.account?.closingBalance))}`;
      console.log(`   saldos inicial / final: de los renglones ${read} · impresos ${printed}${known}`);
    }
    for (const w of r.warnings.filter((x) => x.code !== "concepto-nuevo")) console.log(`   ${w.code}: ${w.detail}`);
    for (const w of r.warnings.filter((x) => x.code === "concepto-nuevo")) {
      const orders = new Set(w.lines ?? []);
      const p = pendingConcept(r.header?.bankCode ?? null, normalizeConcept(String(w.data?.texto ?? "")));
      if (fromOcr(r.lines.filter((l) => orders.has(l.order)))) newOcrConcepts++;
      else if (p) pending.set(p, (pending.get(p) ?? 0) + 1);
      else newConcepts++;
    }
    const checked = checkFile(f, { lines: r.lines.length, withCuit, chained: r.checks?.linesThatChain ?? 0, verdict: r.verdict, codes, ms }, load);
    failures.push(...checked.failures);
    timeWarnings.push(...checked.timeWarnings);
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
  if (timeWarnings.length > 0) console.log(`Con carga ${load.toFixed(2)} al empezar, el techo de tiempo no es criterio (el doble del techo sí):\n  ${timeWarnings.join("\n  ")}`);
  for (const p of PENDING_CONCEPTS.filter((x) => pending.has(x))) {
    console.log(`Concepto pendiente de una decisión: «${p.text}» del banco ${p.bank}, en ${pending.get(p)} avisos. ${p.reason}`);
  }
  if (newOcrConcepts > 0) console.log(`${newOcrConcepts} conceptos de las lecturas por OCR fuera de la tabla (informativo)`);
  if (newConcepts > 0) failures.push(`${newConcepts} conceptos fuera de la tabla: correr npm run inventory y completarla`);
  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} criterios sin cumplir:\n  ${failures.join("\n  ")}`);
    // Sin process.exit: cortado con los hilos del OCR vivos, onnxruntime aborta y la salida es 134.
    process.exitCode = 1;
    return;
  }
  console.log("\n✓ Se cumplen los criterios de las etapas 2 y 3.");
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
