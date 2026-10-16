// El banco del apareo: lee el extracto de cada caso de BDL, concilia con sus datos y compara por
// conjunto (ProntoNet no guarda el renglón). Imprime solo conteos y porcentajes: ningún dato del caso.
import * as fs from "fs";
import * as path from "path";
import { readStatement } from "../src/readStatement";
import { reconcile } from "../src/reconcile/reconcile";
import { parseReconcileRequest } from "../src/reconcile/request";
import { checkCase, extractFileOf, type CaseFloors } from "./apareoCriteria";

process.env.AP_PADDLE_MODELS_DIR ??= path.join(__dirname, "../node_modules/@agilmind/lectura/modelos/paddle-latin-v5");
const ROOT = process.env.AB_IEB_DIR ?? "/Volumes/Warehouse/agilerp-datasets/AgilBank/entregas-bdl/2026-10-08-ieb";
const BUDGET_MS = process.env.AB_BENCH_BUDGET_MS ? Number(process.env.AB_BENCH_BUDGET_MS) : undefined;

/** Los casos y sus pisos. Pisos de la medición con las reglas abiertas (15-10-2026: la ventana en dos tramos, primero la fecha de referencia y después cualquiera; importe único en el período, al final y contado en todo el extracto y todo el pedido; tercero en un valor de transferencia), redondeados para abajo al punto. */
const CASES: Array<{ n: string; floors: CaseFloors }> = [
  { n: "01", floors: { coverage: 0.92, precision: 1, approved: true } },
  { n: "02", floors: { coverage: 0.99, precision: 0, approved: false } },
  { n: "03", floors: { coverage: 0.91, precision: 1, approved: false } },
  { n: "04", floors: { coverage: 0.96, precision: 1, approved: true } },
];

const main = async (): Promise<void> => {
  if (!fs.existsSync(ROOT)) { console.error(`No encuentro los materiales de BDL en ${ROOT}.`); process.exit(2); }
  const failures: string[] = [];
  console.log("caso | renglones | veredicto | apareos | a revisar | pendientes | cobertura | precisión | ms");
  for (const c of CASES) {
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
    const parsed = parseReconcileRequest({ valores: json("valores_pendientes.json").valores, contrapartes: { proveedores: cp.proveedores ?? [], clientes: cp.clientes ?? [] }, cuentasPropias: json("catalogos.json").cuentasBancariasPropias ?? [] });
    if (!parsed.ok) { failures.push(`caso ${c.n}: el pedido no valida (${parsed.field})`); continue; }
    const readingWarning = reading.warnings.some((w) => w.code === "no-cierra" || w.code === "lectura-parcial");
    const out = reconcile({ lines: reading.lines, context: parsed.context, batches: [], readingWarning, bankCode: reading.header?.bankCode ?? null, decisions: [] });
    const ms = Date.now() - t0;
    const matched = new Set(out.proposals.flatMap((p) => (p.kind === "match" ? p.valueIds : [])));
    const exp = json("resultado_esperado.json");
    const expected = { inStatement: new Set<string>(exp.valoresEnExtracto.map(String)), notInStatement: new Set<string>(exp.valoresNoEnExtracto.map(String)) };
    const count = (k: string) => out.proposals.filter((p) => p.kind === k).length;
    const found = [...expected.inStatement].filter((id) => matched.has(id)).length;
    const right = [...matched].filter((id) => expected.inStatement.has(id)).length;
    console.log(`${c.n} | ${reading.lines.length} | ${reading.verdict} | ${count("match")} | ${count("review")} | ${count("pending")} | ${(100 * found / Math.max(1, expected.inStatement.size)).toFixed(1)} % | ${c.floors.approved ? `${(100 * right / Math.max(1, matched.size)).toFixed(1)} %` : "(sin aprobar)"} | ${ms}`);
    failures.push(...checkCase({ matched }, expected, c.floors).map((f) => `caso ${c.n}: ${f}`));
  }
  if (failures.length > 0) { console.log(`✗ ${failures.length} criterios sin cumplir:\n  ${failures.join("\n  ")}`); process.exitCode = 1; }
  else console.log("✓ Se cumplen los criterios del apareo.");
};

main().catch((e) => { console.error(e); process.exitCode = 1; });
