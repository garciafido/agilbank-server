import type { Campo, Lectura } from "./contrato";

/** Todos los campos de una lectura por id, con los elementos de las listas. Los ids son únicos. */
export function indice(lectura: Lectura): Map<string, Campo> {
  const m = new Map<string, Campo>();
  const poner = (c: Campo) => {
    if (m.has(c.id)) throw new Error(`id repetido: ${c.id}`);
    m.set(c.id, c);
  };
  lectura.campos.forEach(poner);
  for (const l of lectura.listas) l.elementos.forEach(poner);
  return m;
}
