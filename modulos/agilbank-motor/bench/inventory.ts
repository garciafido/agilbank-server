// Los conceptos de los extractos de la etapa que todavía no están en la tabla común, agrupados por
// banco y por texto normalizado, con cuántas veces aparecen, con qué signo y qué tipo les puso una
// regla. Es la lista de trabajo para completar src/catalog/synonyms.json.
import * as fs from "fs";
import { readStatement } from "../src/readStatement";
import { normalizeConcept } from "../src/values";
import { locateStage2 } from "./files";

const ROOT = process.env.AB_IEB_DIR ?? "/Volumes/Warehouse/agilerp-datasets/AgilBank/entregas-bdl/2026-10-08-ieb";

const main = async (): Promise<void> => {
  if (!fs.existsSync(ROOT)) {
    console.error(`No encuentro los materiales de BDL en ${ROOT}.`);
    process.exit(2);
  }
  const { files, problems } = locateStage2(ROOT);
  if (problems.length > 0) {
    console.error(`No se pueden ubicar los extractos de la etapa:\n  ${problems.join("\n  ")}`);
    process.exit(2);
  }
  const rows = new Map<string, { bank: string; code: string | null; sample: string; count: number; plus: number; minus: number; proposed: string }>();
  for (const f of files) {
    const r = await readStatement(fs.readFileSync(f.path), { account: f.account });
    for (const l of r.lines) {
      if (l.type.source !== "rule" && l.type.source !== "none") continue;
      const bank = r.header?.bankCode ?? "?";
      const key = `${bank}|${l.bank.code ?? ""}|${normalizeConcept(l.bank.text)}`;
      const row = rows.get(key) ?? { bank, code: l.bank.code, sample: l.bank.text, count: 0, plus: 0, minus: 0, proposed: l.type.code };
      row.count++;
      if (l.amountCents >= 0) row.plus++;
      else row.minus++;
      rows.set(key, row);
    }
  }
  const list = [...rows.values()].sort((a, b) => a.bank.localeCompare(b.bank) || b.count - a.count);
  for (const r of list) console.log(`${r.bank} | ${r.code ?? "-"} | ${r.sample} | ${r.count} (+${r.plus} −${r.minus}) | ${r.proposed}`);
  console.log(`\n${list.length} conceptos fuera de la tabla.`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
