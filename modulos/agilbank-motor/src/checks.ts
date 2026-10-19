import type { KnownAccount, StatementHeader, StatementLine, Warning } from "./types";
import type { Judgement } from "./judge";
import { normalizeConcept } from "./values";

const money = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pesos = (cents: number): string => `$ ${money.format(cents / 100)}`;
const toCents = (v: number | null | undefined): number | null => (v === null || v === undefined ? null : Math.round(v * 100));

const DAY = 86_400_000;
const shift = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** Si el archivo cubre el período que declaró ProntoNet: empieza y termina a menos de cinco días de sus bordes. */
const coversPeriod = (lines: StatementLine[], periodFrom: string, periodTo: string): boolean => {
  if (lines.length === 0) return true;
  const dates = lines.map((l) => l.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first >= periodFrom && first <= shift(periodFrom, 5) && last <= periodTo && last >= shift(periodTo, -5);
};

/** Por qué ningún renglón se pudo controlar contra el saldo anterior: qué saldos trae el archivo y cuáles no sirvieron. */
/**
 * Con un solo renglón controlado se controla el total, no cada renglón: dos errores que se compensan
 * pasarían. Es lo mismo que un saldo final rotulado, que da débil.
 */
const MIN_CHECKED = 2;

const whyNothingIsChecked = (rowBalances: number, printedBalances: number, rejectedColumn: boolean): string => {
  const total = rowBalances + printedBalances;
  if (rejectedColumn) return "El archivo tiene una columna de saldo que no encadena con los importes: no se puede controlar la lectura renglón por renglón.";
  if (total === 0) return "El archivo no trae saldos: no se puede controlar la lectura renglón por renglón.";
  if (total === 1) return "El archivo trae un solo saldo: no alcanza para controlar la lectura renglón por renglón.";
  if (rowBalances === 0) return "El archivo trae solo los saldos inicial y final: se controla el total, no cada renglón.";
  return "Los saldos que trae el archivo no alcanzan para controlar la lectura renglón por renglón.";
};

export interface CheckInput {
  judgement: Judgement;
  lines: StatementLine[];
  header: StatementHeader;
  account: KnownAccount | undefined;
  fileCbus: string[];
  accounts: string[];
  /** La tabla tiene una columna rotulada como saldo que el juez no usó: ver `hasLabeledBalanceColumn`. */
  hasLabeledBalanceColumn: boolean;
  /**
   * La lectura se cortó: los renglones que faltan pueden ser la diferencia, así que no hay con qué afirmar que
   * no cierra, y el detalle imprimiría un saldo que la lectura pública oculta. lectura-parcial ya frena las propuestas.
   */
  partial: boolean;
}

export interface CheckOutput {
  warnings: Warning[];
  closesWithOwnBalances: boolean | null;
  closesWithProntoNet: boolean | null;
}

export const buildWarnings = (input: CheckInput): CheckOutput => {
  const { judgement: j, lines, header, account } = input;
  const warnings: Warning[] = [];
  const doesNotClose = (detail: string) => {
    if (!input.partial) warnings.push({ code: "no-cierra", detail, blocksProposals: true });
  };
  const total = lines.reduce((s, l) => s + l.amountCents, 0);
  const o = header.openingBalanceCents;
  const c = header.closingBalanceCents;

  if (j.checked === 0) {
    const rowBalances = lines.filter((l) => l.balanceCents !== null).length;
    const rejectedColumn = j.balanceIs === null && input.hasLabeledBalanceColumn;
    warnings.push({ code: "sin-saldos", detail: whyNothingIsChecked(rowBalances, j.rows.checkpoints.length, rejectedColumn), blocksProposals: false });
  } else if (j.checked < MIN_CHECKED) {
    warnings.push({ code: "sin-saldos", detail: "El archivo trae un solo saldo con qué controlar: se controla el total, no cada renglón.", blocksProposals: false });
  }
  const broken = lines.filter((l) => l.chains === false).map((l) => l.order);
  if (broken.length > 0) {
    warnings.push({
      code: "no-encadena",
      detail: `${broken.length} ${broken.length === 1 ? "renglón no encadena" : "renglones no encadenan"} con el saldo anterior.`,
      blocksProposals: false,
      lines: broken,
    });
  }

  // Con las dos puntas sacadas del único saldo de renglón, la resta es una identidad: no se controló nada.
  const bothFromOneRowBalance = j.openingCents === null && j.closingCents === null && lines.filter((l) => l.balanceCents !== null).length === 1;
  let own: boolean | null = null;
  if (o !== null && c !== null && !bothFromOneRowBalance) {
    own = o + total === c;
    if (!own) doesNotClose(`El saldo inicial más los renglones da ${pesos(o + total)}, y el saldo final es ${pesos(c)}: hay una diferencia de ${pesos(c - (o + total))}.`);
  }

  // Sin el período no se sabe de qué resumen son los saldos de ProntoNet: un extracto diario mandado
  // con los saldos del mes frenaría una lectura correcta. No se comparan.
  let pn: boolean | null = null;
  const ko = toCents(account?.openingBalance);
  const kc = toCents(account?.closingBalance);
  if (ko !== null && kc !== null && account?.periodFrom && account?.periodTo) {
    const covers = coversPeriod(lines, account.periodFrom, account.periodTo);
    if (o !== null && c !== null) {
      pn = o === ko && c === kc;
      if (!pn && covers) doesNotClose(`Los saldos del archivo (${pesos(o)} y ${pesos(c)}) no son los del resumen de ProntoNet (${pesos(ko)} y ${pesos(kc)}).`);
      else if (!pn) pn = null;
    } else if (covers) {
      pn = ko + total === kc;
      if (!pn) doesNotClose(`Partiendo del saldo inicial de ProntoNet y sumando los renglones se llega a ${pesos(ko + total)}, no a ${pesos(kc)}: hay una diferencia de ${pesos(kc - (ko + total))}.`);
    }
  }

  if (account?.cbu && input.fileCbus.length > 0 && !input.fileCbus.includes(account.cbu)) {
    warnings.push({
      code: "cuenta-distinta",
      detail: `El archivo es de la cuenta ${input.fileCbus.join(", ")}, y ProntoNet mandó la ${account.cbu}.`,
      blocksProposals: true,
      data: { cbuDelArchivo: input.fileCbus.join(", "), cbuDeProntoNet: account.cbu },
    });
  }

  // Los valores de la columna Cuenta se comparan entre sí, y los CBU del título y del pie entre sí: son
  // dos maneras de nombrar la cuenta y no se pueden igualar (191-001-012345/6 no es un CBU). Un valor
  // sin cifras («CUENTA CORRIENTE») es un tipo de cuenta, no una cuenta.
  const columnAccounts = [...new Set(input.accounts.filter((a) => /\d/.test(a)))];
  const several = [columnAccounts, input.fileCbus].filter((set) => set.length > 1).flat();
  if (several.length > 0) {
    warnings.push({
      code: "varias-cuentas",
      detail: `El archivo trae movimientos de ${several.length} cuentas: ${several.join(", ")}.`,
      blocksProposals: true,
      data: { cuentas: several.join(", ") },
    });
  }

  const groups = new Map<string, StatementLine[]>();
  for (const l of lines) {
    if (l.type.source !== "rule" && l.type.source !== "none") continue;
    const key = JSON.stringify([normalizeConcept(l.bank.text), l.bank.code, l.type.code]);
    const group = groups.get(key);
    if (group) group.push(l);
    else groups.set(key, [l]);
  }
  for (const group of groups.values()) {
    const first = group[0];
    const where = header.bankName ? ` de ${header.bankName}` : "";
    const what = first.type.code === "sin-clasificar" ? "quedó sin clasificar" : `se clasificó como ${first.type.code} por una regla general`;
    warnings.push({
      code: "concepto-nuevo",
      detail: `El concepto «${first.bank.text}» no está en la tabla${where}: ${what}.`,
      blocksProposals: false,
      lines: group.map((l) => l.order),
      data: { texto: first.bank.text, codigo: first.bank.code, tipo: first.type.code },
    });
  }

  return { warnings, closesWithOwnBalances: own, closesWithProntoNet: pn };
};

/** Verificada: hay al menos dos renglones controlados, todos encadenan y ningún aviso frena. */
export const verdictOf = (j: Judgement, warnings: Warning[]): "verified" | "weak" =>
  j.checked >= MIN_CHECKED && j.chained === j.checked && !warnings.some((w) => w.blocksProposals) ? "verified" : "weak";
