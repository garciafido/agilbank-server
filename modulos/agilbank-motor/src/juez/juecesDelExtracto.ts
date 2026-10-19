// Los jueces de AgilBank por el contrato común. No vuelven a juzgar el extracto: traducen lo que
// AgilBank ya decidió (qué renglón encadena, si cierra con ProntoNet) y lo que se lee de él.
import { TOPE_POR_DEFECTO, controlDeSuma, controlesDeCompletitud, coordinar, indice } from "@agilmind/lectura";
import type { Campo, ControlDelJuez, Dictamen, Juez, Lectura, Verdict } from "@agilmind/lectura";
import type { ReadingChecks, StatementReading } from "../types";
import { isPartialReading } from "../partialReading";
import { lecturaDelExtracto } from "./lecturaDelExtracto";

export { lecturaDelExtracto };

/** Lo que los jueces saben del extracto además de lo leído. */
export interface ContextoDelExtracto {
  direccion: ReadingChecks["direction"];
  /** Si el saldo de un renglón es el que queda después de su movimiento o el que había antes. */
  saldoEs: "after" | "before";
  /** Lo que AgilBank juzgó de cada renglón que controló contra el saldo anterior; los demás no están. */
  encadena: ReadonlyMap<string, boolean>;
  prontoNet: boolean | null;
  /** Por qué no hay con qué juzgar el extracto; null si lo hay. */
  sinLectura: { veredicto: Verdict; motivo: string } | null;
  /** La lectura la cortamos nosotros (tiempo, páginas, OCR): lo que falta leer puede cambiar las puntas. */
  parcial: boolean;
}

export function contextoDelExtracto(r: StatementReading): ContextoDelExtracto {
  const sinLectura = r.header === null && r.checks === null && (r.verdict === "abstained" || r.verdict === "unavailable");
  const causa = r.verdict === "unavailable" ? "no se pudo leer el extracto" : "no hay lectura del extracto";
  return {
    direccion: r.checks?.direction ?? "chronological",
    saldoEs: r.checks?.balanceIs ?? "after",
    encadena: new Map(r.lines.flatMap((l) => (l.chains === null ? [] : [[l.id, l.chains] as const]))),
    prontoNet: r.checks?.closesWithProntoNet ?? null,
    sinLectura: sinLectura ? { veredicto: r.verdict, motivo: r.reason ? `${causa}: ${r.reason}` : causa } : null,
    parcial: isPartialReading(r),
  };
}

const sinInforme = { sospechosos: { informa: false as const }, posicion: { informa: false as const } };

const movimientos = (l: Lectura): string[] => l.listas.find((x) => x.id === "movimientos")?.elementos.map((e) => e.id) ?? [];

const cronologico = (l: Lectura, ctx: ContextoDelExtracto): string[] => (ctx.direccion === "reverse" ? [...movimientos(l)].reverse() : movimientos(l));

interface Eslabon { id: string; anterior: string; tramo: string[]; encadena: boolean }

/**
 * Los eslabones como los recorre `chain` de judge.ts: cada renglón con saldo cierra un tramo que arranca en
 * el saldo anterior (o en el inicial, que es el ancla que usó el juez). Con el saldo de después, el tramo son
 * los movimientos desde el anterior hasta el renglón; con el de antes, desde el anterior sin llegar al renglón.
 */
function eslabones(l: Lectura, ctx: ContextoDelExtracto): Eslabon[] {
  const campos = indice(l);
  const out: Eslabon[] = [];
  let anterior = "saldoInicial";
  let pendientes: string[] = [];
  for (const id of cronologico(l, ctx)) {
    if (!campos.has(`saldo:${id}`)) {
      pendientes.push(id);
      continue;
    }
    const encadena = ctx.encadena.get(id);
    const tramo = ctx.saldoEs === "after" ? [...pendientes, id] : pendientes;
    if (encadena !== undefined) out.push({ id, anterior, tramo, encadena });
    anterior = `saldo:${id}`;
    pendientes = ctx.saldoEs === "after" ? [] : [id];
  }
  return out;
}

/**
 * Si el eslabón anterior tampoco encadena, el saldo donde arranca este explica los dos. Si no, y el siguiente
 * encadena desde el saldo de este, ese saldo está bien: lo sospechoso son los movimientos del tramo, o una
 * fila que falta entre medio. En el primer eslabón también el saldo donde arranca: no hay uno anterior que
 * encadene y lo corrobore.
 */
function sospechososDe(e: Eslabon, previo: Eslabon | undefined, siguiente: Eslabon | undefined): Pick<ControlDelJuez, "sospechosos" | "faltan"> {
  if (e.encadena) return { sospechosos: { informa: false }, faltan: [] };
  if (previo && !previo.encadena) return { sospechosos: { informa: true, valor: [e.anterior] }, faltan: [] };
  if (siguiente?.encadena) {
    const valor = previo === undefined || !e.tramo.length ? [e.anterior, ...e.tramo] : e.tramo;
    return { sospechosos: { informa: true, valor }, faltan: [{ elementoDe: "movimientos" }] };
  }
  return { sospechosos: { informa: false }, faltan: [] };
}

const juezDeCadena = (ctx: ContextoDelExtracto): Juez => ({
  id: "cadena-de-saldos",
  version: "1",
  juzgar(l) {
    const es = eslabones(l, ctx);
    return es.map((e, k): ControlDelJuez => ({
      id: `saldo del renglón ${e.id}`,
      estado: e.encadena ? "cierra" : "no-cierra",
      residuo: null,
      partes: [e.anterior, ...e.tramo, `saldo:${e.id}`],
      ...sospechososDe(e, es[k - 1], es[k + 1]),
      posicion: { informa: true, valor: { renglon: e.id } },
      veredicto: e.encadena ? "verified" : "weak",
      motivo: e.encadena ? "el saldo anterior más el movimiento da el saldo del renglón" : "el saldo anterior más el movimiento no da el saldo del renglón",
    }));
  },
});

/**
 * final = inicial + movimientos, con cada punta impresa o, si no, el saldo de renglón del que la sacó AgilBank
 * (el primero y el último en orden cronológico). Una punta de renglón ya incluye los movimientos hasta ella,
 * o desde ella: entran solo los que van entre las dos, con el mismo corte que `chain` según el saldo sea el
 * de antes o el de después. Es la misma cuenta que `closesWithOwnBalances`, despejada.
 */
function puntas(l: Lectura, ctx: ContextoDelExtracto, campos: Map<string, Campo>) {
  const crono = cronologico(l, ctx);
  const conSaldo = crono.filter((id) => campos.has(`saldo:${id}`));
  const inicioDeRenglon = !campos.has("saldoInicial");
  const finDeRenglon = !campos.has("saldoFinal");
  if ((inicioDeRenglon || finDeRenglon) && !conSaldo.length) return null;
  const despues = ctx.saldoEs === "after" ? 1 : 0;
  const desde = inicioDeRenglon ? crono.indexOf(conSaldo[0]) + despues : 0;
  const hasta = finDeRenglon ? crono.indexOf(conSaldo[conSaldo.length - 1]) + despues : crono.length;
  const entre = new Set(crono.slice(desde, hasta));
  return {
    inicio: inicioDeRenglon ? `saldo:${conSaldo[0]}` : "saldoInicial",
    fin: finDeRenglon ? `saldo:${conSaldo[conSaldo.length - 1]}` : "saldoFinal",
    movimientos: movimientos(l).filter((id) => entre.has(id)),
  };
}

const PARCIAL = { estado: "no-se-puede-juzgar", veredicto: "unavailable", motivo: "la lectura quedó parcial" } as const;

const juezDePunta = (ctx: ContextoDelExtracto): Juez => ({
  id: "saldos-de-punta",
  version: "1",
  juzgar(l) {
    const campos = indice(l);
    const out: ControlDelJuez[] = [];
    const p = puntas(l, ctx, campos);
    if (p && campos.get(p.inicio)!.valor && campos.get(p.fin)!.valor) {
      const c = controlDeSuma({ id: "final = inicial + movimientos", total: p.fin, partes: [p.inicio, ...p.movimientos], tolerancia: 0, veredictoSiCierra: "verified" }, campos);
      if (ctx.parcial) out.push({ ...c, ...PARCIAL, residuo: null });
      else if (p.inicio === p.fin) {
        out.push({ ...c, partes: [p.fin], estado: "cierra-por-construccion", veredicto: "abstained", motivo: "el saldo inicial y el final salen del mismo saldo de renglón: la suma cierra por construcción" });
      } else out.push(c);
    }
    if (ctx.prontoNet !== null) {
      out.push({
        id: "saldos de ProntoNet", residuo: null, partes: [], faltan: [], ...sinInforme,
        ...(ctx.parcial
          ? PARCIAL
          : ctx.prontoNet
            ? { estado: "cierra", veredicto: "verified", motivo: "los saldos coinciden con los de ProntoNet" }
            : { estado: "no-cierra", veredicto: "weak", motivo: "los saldos no coinciden con los de ProntoNet" }),
      });
    }
    return out;
  },
});

const REQUERIDOS = ["cbu", "periodoDesde", "periodoHasta"];

const juezDeCompletitud = (ctx: ContextoDelExtracto): Juez => ({
  id: "completitud",
  version: "1",
  juzgar(l) {
    const sin = ctx.sinLectura;
    if (sin !== null) {
      return [...REQUERIDOS.map((id) => `${id} presente`), "hay movimientos"].map((id) => ({
        id, estado: "no-se-puede-juzgar", residuo: null, partes: [], faltan: [], ...sinInforme, veredicto: sin.veredicto, motivo: sin.motivo,
      }));
    }
    const base = { id: "hay movimientos", residuo: null, partes: [], ...sinInforme };
    const faltan = [{ elementoDe: "movimientos" }];
    return [
      ...controlesDeCompletitud(REQUERIDOS, indice(l)),
      ctx.parcial
        ? { ...base, ...PARCIAL, faltan }
        : movimientos(l).length
          ? { ...base, estado: "cierra", faltan: [], veredicto: "grounded", motivo: "el extracto trae movimientos" }
          : { ...base, estado: "no-cierra", faltan, veredicto: "abstained", motivo: "el extracto no trae movimientos" },
    ];
  },
});

/** Los jueces de un extracto, con lo que saben de él además de lo leído. */
export const juecesDelExtracto = (ctx: ContextoDelExtracto): Juez[] => [juezDeCadena(ctx), juezDePunta(ctx), juezDeCompletitud(ctx)];

export function dictaminarExtracto(r: StatementReading, opciones?: { estricto?: boolean }): Dictamen {
  return coordinar(lecturaDelExtracto(r), {
    jueces: juecesDelExtracto(contextoDelExtracto(r)),
    despeja: new Set(),
    tope: TOPE_POR_DEFECTO,
    estricto: opciones?.estricto,
  });
}
