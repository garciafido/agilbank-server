// Del StatementReading a la Lectura del juez común: lo leído, nada de lo que AgilBank juzgó sobre ello.
import type { Campo, Lectura, Valor } from "@agilmind/lectura";
import { isPartialReading, unseenEnd } from "../partialReading";
import type { StatementReading } from "../types";

const campo = (id: string, valor: Valor | null): Campo => ({ id, valor, veredicto: valor === null ? "abstained" : "grounded" });
const sinMirar = (id: string): Campo => ({ id, valor: null, veredicto: "unavailable" });

export function lecturaDelExtracto(r: StatementReading): Lectura {
  const h = r.header;
  if (h === null) return { campos: [], listas: [{ id: "movimientos", elementos: [] }] };
  // Con la lectura cortada, la punta del período que no se vio es la fecha del renglón leído más cercano a ella, no la
  // del extracto, y un CBU que falta pudo estar en la parte que no se leyó: no se pudo mirar, que no es lo mismo que no estar.
  const parcial = isPartialReading(r);
  const sinVer = unseenEnd(r);
  const moneda = h.currency ?? "ARS";
  const centavos = (v: number | null): Valor | null => (v === null ? null : { tipo: "centavos", valor: v, moneda });
  const texto = (v: string | null): Valor | null => (v === null ? null : { tipo: "texto", valor: v });
  const fecha = (v: string | null): Valor | null => (v === null ? null : { tipo: "fecha", valor: v });
  const lineas = [...r.lines].sort((a, b) => a.order - b.order);
  // Una punta que el archivo no imprime la saca AgilBank de un saldo de renglón: ese saldo ya es un campo,
  // y otro con el mismo valor bajo otro nombre escondería de dónde sale.
  const deRenglon = (impreso: number | null, valor: number | null) => r.checks !== null && impreso === null && valor !== null;
  const puntas = [
    ...(deRenglon(r.checks?.printedBalances.openingCents ?? null, h.openingBalanceCents) ? [] : [campo("saldoInicial", centavos(h.openingBalanceCents))]),
    ...(deRenglon(r.checks?.printedBalances.closingCents ?? null, h.closingBalanceCents) ? [] : [campo("saldoFinal", centavos(h.closingBalanceCents))]),
  ];
  return {
    campos: [
      ...puntas,
      parcial && h.cbu === null ? sinMirar("cbu") : campo("cbu", texto(h.cbu)),
      campo("cuenta", texto(h.account)),
      campo("banco", texto(h.bankCode)),
      sinVer === "opening" ? sinMirar("periodoDesde") : campo("periodoDesde", fecha(h.periodFrom)),
      sinVer === "closing" ? sinMirar("periodoHasta") : campo("periodoHasta", fecha(h.periodTo)),
      ...lineas.filter((l) => l.balanceCents !== null).map((l) => campo(`saldo:${l.id}`, centavos(l.balanceCents))),
    ],
    listas: [{ id: "movimientos", elementos: lineas.map((l) => campo(l.id, centavos(l.amountCents))) }],
  };
}
