// El banco de DBG: lee el extracto de cada caso de BDL, concilia en arranque en frío (sin decisiones, con la historia
// y los catálogos del caso) y mide qué parte de la familia banco sale como dbg y qué parte del importe lleva la cuenta
// correcta. Imprime solo conteos y porcentajes: ningún dato del caso.
import * as fs from "fs";
import * as path from "path";
import { catalog } from "../src/catalog/catalog";
import { readStatement } from "../src/readStatement";
import { reconcile } from "../src/reconcile/reconcile";
import { parseReconcileRequest } from "../src/reconcile/request";
import { extractFileOf } from "./apareoCriteria";
import { abortLine, amountShare, checkDbgCase, dbgShareOf, type DbgFloors } from "./dbgCriteria";

process.env.AP_PADDLE_MODELS_DIR ??= path.join(__dirname, "../node_modules/@agilmind/lectura/modelos/paddle-latin-v5");
const ROOT = process.env.AB_IEB_DIR ?? "/Volumes/Warehouse/agilerp-datasets/AgilBank/entregas-bdl/2026-10-08-ieb";
const BUDGET_MS = process.env.AB_BENCH_BUDGET_MS ? Number(process.env.AB_BENCH_BUDGET_MS) : undefined;
const DIAG = process.env.AB_BENCH_DIAG === "1";

/** Los casos y sus pisos: lo medido el 16-10-2026 en arranque en frío, redondeado para abajo al punto entero. El importe de 01 queda bajo 50 %: es un hallazgo, no un piso que se baje. */
const CASES: Array<{ n: string; floors: DbgFloors }> = [
  { n: "01", floors: { amountShare: 0.48, dbgShare: 0.99, approved: true } },
  { n: "02", floors: { amountShare: 0.85, dbgShare: 1, approved: false } },
  { n: "03", floors: { amountShare: 0.88, dbgShare: 1, approved: false } },
  { n: "04", floors: { amountShare: 0.88, dbgShare: 0.96, approved: true } },
];

const FAMILY = new Map(catalog.types.map((t) => [t.code, t.family]));
const pct = (x: number) => `${(100 * x).toFixed(1)} %`;
const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
let current: string | null = null;

const main = async (): Promise<void> => {
  if (!fs.existsSync(ROOT)) { console.error("No encuentro los materiales de BDL (AB_IEB_DIR)."); process.exit(2); }
  const failures: string[] = [];
  console.log("caso | renglones banco | dbg | pendientes (motor) | pendientes (caso) | importe con cuenta correcta | cuentas esperadas / acertadas | ms");
  for (const c of CASES) {
    current = c.n;
    const dir = fs.readdirSync(path.join(ROOT, "Casos de prueba")).find((d) => d.startsWith(c.n));
    if (!dir) { failures.push(`caso ${c.n}: no está la carpeta`); continue; }
    const cd = path.join(ROOT, "Casos de prueba", dir);
    const json = (f: string) => JSON.parse(fs.readFileSync(path.join(cd, f), "utf8"));
    // El nombre del extracto viene de los materiales del caso, no del código: trae datos del cliente.
    const extract = extractFileOf(fs.readFileSync(path.join(cd, "caso.md"), "utf8"));
    if (!extract) { failures.push(`caso ${c.n}: el caso.md no dice cuál es su extracto (fila «Extracto»)`); continue; }
    const t0 = Date.now();
    const reading = await readStatement(fs.readFileSync(path.join(ROOT, "Ejemplos Extractos", extract)), { fileName: extract, visual: BUDGET_MS === undefined ? undefined : { budgetMs: BUDGET_MS } });
    const cp = json("contrapartes.json");
    const cat = json("catalogos.json");
    const parsed = parseReconcileRequest({
      valores: json("valores_pendientes.json").valores,
      contrapartes: { proveedores: cp.proveedores ?? [], clientes: cp.clientes ?? [] },
      cuentasPropias: cat.cuentasBancariasPropias ?? [],
      tiposGastoBancario: cat.tiposGastoBancario, cuentasImputables: cat.cuentasImputables, cuentasIvaYPercepciones: cat.cuentasIvaYPercepciones,
      historiaDbg: json("historia_dbg.json"),
    });
    if (!parsed.ok) { failures.push(`caso ${c.n}: el pedido no valida (${parsed.field})`); continue; }
    const readingWarning = reading.warnings.some((w) => w.code === "no-cierra" || w.code === "lectura-parcial");
    const bankCode = reading.header?.bankCode ?? null;
    const out = reconcile({ lines: reading.lines, context: parsed.context, batches: [], readingWarning, bankCode, decisions: [] });
    const ms = Date.now() - t0;

    const codeOf = new Map([...(parsed.context.catalogs?.accounts ?? []), ...(parsed.context.catalogs?.taxAccounts ?? [])].map((a) => [a.id, a.code]));
    const bankLines = reading.lines.filter((l) => FAMILY.get(l.type.code) === "banco");
    const bankIds = new Set(bankLines.map((l) => l.id));
    const dbgs = out.proposals.flatMap((p) => (p.kind === "dbg" ? [p] : []));
    const dbgLineIds = new Set(dbgs.flatMap((p) => p.groupLineIds).filter((id) => bankIds.has(id)));
    const groups = new Map(dbgs.map((p) => [p.groupLineIds[0], p]));
    const byAccount = new Map<string, number>();
    for (const g of groups.values()) {
      const code = g.pair.accountId === null ? undefined : codeOf.get(g.pair.accountId);
      if (code !== undefined) add(byAccount, code, g.amountCents);
    }
    const pendingLines = new Set(out.proposals.flatMap((p) => (p.kind === "pending" ? [p.lineId] : []))).size;

    const exp = json("resultado_esperado.json");
    const expByAccount = new Map<string, number>();
    for (const d of exp.dbgCargados) add(expByAccount, String(d.cuentaContableCodigo), Math.round(d.importe * 100));
    const expPending: number = exp.pendientesDeContabilidad.length;

    const result = { byAccount, dbgLines: dbgLineIds.size, bankLines: bankLines.length, pendingLines };
    const share = amountShare(byAccount, expByAccount);
    const hits = [...expByAccount].filter(([code, cents]) => Math.abs(byAccount.get(code) ?? 0) >= Math.abs(cents)).length;
    console.log(`${c.n} | ${bankLines.length} | ${dbgLineIds.size} (${pct(dbgShareOf(result))}) | ${pendingLines} | ${expPending} | ${c.floors.approved ? pct(share) : `${pct(share)} (sin aprobar)`} | ${expByAccount.size} / ${hits} | ${ms}`);

    if (DIAG) {
      const types = new Map<string, { total: number; dbg: number; pending: number }>();
      const pendingIds = new Set(out.proposals.flatMap((p) => (p.kind === "pending" ? [p.lineId] : [])));
      for (const l of bankLines) {
        const t = types.get(l.type.code) ?? { total: 0, dbg: 0, pending: 0 };
        t.total++; if (dbgLineIds.has(l.id)) t.dbg++; if (pendingIds.has(l.id)) t.pending++;
        types.set(l.type.code, t);
      }
      for (const [code, t] of types) console.log(`  tipo ${code}: ${t.total} renglones, ${t.dbg} dbg, ${t.pending} pendientes`);
      const inHistory = new Set(parsed.context.history.map((h) => h.accountCode));
      const inCatalog = new Set(codeOf.values());
      for (const [code, cents] of expByAccount) {
        const got = Math.abs(byAccount.get(code) ?? 0);
        if (got >= Math.abs(cents)) continue;
        console.log(`  cuenta esperada sin cubrir: en la historia ${inHistory.has(code) ? "sí" : "no"}, en el catálogo ${inCatalog.has(code) ? "sí" : "no"}, cubierta ${pct(got / Math.abs(cents))}`);
      }
    }
    failures.push(...checkDbgCase(result, { byAccount: expByAccount, pendingLines: expPending }, c.floors).map((f) => `caso ${c.n}: ${f}`));
  }
  if (failures.length > 0) { console.log(`✗ ${failures.length} criterios sin cumplir:\n  ${failures.join("\n  ")}`); process.exitCode = 1; }
  else console.log("✓ Se cumplen los criterios del banco de DBG.");
};

main().catch((e) => { console.error(abortLine(e, current)); process.exitCode = 1; });
