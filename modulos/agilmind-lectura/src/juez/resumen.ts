// agilmind-lectura/src/juez/resumen.ts
import type { Control, Dictamen, DictamenResumido } from "./contrato";

function resumir(controles: Control[]): { controles: Control[]; cierran: Record<string, number> } {
  const cierran = new Map<string, number>();
  for (const c of controles) if (c.estado === "cierra") cierran.set(c.juez, (cierran.get(c.juez) ?? 0) + 1);
  return {
    controles: controles.filter((c) => c.estado !== "cierra"),
    cierran: Object.fromEntries([...cierran].sort(([a], [b]) => (a < b ? -1 : 1))),
  };
}

export function resumirDictamen(d: Dictamen): DictamenResumido {
  return {
    version: d.version,
    ...resumir(d.controles),
    sospechososPorInterseccion: d.sospechososPorInterseccion,
    porAlternativa: d.porAlternativa.map((a) => ({ lista: a.lista, alternativa: a.alternativa, ...resumir(a.controles) })),
    propuestas: d.propuestas,
    ambiguas: d.ambiguas,
    truncada: d.truncada,
  };
}
