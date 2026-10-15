import type { Grid, ReadOptions, StatementHeader, StatementLine, StatementReading, Warning } from "./types";
import { catalog } from "./catalog/catalog";
import { formatOf } from "./sources/format";
import { SpreadsheetTooLarge, gridsFromMarkup, gridsFromSpreadsheet } from "./sources/spreadsheet";
import { NotText, TextTooLarge, gridFromText } from "./sources/text";
import { VISUAL_LIMITS, readImage, readPdf, type Cut, type VisualLimits } from "./sources/visual";
import { readTable, type Table } from "./columns";
import { chronologicalOrder, judge, netChained, type Judgement } from "./judge";
import { counterpartyOf, splitLeadingCode } from "./counterparty";
import { classify } from "./classify";
import { assignIds, fingerprintOf } from "./identity";
import { balancesOf, bankOf, cbusOutsideMovements, hasLabeledBalanceColumn, lineBalancesOf, normalizeCbu } from "./header";
import { buildWarnings, verdictOf } from "./checks";
import { completeYears, yearUnknown } from "./years";
import { splitSections } from "./sections";
import { annexEntries, applyAnnexes } from "./annexes";

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

/** Las filas como las numera la planilla, desde 1; en un PDF o una foto, la página y la línea dentro de ella. */
export const provenanceOf = (grid: Grid, fromRow: number, toRow: number): StatementLine["provenance"] => {
  const from = grid.places?.[fromRow];
  const to = grid.places?.[toRow];
  return {
    origin: from?.origin ?? grid.origin,
    sheet: grid.sheet,
    page: from?.page ?? null,
    pageTo: to?.page ?? null,
    fromRow: from ? from.line : fromRow + 1,
    toRow: to ? to.line : toRow + 1,
  };
};

/**
 * Entre las hojas de un libro, la que mejor encadena y después la de más movimientos; si empatan, la
 * primera. La que más filas tiene puede ser la conciliación del cliente, con fechas e importes pero
 * sin un saldo que encadene.
 */
const betterSheet = (a: Judgement, b: Judgement): boolean =>
  netChained(a) !== netChained(b) ? netChained(a) > netChained(b) : a.rows.movements.length > b.rows.movements.length;

/** Un techo que no es un entero positivo vale como el de siempre: un techo vacío no puede dejar la lectura sin techo. */
const pick = (v: number | undefined, d: number): number => (Number.isInteger(v) && v! > 0 ? v! : d);

const visualLimits = (o: Partial<VisualLimits> = {}): VisualLimits => ({
  budgetMs: pick(o.budgetMs, VISUAL_LIMITS.budgetMs),
  maxPages: pick(o.maxPages, VISUAL_LIMITS.maxPages),
  dpi: pick(o.dpi, VISUAL_LIMITS.dpi),
});

interface PartialReading {
  pages: number;
  pagesRead: number;
  cut: Cut;
  maxPages: number;
}

const OURS = "Es una falla nuestra: envíen el archivo de nuevo y se vuelve a leer.";
const SPLIT = "manden el extracto partido en archivos más chicos.";

/**
 * Por qué se cortó, para el usuario. Las fallas nuestras se leen de nuevo al reenviar el archivo. Un
 * escaneado largo pasa el techo de tiempo con cualquier carga: si el reenvío se vuelve a cortar, el
 * techo es del archivo, y lo que sirve es partirlo.
 */
const cutReason = ({ pagesRead, cut, maxPages }: PartialReading): string =>
  cut === "paginas"
    ? `el archivo pasa el tope de ${maxPages} páginas. Para leer el resto, ${SPLIT}`
    : cut === "tiempo"
      ? `se acabó el tiempo de la lectura. ${OURS} Si vuelve a cortarse, ${SPLIT}`
      : cut === "render"
        ? `la página ${pagesRead + 1} no se pudo preparar para leerla. ${OURS}`
        : `el lector de imágenes falló en la página ${pagesRead + 1}. ${OURS}`;

/** Lo que no se encontró en un archivo que no se terminó de leer: la tabla puede estar en lo que falta. */
const withoutTableIn = (p: PartialReading): string =>
  `Se leyeron ${p.pagesRead} de ${p.pages} páginas y en ellas no está la tabla de movimientos: ${cutReason(p)}`;

/** Lo que se leyó de un archivo que no se terminó de leer. Frena las propuestas: faltan renglones. */
const partialWarning = (p: PartialReading): Warning => ({
  code: "lectura-parcial",
  detail: `Se leyeron ${p.pagesRead} de ${p.pages} páginas: ${cutReason(p)} Los renglones de las otras páginas no están en esta lectura.`,
  blocksProposals: true,
  data: { paginas: p.pages, paginasLeidas: p.pagesRead, causa: p.cut },
});

/**
 * Lee un extracto y lo lleva al resumen bancario canónico, con sus controles.
 *
 * Es asincrónica porque la lectura de un PDF o de una foto espera a poppler y al OCR.
 */
export const readStatement = async (file: Buffer, options: ReadOptions = {}): Promise<StatementReading> => {
  const fingerprint = fingerprintOf(file);
  const abstain = (reason: string): StatementReading => ({ fingerprint, verdict: "abstained", reason, header: null, lines: [], warnings: [], checks: null });

  const format = formatOf(file);
  if (format === "heic") return abstain("Las fotos HEIC no se leen: manden la foto en JPG o PNG, o el extracto en PDF.");
  let grids: Grid[];
  let partial: PartialReading | null = null;
  if (format === "pdf" || format === "image") {
    const limits = visualLimits(options.visual);
    const v = format === "pdf" ? await readPdf(file, limits) : await readImage(file);
    if (v.kind === "unavailable") return { ...abstain(v.reason), verdict: "unavailable" };
    if (v.kind === "unreadable") return abstain(v.reason);
    grids = [v.grid];
    if (v.cut !== null) partial = { pages: v.pages, pagesRead: v.pagesRead, cut: v.cut, maxPages: limits.maxPages };
  } else {
    try {
      grids = format === "text" ? [gridFromText(file)] : format === "markup" ? gridsFromMarkup(file) : gridsFromSpreadsheet(file);
    } catch (e) {
      return abstain(unreadableReason(e));
    }
  }
  const period = { from: options.account?.periodFrom ?? null, to: options.account?.periodTo ?? null };
  const withoutYear = grids.some((g) => yearUnknown(g, period));
  grids = grids.map((g) => completeYears(g, period));

  const account = options.account && { ...options.account, cbu: normalizeCbu(options.account.cbu) };
  const known =
    account?.openingBalance != null && account?.closingBalance != null
      ? { openingCents: Math.round(account.openingBalance * 100), closingCents: Math.round(account.closingBalance * 100) }
      : null;

  let best: { grid: Grid; table: Table; judgement: Judgement; annexes: Grid[] } | null = null;
  let withoutSign = false;
  for (const whole of grids) {
    const { main: grid, annexes } = splitSections(whole);
    const table = readTable(grid);
    if (table === null) continue;
    if (table.interpretations.length === 0) {
      withoutSign = true;
      continue;
    }
    const judgement = judge(grid, table, catalog.synonyms.nonMovements, known);
    if (judgement && (best === null || betterSheet(judgement, best.judgement))) best = { grid, table, judgement, annexes };
  }
  if (best === null) {
    // Cortada por nosotros, lo que falta leer puede traer la tabla: no es una conclusión sobre el archivo.
    if (partial !== null && partial.cut !== "paginas") return { ...abstain(withoutTableIn(partial)), verdict: "unavailable" };
    return abstain(
      withoutSign
        ? "No se puede saber el signo de los importes: el archivo trae una sola columna de importes, sin signo y sin saldo."
        : withoutYear
          ? "El extracto trae las fechas sin año y no dice de qué período es: manden el período en la cuenta (periodoDesde y periodoHasta)."
          : partial !== null
            ? withoutTableIn(partial)
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

  const rows: StatementLine[] = ms.map((m, k) => {
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
      provenance: provenanceOf(grid, m.fromRow, m.toRow),
    };
  });

  const linked = applyAnnexes(rows, best.annexes.flatMap(annexEntries));

  const dates = linked.map((l) => l.date).sort();
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
    lines: linked,
    header,
    account,
    fileCbus,
    accounts,
    hasLabeledBalanceColumn: hasLabeledBalanceColumn(grid, table),
  });
  const warnings = partial === null ? out.warnings : [...out.warnings, partialWarning(partial)];

  return {
    fingerprint,
    verdict: verdictOf(j, warnings),
    reason: null,
    header,
    lines: linked,
    warnings,
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
