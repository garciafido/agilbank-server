// Los conceptos de los extractos de la etapa que todavía no están en la tabla común, agrupados por
// banco y por texto normalizado, con cuántas veces aparecen, con qué signo y qué tipo les puso una
// regla. La primera lista es la de trabajo para completar src/catalog/synonyms.json: los conceptos de
// las planillas, los textos y los PDF con texto. La segunda, los que salieron solo del OCR, es
// informativa: un texto mal leído no va a la tabla. Un concepto que aparece por los dos caminos va en
// la primera.
import * as fs from "fs";
import { readStatement } from "../src/readStatement";
import type { StatementLine } from "../src/types";
import { normalizeConcept } from "../src/values";
import { STAGE2, STAGE3, fromOcr, locate } from "./files";

const ROOT = process.env.AB_IEB_DIR ?? "/Volumes/Warehouse/agilerp-datasets/AgilBank/entregas-bdl/2026-10-08-ieb";

interface Row {
  bank: string;
  code: string | null;
  sample: string;
  count: number;
  plus: number;
  minus: number;
  proposed: string;
  lines: StatementLine[];
}

const print = (title: string, rows: Row[]): void => {
  console.log(`\n${title}: ${rows.length}`);
  for (const r of rows) console.log(`${r.bank} | ${r.code ?? "-"} | ${r.sample} | ${r.count} (+${r.plus} −${r.minus}) | ${r.proposed}`);
};

const main = async (): Promise<void> => {
  if (!fs.existsSync(ROOT)) {
    console.error(`No encuentro los materiales de BDL en ${ROOT}.`);
    process.exit(2);
  }
  const { files, problems } = locate(ROOT, [...STAGE2, ...STAGE3]);
  if (problems.length > 0) {
    console.error(`No se pueden ubicar los extractos de la etapa:\n  ${problems.join("\n  ")}`);
    process.exit(2);
  }
  const rows = new Map<string, Row>();
  for (const f of files) {
    const r = await readStatement(fs.readFileSync(f.path), { account: f.account });
    for (const l of r.lines) {
      if (l.type.source !== "rule" && l.type.source !== "none") continue;
      const bank = r.header?.bankCode ?? "?";
      const key = `${bank}|${l.bank.code ?? ""}|${normalizeConcept(l.bank.text)}`;
      const row = rows.get(key) ?? { bank, code: l.bank.code, sample: l.bank.text, count: 0, plus: 0, minus: 0, proposed: l.type.code, lines: [] };
      row.count++;
      if (l.amountCents >= 0) row.plus++;
      else row.minus++;
      row.lines.push(l);
      rows.set(key, row);
    }
  }
  const list = [...rows.values()].sort((a, b) => a.bank.localeCompare(b.bank) || b.count - a.count);
  print("Conceptos fuera de la tabla, que la tabla tiene que cubrir", list.filter((r) => !fromOcr(r.lines)));
  print("Conceptos fuera de la tabla leídos solo por OCR (informativo)", list.filter((r) => fromOcr(r.lines)));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
