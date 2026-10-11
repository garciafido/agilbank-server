import { createHash } from "crypto";

/** La huella del archivo: el SHA-256 de sus bytes. ProntoNet la puede calcular sin preguntarnos. */
export const fingerprintOf = (file: Buffer): string => createHash("sha256").update(file).digest("hex");

/**
 * La referencia comparable: sus últimas seis cifras, sin ceros adelante. Credicoop corta el número de
 * ECHEQ a seis cifras en el Excel y no en otros canales; seis es lo que todos traen. Se corta antes de
 * sacar los ceros: «1000123» cortado es «000123», igual que el que trae el Excel.
 */
export const comparableReference = (reference: string | null): string =>
  (reference ?? "").replace(/\D/g, "").slice(-6).replace(/^0+/, "");

/** Las referencias como números: sin cifras va después de cualquiera con cifras. */
const byReference = (a: string | null, b: string | null): number => {
  const x = comparableReference(a);
  const y = comparableReference(b);
  if (x === "" || y === "") return (x === "" ? 1 : 0) - (y === "" ? 1 : 0);
  return x.length - y.length || (x < y ? -1 : x > y ? 1 : 0);
};

/**
 * Un id estable por renglón: la cuenta, la fecha y el importe, con un ordinal entre los renglones que
 * comparten los tres. Nunca el texto del concepto ni el tipo: el mismo movimiento llega en el Excel del
 * día y en el resumen del mes con el texto distinto, y el tipo cambia cuando la tabla suma el concepto
 * o cuando la empresa lo corrige. Tampoco la referencia: hay canales que no la traen. ProntoNet
 * descarta los repetidos por este id.
 *
 * El ordinal sigue la referencia cuando el archivo la trae y, entre las iguales o sin ella, el orden
 * cronológico. Dos canales del mismo período dan así el mismo conjunto de ids aunque uno no traiga la
 * referencia.
 */
export const assignIds = (
  accountKey: string,
  movements: Array<{ date: string; amountCents: number; reference: string | null }>,
  chronological: number[],
): string[] => {
  const groups = new Map<string, number[]>();
  for (const k of chronological) {
    const key = `${accountKey}|${movements[k].date}|${movements[k].amountCents}`;
    const group = groups.get(key);
    if (group) group.push(k);
    else groups.set(key, [k]);
  }
  const ids = new Array<string>(movements.length);
  for (const [key, group] of groups) {
    // El orden de sort es estable: entre referencias iguales queda el cronológico.
    group.sort((a, b) => byReference(movements[a].reference, movements[b].reference));
    group.forEach((k, i) => (ids[k] = "r-" + createHash("sha256").update(`${key}|${i + 1}`).digest("hex").slice(0, 20)));
  }
  return ids;
};
