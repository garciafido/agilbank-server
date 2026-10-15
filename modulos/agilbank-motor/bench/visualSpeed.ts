// La resolución del OCR: lee cada archivo a 150 y a 200 dpi, intercalados (150, 200, 150, 200) para que
// las dos midan bajo la misma carga, y compara lo leído. La resolución se decide por la calidad, que no
// depende de la carga; los tiempos valen solo relativos entre sí, con la carga al lado (spec, enmienda
// de la etapa 3, punto 5). Sin el techo de producción: con la máquina cargada cortaría la lectura y la
// calidad se mezclaría con la velocidad. Imprime cantidades y etiquetas, nunca datos del extracto.
import * as fs from "fs";
import * as os from "os";
import { contarPaginasPdf } from "@agilmind/lectura";
import { readStatement } from "../src/readStatement";
import type { StatementLine, StatementReading } from "../src/types";
import { locate, STAGE3 } from "./files";

const ROOT = process.env.AB_IEB_DIR ?? "/Volumes/Warehouse/agilerp-datasets/AgilBank/entregas-bdl/2026-10-08-ieb";
const WHICH = (process.env.AB_VISUAL_FILES ?? "Credicoop 06 (caso 01),BBVA 06 (fuente rota),BPN 06,BPN 08,BPN 09").split(",");
const PASSES = Number(process.env.AB_VISUAL_PASSES ?? 2);
const sameOrNa = (same: boolean | undefined): string => (PASSES < 2 ? "n/a" : same ? "sí" : "no");
const DPIS = [150, 200];
const NO_CEILING_MS = 3_600_000;
const PUNCTUATION = /[.,:;\/\-()]/g;

const load = (): string => os.loadavg()[0].toFixed(1);

const keyOf = (l: StatementLine): string => `${l.date}|${l.amountCents}|${l.balanceCents}`;
const textOf = (l: StatementLine): string => [l.bank.code ?? "", l.bank.text, ...l.bank.extras, l.reference ?? ""].join(" ");

/** Lo que distingue una lectura de otra, sin datos: dos lecturas iguales dan la misma firma. */
const signatureOf = (r: StatementReading): string => JSON.stringify([r.verdict, r.lines.map((l) => [keyOf(l), textOf(l), l.chains])]);

/** Cuántos renglones de b tienen en a uno con la misma fecha, importe y saldo. */
const shared = (a: StatementLine[], b: StatementLine[]): number => {
  const left = new Map<string, number>();
  for (const l of a) left.set(keyOf(l), (left.get(keyOf(l)) ?? 0) + 1);
  let n = 0;
  for (const l of b) {
    const k = keyOf(l);
    if ((left.get(k) ?? 0) > 0) {
      left.set(k, left.get(k)! - 1);
      n++;
    }
  }
  return n;
};

const main = async (): Promise<void> => {
  if (!Number.isInteger(PASSES) || PASSES < 1) {
    console.error(`AB_VISUAL_PASSES tiene que ser un entero positivo; vino «${process.env.AB_VISUAL_PASSES}».`);
    process.exitCode = 2;
    return;
  }
  const { files, problems } = locate(ROOT, STAGE3.filter((f) => WHICH.includes(f.label ?? "")));
  if (problems.length > 0 || files.length !== WHICH.length) {
    console.error(problems.length > 0 ? problems.join("\n") : `Se pidieron ${WHICH.length} archivos y se ubicaron ${files.length}.`);
    process.exitCode = 2;
    return;
  }
  console.log(`carga al empezar: ${load()} · ${os.cpus().length} núcleos · ${PASSES} pasadas por resolución, intercaladas`);
  console.log("archivo | dpi | pasada | carga antes/después | s | páginas | renglones | encadenan | veredicto | avisos | negativos | puntuación");
  const summary: string[] = [];
  for (const f of files) {
    const file = fs.readFileSync(f.path);
    const pages = await contarPaginasPdf(file);
    const seconds = new Map<number, number[]>(DPIS.map((d) => [d, []]));
    const first = new Map<number, StatementReading>();
    const stable = new Map<number, boolean>(DPIS.map((d) => [d, true]));
    for (let pass = 1; pass <= PASSES; pass++) {
      for (const dpi of DPIS) {
        const before = load();
        const t0 = Date.now();
        const r = await readStatement(file, { account: f.account, visual: { dpi, budgetMs: NO_CEILING_MS } });
        const s = (Date.now() - t0) / 1000;
        seconds.get(dpi)!.push(s);
        if (!first.has(dpi)) first.set(dpi, r);
        else if (signatureOf(first.get(dpi)!) !== signatureOf(r)) stable.set(dpi, false);
        const chain = r.checks ? `${r.checks.linesThatChain}/${r.checks.linesWithBalance}` : "-";
        const codes = [...new Set(r.warnings.map((w) => w.code))].join(", ") || "-";
        const negatives = r.lines.filter((l) => l.amountCents < 0).length;
        const punctuation = r.lines.reduce((n, l) => n + (textOf(l).match(PUNCTUATION)?.length ?? 0), 0);
        console.log(`${f.label} | ${dpi} | ${pass} | ${before}/${load()} | ${s.toFixed(0)} | ${pages ?? "-"} | ${r.lines.length} | ${chain} | ${r.verdict} | ${codes} | ${negatives} | ${punctuation}`);
      }
    }
    const [low, high] = DPIS.map((d) => first.get(d)!);
    const mean = (d: number): number => seconds.get(d)!.reduce((a, b) => a + b, 0) / seconds.get(d)!.length;
    const sameText = low.lines.length === high.lines.length && low.lines.every((l, i) => textOf(l) === textOf(high.lines[i]));
    summary.push(
      `${f.label}: comunes por fecha, importe y saldo ${shared(low.lines, high.lines)} de ${low.lines.length} (150) y ${high.lines.length} (200)` +
        ` · textos iguales: ${sameText ? "sí" : "no"} · 200/150 = ${(mean(200) / mean(150)).toFixed(2)}` +
        ` (${mean(150).toFixed(0)} s y ${mean(200).toFixed(0)} s) · pasadas iguales: 150 ${sameOrNa(stable.get(150))}, 200 ${sameOrNa(stable.get(200))}`,
    );
  }
  console.log(`\n${summary.join("\n")}\ncarga al terminar: ${load()}`);
};

main().catch((e) => {
  console.error(e);
  // Sin process.exit: cortado con los hilos del OCR vivos, onnxruntime aborta y la salida es 134.
  process.exitCode = 1;
});
