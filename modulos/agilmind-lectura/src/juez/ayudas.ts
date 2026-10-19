// agilmind-lectura/src/juez/ayudas.ts
import type { Campo, ControlDelJuez, Verdict } from "./contrato";
import { masDebil } from "./firmeza";

const sinInforme = { sospechosos: { informa: false as const }, posicion: { informa: false as const } };

/**
 * total = Σ partes, en centavos. Lo que falta o no es un importe lo resuelve el coordinador o queda sin juzgar;
 * las monedas distintas también: la ayuda lista todas las partes y el coordinador las baja a sin juzgar.
 * Una tolerancia que no es un número finito >= 0 es un error del juez, no de la lectura: tira.
 */
export function controlDeSuma(
  def: { id: string; total: string; partes: string[]; tolerancia: number; veredictoSiCierra: Verdict },
  campos: Map<string, Campo>,
): ControlDelJuez {
  if (!Number.isFinite(def.tolerancia) || def.tolerancia < 0) throw new Error("tolerancia inválida");
  const ids = [def.total, ...def.partes];
  const valores = ids.map((id) => campos.get(id)?.valor ?? null);
  const base = { id: def.id, partes: ids, faltan: [], ...sinInforme };
  if (valores.some((v) => v === null)) {
    return { ...base, estado: "no-se-puede-juzgar", residuo: null, veredicto: "abstained", motivo: "falta una parte" };
  }
  if (valores.some((v) => v!.tipo !== "centavos")) {
    return { ...base, estado: "no-se-puede-juzgar", residuo: null, veredicto: "abstained", motivo: "una parte no es un importe" };
  }
  const n = valores.map((v) => (v as { valor: number }).valor);
  const residuo = n[0] - n.slice(1).reduce((s, x) => s + x, 0);
  return Math.abs(residuo) <= def.tolerancia
    ? { ...base, estado: "cierra", residuo, veredicto: def.veredictoSiCierra, motivo: "cierra" }
    : { ...base, estado: "no-cierra", residuo, veredicto: "weak", motivo: `${residuo > 0 ? "faltan" : "sobran"} ${Math.abs(residuo)} centavos` };
}

/**
 * Un control por campo obligatorio: presente cierra con la certeza del campo; ausente no cierra y anota la falta;
 * uno que no se pudo mirar (`unavailable` o fuera de la escala) queda sin juzgar y `unavailable`, no como «no se leyó».
 * `partes` queda vacío a propósito: si listara el campo, el coordinador lo dejaría sin juzgar, y la completitud
 * es justamente decir «no está».
 */
export function controlesDeCompletitud(requeridos: string[], campos: Map<string, Campo>): ControlDelJuez[] {
  return requeridos.map((id) => {
    const c = campos.get(id);
    const base = { id: `${id} presente`, residuo: null, partes: [], ...sinInforme };
    if (c && masDebil([c.veredicto]) === "unavailable") {
      return { ...base, estado: "no-se-puede-juzgar", faltan: [{ campo: id }], veredicto: "unavailable", motivo: "no se pudo mirar" };
    }
    return c && c.valor !== null
      ? { ...base, estado: "cierra", faltan: [], veredicto: c.veredicto, motivo: "presente" }
      : { ...base, estado: "no-cierra", faltan: [{ campo: id }], veredicto: "abstained", motivo: "no se leyó" };
  });
}
