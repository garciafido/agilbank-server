import { balanceUnseen, isPartialReading, unseenEnd } from "./partialReading";
import type { StatementReading, TypeSource } from "./types";

// Los identificadores del motor van en inglés; el contrato con BDL, en castellano. La traducción vive
// acá, en la frontera, y solo acá: el resto del motor no conoce estas claves. Cada objeto se arma clave
// por clave, sin copiar el de adentro: lo que el motor lleve de más no sale.

export type VeredictoPublico = "verificada" | "a-revisar" | "sin-lectura" | "no-disponible";

const VEREDICTOS: Record<StatementReading["verdict"], VeredictoPublico> = {
  verified: "verificada",
  weak: "a-revisar",
  abstained: "sin-lectura",
  unavailable: "no-disponible",
};

const SEGUN: Record<TypeSource, "empresa" | "tabla" | "regla" | "ninguna"> = {
  company: "empresa",
  table: "tabla",
  rule: "regla",
  none: "ninguna",
};

const ORIGENES = { cell: "celda", text: "texto", pdf: "pdf", ocr: "ocr" } as const;

const pesos = (cents: number | null): number | null => (cents === null ? null : cents / 100);

export interface LecturaPublica {
  huella: string;
  veredicto: VeredictoPublico;
  motivo: string | null;
  encabezado: {
    banco: { codigo: string | null; nombre: string | null };
    cuenta: string | null;
    cbu: string | null;
    moneda: string | null;
    periodoDesde: string | null;
    periodoHasta: string | null;
    saldoInicial: number | null;
    saldoFinal: number | null;
  } | null;
  renglones: Array<{
    id: string;
    orden: number;
    fecha: string;
    fechaValor: string | null;
    tipo: { codigo: string; segun: "empresa" | "tabla" | "regla" | "ninguna" };
    importe: number;
    saldo: number | null;
    referencia: string | null;
    contraparte: { cuit: string | null; nombre: string | null; cbu: string | null } | null;
    delBanco: { codigo: string | null; texto: string; complementos: string[] };
    encadena: boolean | null;
    procedencia: { origen: "celda" | "texto" | "pdf" | "ocr"; hoja: string | null; pagina: number | null; paginaHasta: number | null; filaDesde: number; filaHasta: number };
  }>;
  avisos: Array<{ codigo: string; detalle: string; frenaPropuestas: boolean; renglones?: number[]; datos?: Record<string, string | number | null> }>;
  controles: {
    sentido: "cronologico" | "inverso";
    saldoDeLaFila: "despues" | "antes" | null;
    renglonesConSaldo: number;
    renglonesQueEncadenan: number;
    cierraConSusSaldos: boolean | null;
    cierraConProntoNet: boolean | null;
  } | null;
}

type Renglon = LecturaPublica["renglones"][number];

export const toPublicReading = (r: StatementReading): LecturaPublica => {
  // Sin lectura y no disponible no traen encabezado, renglones ni controles, traiga lo que traiga la lectura.
  const read = r.verdict === "verified" || r.verdict === "weak";
  const { header, checks } = r;
  // Con la lectura cortada, el renglón leído más cercano a la punta que no se vio no es esa punta del extracto: su fecha,
  // su saldo y el cierre de los saldos afirmarían lo que no se vio. Solo un saldo impreso, con su rótulo en una página leída, se conserva.
  const partial = isPartialReading(r);
  const unseen = unseenEnd(r);
  return {
    huella: r.fingerprint,
    veredicto: VEREDICTOS[r.verdict],
    motivo: r.reason,
    encabezado:
      read && header
        ? {
            banco: { codigo: header.bankCode, nombre: header.bankName },
            cuenta: header.account,
            cbu: header.cbu,
            moneda: header.currency,
            periodoDesde: unseen === "opening" ? null : header.periodFrom,
            periodoHasta: unseen === "closing" ? null : header.periodTo,
            saldoInicial: balanceUnseen(r, "opening") ? null : pesos(header.openingBalanceCents),
            saldoFinal: balanceUnseen(r, "closing") ? null : pesos(header.closingBalanceCents),
          }
        : null,
    renglones: read
      ? r.lines.map(
          (l): Renglon => ({
            id: l.id,
            orden: l.order,
            fecha: l.date,
            fechaValor: l.valueDate,
            tipo: { codigo: l.type.code, segun: SEGUN[l.type.source] },
            importe: l.amountCents / 100,
            saldo: pesos(l.balanceCents),
            referencia: l.reference,
            contraparte:
              l.counterparty && (l.counterparty.cuit !== null || l.counterparty.cbu !== null)
                ? { cuit: l.counterparty.cuit, nombre: l.counterparty.name, cbu: l.counterparty.cbu }
                : null,
            delBanco: { codigo: l.bank.code, texto: l.bank.text, complementos: [...l.bank.extras] },
            encadena: l.chains,
            procedencia: {
              origen: ORIGENES[l.provenance.origin],
              hoja: l.provenance.sheet,
              pagina: l.provenance.page,
              paginaHasta: l.provenance.pageTo,
              filaDesde: l.provenance.fromRow,
              filaHasta: l.provenance.toRow,
            },
          }),
        )
      : [],
    avisos: r.warnings.map((w) => ({
      codigo: w.code,
      detalle: w.detail,
      frenaPropuestas: w.blocksProposals,
      ...(w.lines ? { renglones: [...w.lines] } : {}),
      ...(w.data ? { datos: { ...w.data } } : {}),
    })),
    controles:
      read && checks
        ? {
            sentido: checks.direction === "chronological" ? "cronologico" : "inverso",
            saldoDeLaFila: checks.balanceIs === null || checks.linesWithBalance === 0 ? null : checks.balanceIs === "after" ? "despues" : "antes",
            renglonesConSaldo: checks.linesWithBalance,
            renglonesQueEncadenan: checks.linesThatChain,
            cierraConSusSaldos: partial ? null : checks.closesWithOwnBalances,
            cierraConProntoNet: partial ? null : checks.closesWithProntoNet,
          }
        : null,
  };
};
