import type { StatementLine } from "../types";
import { normalizeConcept } from "../values";

/** La clave de un concepto: banco, código de operación y texto sin números. La comparten las correcciones y el aprendizaje de DBG. */
export const conceptKeyOf = (bankCode: string | null, operationCode: string | null, text: string): string =>
  `${bankCode ?? ""}|${operationCode ?? ""}|${normalizeConcept(text)}`;

/** La clave del concepto de un renglón del extracto (la que usa el aprendizaje de DBG). */
export const conceptKey = (bankCode: string | null, line: Pick<StatementLine, "bank">): string =>
  conceptKeyOf(bankCode, line.bank.code, line.bank.text);
