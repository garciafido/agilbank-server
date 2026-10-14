import type { Grid, ReadOptions, StatementHeader, StatementLine, StatementReading } from "./types";
import { catalog } from "./catalog/catalog";
import { formatOf } from "./sources/format";
import { SpreadsheetTooLarge, gridsFromMarkup, gridsFromSpreadsheet } from "./sources/spreadsheet";
import { NotText, TextTooLarge, gridFromText } from "./sources/text";
import { readTable, type Table } from "./columns";
import { chronologicalOrder, judge, netChained, type Judgement } from "./judge";
import { counterpartyOf, splitLeadingCode } from "./counterparty";
import { classify } from "./classify";
import { assignIds, fingerprintOf } from "./identity";
import { balancesOf, bankOf, cbusOutsideMovements, hasLabeledBalanceColumn, lineBalancesOf, normalizeCbu } from "./header";
import { buildWarnings, verdictOf } from "./checks";

const spreadsheetReason = (e: unknown): string =>
  /password|encrypt|protect/i.test(String((e as Error)?.message ?? e))
    ? "La planilla está protegida con contraseña: hay que mandarla sin contraseña."
    : "No se pudo abrir la planilla: el archivo está dañado o no es una planilla.";

/** Por qué no se pudo llevar el archivo a una grilla. Los mensajes de los demasiado grandes ya son para el usuario. */
const unreadableReason = (e: unknown): string =>
  e instanceof NotText
    ? "El archivo no es una planilla ni un texto: no se puede leer como extracto."
    : e instanceof SpreadsheetTooLarge || e instanceof TextTooLarge
      ? e.message
      : spreadsheetReason(e);

/** El número de cuenta de ProntoNet reducido a sus cifras y sus letras: se escribe de muchas maneras. */
const accountNumberKey = (number: string | null | undefined): string | null => {
  const key = (number ?? "").normalize("NFD").toUpperCase().replace(/[^0-9A-Z]/g, "");
  return key === "" ? null : `cuenta:${key}`;
};

/**
 * Entre las hojas de un libro, la que mejor encadena y después la de más movimientos; si empatan, la
 * primera. La que más filas tiene puede ser la conciliación del cliente, con fechas e importes pero
 * sin un saldo que encadene.
 */
const betterSheet = (a: Judgement, b: Judgement): boolean =>
  netChained(a) !== netChained(b) ? netChained(a) > netChained(b) : a.rows.movements.length > b.rows.movements.length;

/**
 * Lee un extracto y lo lleva al resumen bancario canónico, con sus controles.
 *
 * Es asincrónica aunque la lectura tabular no espera nada: la de PDF (etapa 3) sí, y la firma no
 * tiene que cambiar para los que ya la usan.
 */
export const readStatement = async (file: Buffer, options: ReadOptions = {}): Promise<StatementReading> => {
  const fingerprint = fingerprintOf(file);
  const abstain = (reason: string): StatementReading => ({ fingerprint, verdict: "abstained", reason, header: null, lines: [], warnings: [], checks: null });

  const format = formatOf(file);
  if (format === "pdf" || format === "image") return abstain("Este formato no se lee por esta vía: manden el extracto en Excel, CSV o texto.");
  let grids: Grid[];
  try {
    grids = format === "text" ? [gridFromText(file)] : format === "markup" ? gridsFromMarkup(file) : gridsFromSpreadsheet(file);
  } catch (e) {
    return abstain(unreadableReason(e));
  }

  const account = options.account && { ...options.account, cbu: normalizeCbu(options.account.cbu) };
  const known =
    account?.openingBalance != null && account?.closingBalance != null
      ? { openingCents: Math.round(account.openingBalance * 100), closingCents: Math.round(account.closingBalance * 100) }
      : null;

  let best: { grid: Grid; table: Table; judgement: Judgement } | null = null;
  let withoutSign = false;
  for (const grid of grids) {
    const table = readTable(grid);
    if (table === null) continue;
    if (table.interpretations.length === 0) {
      withoutSign = true;
      continue;
    }
    const judgement = judge(grid, table, catalog.synonyms.nonMovements, known);
    if (judgement && (best === null || betterSheet(judgement, best.judgement))) best = { grid, table, judgement };
  }
  if (best === null) {
    return abstain(
      withoutSign
        ? "No se puede saber el signo de los importes: el archivo trae una sola columna de importes, sin signo y sin saldo."
        : "No se encontró una tabla de movimientos con fecha e importe.",
    );
  }

  const { grid, table, judgement: j } = best;
  const ms = j.rows.movements;
  const fileCbus = cbusOutsideMovements(grid, j.rows);
  const cbu = fileCbus[0] ?? account?.cbu ?? null;
  // El banco sale del mismo CBU que el encabezado: si el archivo es de otra cuenta que la que mandó
  // ProntoNet, el banco y el CBU tienen que ser de la misma.
  const bank = bankOf(cbu, account?.bank ?? null, catalog);
  // La cuenta del id sale primero de lo que manda ProntoNet, que es igual en todos los envíos de una
  // cuenta: el CBU del archivo depende de si el banco lo imprime en ese canal.
  const accountKey = account?.cbu ?? accountNumberKey(account?.number) ?? fileCbus[0] ?? "sin-cuenta";
  const ids = assignIds(accountKey, ms, chronologicalOrder(ms.length, j.direction));

  const lines: StatementLine[] = ms.map((m, k) => {
    const split = m.code === null ? splitLeadingCode(m.concept) : { code: m.code, text: m.concept };
    const { type } = classify(
      { text: split.text, code: split.code, amountCents: m.amountCents },
      { previous: ms[k - 1]?.amountCents ?? null, next: ms[k + 1]?.amountCents ?? null },
      bank?.code ?? null,
      catalog,
      options.corrections ?? [],
    );
    return {
      id: ids[k],
      order: k + 1,
      date: m.date,
      valueDate: m.valueDate,
      type,
      amountCents: m.amountCents,
      balanceCents: m.balanceCents,
      reference: m.reference,
      counterparty: counterpartyOf(m.concept, m.extras),
      bank: { code: split.code, text: split.text, extras: m.extras.map((e) => e.text) },
      chains: j.chains[k],
      // Las filas como las numera la planilla, desde 1: es como las va a buscar quien abra el archivo.
      provenance: { origin: grid.origin, sheet: grid.sheet, fromRow: m.fromRow + 1, toRow: m.toRow + 1 },
    };
  });

  const dates = lines.map((l) => l.date).sort();
  const balances = balancesOf(j);
  const header: StatementHeader = {
    bankCode: bank?.code ?? null,
    bankName: bank?.name ?? null,
    account: account?.number ?? null,
    cbu,
    currency: account?.currency ?? null,
    periodFrom: dates[0] ?? null,
    periodTo: dates[dates.length - 1] ?? null,
    openingBalanceCents: balances.openingCents,
    closingBalanceCents: balances.closingCents,
  };
  const accounts = [...new Set(ms.map((m) => m.account).filter((a): a is string => a !== null))];
  const out = buildWarnings({
    judgement: j,
    lines,
    header,
    account,
    fileCbus,
    accounts,
    hasLabeledBalanceColumn: hasLabeledBalanceColumn(grid, table),
  });

  return {
    fingerprint,
    verdict: verdictOf(j, out.warnings),
    reason: null,
    header,
    lines,
    warnings: out.warnings,
    checks: {
      direction: j.direction,
      balanceIs: j.balanceIs,
      linesWithBalance: ms.filter((m) => m.balanceCents !== null).length,
      linesThatChain: j.chained,
      closesWithOwnBalances: out.closesWithOwnBalances,
      closesWithProntoNet: out.closesWithProntoNet,
      printedBalances: { openingCents: j.openingCents, closingCents: j.closingCents },
      lineBalances: lineBalancesOf(j),
    },
  };
};
