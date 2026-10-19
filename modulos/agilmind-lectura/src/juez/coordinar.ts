// agilmind-lectura/src/juez/coordinar.ts
import { TOPE_POR_DEFECTO } from "./contrato";
import type { Campo, Control, ControlDelJuez, Declaracion, Dictamen, Estado, Faltante, Juez, Lectura, ListaAlternativa, Propuesta, Valor, Verdict } from "./contrato";
import { acotar, masDebil } from "./firmeza";
import { indice } from "./indice";

export const VERSION_DEL_MODULO = "1";

const porId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** El orden canónico de la entrada: los campos sueltos por id; las listas por id, con sus elementos en su orden. */
const canonica = (l: Lectura): Lectura => ({ campos: [...l.campos].sort(porId), listas: [...l.listas].sort(porId) });

const VEREDICTOS: ReadonlySet<string> = new Set<Verdict>(["verified", "grounded", "weak", "abstained", "unavailable"]);
const ESTADOS: ReadonlySet<string> = new Set<Estado>(["cierra", "cierra-por-construccion", "no-cierra", "no-se-puede-juzgar"]);

/** Lo más firme que puede afirmar un control según su estado, lo declare el juez o no. */
const TOPE_DEL_ESTADO: Partial<Record<Estado, { tope: Verdict; nota: string }>> = {
  "cierra-por-construccion": { tope: "abstained", nota: "cierra por construcción: no aporta evidencia" },
  "no-cierra": { tope: "weak", nota: "un control que no cierra no afirma más que weak" },
  "no-se-puede-juzgar": { tope: "abstained", nota: "sin juzgar no hay lectura que afirmar" },
};

function fallaDelJuez(j: Juez, e: unknown, tarea: "juzgar" | "proponer"): Control {
  const mensaje = e instanceof Error ? e.message : String(e);
  return {
    id: `${j.id}: no se pudo ${tarea}`, estado: "no-se-puede-juzgar", residuo: null, partes: [], faltan: [],
    sospechosos: { informa: false }, posicion: { informa: false }, veredicto: "unavailable",
    motivo: tarea === "juzgar" ? `el juez falló: ${mensaje}` : `el juez falló al proponer: ${mensaje}`,
    juez: j.id, parteMasDebil: "unavailable",
  };
}

/**
 * Cómo cuenta una parte para el eslabón más débil. `unavailable` (no pudimos mirar) vale aunque el valor sea
 * null, y un veredicto fuera de los cinco no se puede interpretar, con o sin valor: cuenta igual. Cualquier
 * otra parte sin valor, o ausente de la lectura, es `abstained`. Lo usan los controles y las propuestas.
 */
function veredictoDeParte(p: Campo | undefined): Verdict {
  if (p === undefined) return "abstained";
  if (p.valor === null && VEREDICTOS.has(p.veredicto) && p.veredicto !== "unavailable") return "abstained";
  return p.veredicto;
}

const faltanValido = (f: unknown) => typeof f === "object" && f !== null
  && (typeof (f as { campo?: unknown }).campo === "string" || typeof (f as { elementoDe?: unknown }).elementoDe === "string");

/** Lo que el coordinador sabe de una parte citada: su eslabón, los campos que la forman y si falta. */
interface Parte { veredicto: Verdict; campos: Campo[]; falta: Faltante | null }

/**
 * Una parte es un campo, o una lista entera si su id es el de una lista y no el de un campo. Una lista con
 * elementos está presente y vale lo que el más débil de ellos; una vacía falta, como falta un campo sin valor.
 * Dos listas con el mismo id cuentan juntas. Es lo mismo que mira `alternativas()`: citar la lista es usarla.
 */
function partesDeLaLectura(lectura: Lectura): (id: string) => Parte {
  const campos = indice(lectura);
  const listas = new Map<string, Campo[]>();
  for (const l of lectura.listas) listas.set(l.id, [...(listas.get(l.id) ?? []), ...l.elementos]);
  return (id) => {
    const c = campos.get(id);
    const elementos = c === undefined ? listas.get(id) : undefined;
    if (elementos === undefined) return { veredicto: veredictoDeParte(c), campos: c ? [c] : [], falta: c === undefined || c.valor === null ? { campo: id } : null };
    if (!elementos.length) return { veredicto: "abstained", campos: [], falta: { elementoDe: id } };
    return { veredicto: masDebil(elementos.map(veredictoDeParte)), campos: elementos, falta: null };
  };
}

const nombreDe = (f: Faltante) => ("campo" in f ? f.campo : f.elementoDe);
const anotada = (f: Faltante, g: Faltante) => ("campo" in f
  ? (g as { campo?: string }).campo === f.campo
  : (g as { elementoDe?: string }).elementoDe === f.elementoDe);

/** Las reglas que valen para todo control, de todo juez: ver §4 de la spec. */
function normalizar(c: ControlDelJuez, juez: string, parteDe: (id: string) => Parte): Control {
  if (typeof c.id !== "string" || typeof c.motivo !== "string" || !Array.isArray(c.partes) || !Array.isArray(c.faltan) || !c.faltan.every(faltanValido)) {
    throw new Error(`control mal formado: ${typeof c.id === "string" ? c.id : "sin id"}`);
  }
  if (!ESTADOS.has(c.estado)) throw new Error(`control mal formado: ${c.id} · estado desconocido`);
  const partes = [...new Set(c.partes)].map(parteDe);
  const base: Control = { ...c, juez, parteMasDebil: masDebil(partes.map((p) => p.veredicto)) };

  const faltan = partes.flatMap((p) => (p.falta ? [p.falta] : []));
  const nuevas = faltan.filter((f) => !c.faltan.some((g) => anotada(f, g)));
  const sinJuzgar = { ...base, estado: "no-se-puede-juzgar" as const, residuo: null };
  if (!VEREDICTOS.has(c.veredicto)) {
    return { ...sinJuzgar, veredicto: "unavailable", faltan: [...c.faltan, ...nuevas], motivo: `${c.motivo} · veredicto fuera de la escala` };
  }
  if (base.parteMasDebil === "unavailable") {
    return { ...sinJuzgar, veredicto: "unavailable", faltan: [...c.faltan, ...nuevas], motivo: `${c.motivo} · una parte no se pudo mirar` };
  }
  if (faltan.length) {
    return { ...sinJuzgar, veredicto: masDebil([c.veredicto, "abstained"]), faltan: [...c.faltan, ...nuevas], motivo: `${c.motivo} · falta: ${faltan.map(nombreDe).join(", ")}` };
  }
  const campos = partes.flatMap((p) => p.campos);
  const monedas = new Set(campos.flatMap((p) => (p.valor?.tipo === "centavos" ? [p.valor.moneda] : [])));
  if (monedas.size > 1) {
    return { ...sinJuzgar, veredicto: masDebil([c.veredicto, "abstained"]), motivo: `${c.motivo} · partes en monedas distintas (${[...monedas].sort().join(", ")})` };
  }
  if (c.estado === "cierra" && campos.some((p) => p.derivadaDe?.includes(c.id))) {
    return { ...base, estado: "cierra-por-construccion", veredicto: masDebil([c.veredicto, "abstained"]), motivo: `${c.motivo} · una parte salió de despejar este mismo control: no aporta evidencia` };
  }
  const t = TOPE_DEL_ESTADO[c.estado];
  const acotado = t ? acotar(c.veredicto, t.tope) : c.veredicto;
  if (t && acotado !== c.veredicto) return { ...base, veredicto: acotado, motivo: `${c.motivo} · ${t.nota}` };
  return base;
}

function juzgarTodo(lectura: Lectura, d: Declaracion): { controles: Control[]; fallas: Set<string>; rotos: string[] } {
  const parteDe = partesDeLaLectura(lectura);
  const out: Control[] = [];
  const fallas = new Set<string>();
  const rotos: string[] = [];
  for (const j of [...d.jueces].sort(porId)) {
    let propios: Control[];
    try {
      propios = j.juzgar(structuredClone(lectura)).map((c) => normalizar(c, j.id, parteDe));
    } catch (e) {
      if (d.estricto) throw e;
      propios = [fallaDelJuez(j, e, "juzgar")];
      fallas.add(propios[0].id);
      rotos.push(j.id);
    }
    out.push(...propios.sort(porId));
  }
  return { controles: out, fallas, rotos };
}

const claveDe = (v: Valor) => JSON.stringify([v.tipo, v.valor, v.tipo === "centavos" ? v.moneda : null]);

const unica = (xs: string[][]) => [...new Set(xs.flat())].sort();

interface Respaldo { controles: Control[]; falla: boolean }

/** Dos jueces pueden emitir controles con el mismo id: el tope junta las partes de todos, el más débil gana. */
function respaldoPorControl(controles: Control[], fallas: Set<string>): Map<string, Respaldo> {
  const m = new Map<string, Respaldo>();
  for (const c of controles) {
    const antes = m.get(c.id);
    m.set(c.id, { controles: [...(antes?.controles ?? []), c], falla: (antes?.falla ?? false) || fallas.has(c.id) });
  }
  return m;
}

interface De { juez: string; p: Propuesta; notas: string[] }

function valorValido(v: Valor): boolean {
  if (!v || typeof v !== "object") return false;
  if (v.tipo === "centavos") return Number.isSafeInteger(v.valor) && typeof v.moneda === "string" && v.moneda !== "";
  if (v.tipo === "texto" || v.tipo === "fecha") return typeof v.valor === "string";
  return false;
}

function malFormada(p: Propuesta): boolean {
  return typeof p?.campo !== "string" || !valorValido(p.valor)
    || !Array.isArray(p.derivadaDe) || !Array.isArray(p.controles)
    || (p.origen !== undefined && typeof p.origen?.camino !== "string");
}

/**
 * Mismo campo y mismo valor, venga de quien venga: una sola entrada. El veredicto es el más débil de todas
 * (y de `tope`), y el motivo se arma al final, con el veredicto que quedó.
 */
function fundir(grupo: De[], tope: Verdict, notasFinales: string[]): Propuesta {
  const ps = grupo.map((x) => x.p);
  const jueces = [...new Set(grupo.map((x) => x.juez))];
  const veredicto = acotar(masDebil(ps.map((p) => p.veredicto)), tope);
  const notas = [...new Set([...grupo.flatMap((x) => x.notas), ...notasFinales])];
  const quien = jueces.length === grupo.length ? `jueces: ${jueces.join(", ")}` : `entradas de ${jueces.join(", ")}`;
  const cabecera = grupo.length === 1 ? ps[0].motivo : `la proponen ${grupo.length} ${quien} · veredicto ${veredicto}`;
  return {
    ...ps[0],
    controles: unica(ps.map((p) => p.controles)),
    derivadaDe: unica(ps.map((p) => p.derivadaDe)),
    origen: ps.every((p) => p.origen) ? ps[0].origen : undefined,
    veredicto,
    motivo: [cabecera, ...notas].join(" · "),
  };
}

function proponerTodo(lectura: Lectura, d: Declaracion, controles: Control[], fallasDeJuzgar: Set<string>, rotosAlJuzgar: string[]) {
  const campos = indice(lectura);
  const crudas: Array<{ juez: string; p: Propuesta }> = [];
  const dudosas: Array<{ juez: string; p: Propuesta }> = [];
  const fallas: Control[] = [];
  const truncados = new Set<string>();
  for (const j of [...d.jueces].sort(porId)) {
    if (!j.proponer || !d.despeja.has(j.id)) continue;
    try {
      const r = j.proponer(structuredClone(lectura), structuredClone(d.tope));
      const propias = [...r.propuestas];
      const ambiguas = [...r.ambiguas];
      if (typeof r.truncada !== "boolean") throw new Error("respuesta mal formada: truncada");
      for (const p of [...propias, ...ambiguas]) {
        if (malFormada(p)) throw new Error(`propuesta mal formada: ${String(p?.campo)}`);
      }
      crudas.push(...propias.map((p) => ({ juez: j.id, p })));
      dudosas.push(...ambiguas.map((p) => ({ juez: j.id, p })));
      if (r.truncada) truncados.add(j.id);
    } catch (e) {
      if (d.estricto) throw e;
      fallas.push(fallaDelJuez(j, e, "proponer"));
    }
  }
  const respaldo = respaldoPorControl([...controles, ...fallas], new Set([...fallasDeJuzgar, ...fallas.map((f) => f.id)]));
  const acotada = (juez: string, p: Propuesta): De => {
    // Si algún juzgar falló, todo control citado es unavailable: el juez roto pudo emitirlo, o emitir otro
    // con el mismo id que lo debilitara, y no se sabe. Si no, cada control citado aporta su eslabón: uno que
    // ningún juez emitió es una parte ausente; uno de falla, algo que no se pudo mirar. Además de sus partes
    // pesa su propio veredicto si es unavailable o
    // abstained (no se pudo calcular), salvo que incluya al campo propuesto: está sin juzgar justamente
    // porque ese campo falta. Un control sin partes propias no respalda nada y pesa como un candidato.
    // Uno que no cierra (weak) no aporta: es el que motiva despejar.
    const usadas = new Set<string>();
    const notas: string[] = [];
    const sinJuzgarEntero = rotosAlJuzgar.length > 0 && p.derivadaDe.length > 0;
    if (sinJuzgarEntero) notas.push(`falló el juzgar de ${rotosAlJuzgar.join(", ")}: los controles citados no se pudieron comprobar`);
    const veredictos = sinJuzgarEntero ? ["unavailable" as Verdict] : p.derivadaDe.flatMap((id): Verdict[] => {
      const r = respaldo.get(id);
      if (!r) return ["abstained"];
      if (r.falla) return ["unavailable"];
      const propios = r.controles.filter((c) => !c.partes.includes(p.campo) && (c.veredicto === "unavailable" || c.veredicto === "abstained")).map((c) => c.veredicto);
      const partes = new Set(r.controles.flatMap((c) => c.partes).filter((parte) => parte !== p.campo));
      partes.forEach((parte) => usadas.add(parte));
      return [...propios, ...(partes.size ? [...partes].map((parte) => veredictoDeParte(campos.get(parte))) : ["weak" as Verdict])];
    });
    let v = acotar(p.veredicto, veredictos.length ? masDebil(veredictos) : "weak");
    if (!p.origen) v = acotar(v, "weak");
    const partesUsadas = [...usadas].map((id) => campos.get(id)?.valor);
    const ajena = p.valor.tipo === "centavos"
      && partesUsadas.some((x) => x?.tipo === "centavos" && x.moneda !== (p.valor as { moneda: string }).moneda);
    // Una parte sin valor ya dejó la propuesta abstained o más débil por su veredicto: el tipo solo se mira entre valores.
    const otroTipo = partesUsadas.some((x) => x && (x.tipo === "centavos") !== (p.valor.tipo === "centavos"));
    if (ajena) {
      v = acotar(v, "abstained");
      notas.push("moneda distinta de sus partes");
    }
    if (otroTipo) {
      v = acotar(v, "abstained");
      notas.push("tipo distinto de sus partes");
    }
    return { juez, p: { ...p, veredicto: v }, notas };
  };
  // Un juez de despeja roto o truncado no probó todo: la unicidad de cualquier campo queda sin comprobar.
  const sinComprobar = fallas.length > 0 || truncados.size > 0;
  const notasFinales = [
    ...(fallas.length ? [`no se pudo comprobar la unicidad: falló ${fallas.map((f) => f.juez).join(", ")}`] : []),
    ...(truncados.size ? [`tope de búsqueda tocado por ${[...truncados].join(", ")}: no se probó todo`] : []),
  ];

  // La unicidad cuenta todo lo probado: propuestas y ambiguas de todos los jueces, por campo.
  const porCampo = new Map<string, { propuestas: De[]; ambiguas: De[] }>();
  const entrada = (campo: string) => porCampo.get(campo) ?? porCampo.set(campo, { propuestas: [], ambiguas: [] }).get(campo)!;
  for (const x of crudas) entrada(x.p.campo).propuestas.push(acotada(x.juez, x.p));
  for (const x of dudosas) entrada(x.p.campo).ambiguas.push(acotada(x.juez, x.p));

  const propuestas: Propuesta[] = [];
  const ambiguas: Propuesta[] = [];
  for (const [, { propuestas: ps, ambiguas: as }] of [...porCampo].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const porValor = new Map<string, De[]>();
    for (const x of [...ps, ...as].sort((a, b) => porId({ id: a.juez }, { id: b.juez }))) porValor.set(claveDe(x.p.valor), [...(porValor.get(claveDe(x.p.valor)) ?? []), x]);
    const fundidas = [...porValor].sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, grupo]) => fundir(grupo, sinComprobar ? "weak" : "verified", notasFinales));
    if (fundidas.length === 1 && as.length === 0) propuestas.push(fundidas[0]);
    else ambiguas.push(...fundidas);
  }
  return { propuestas, ambiguas, truncada: truncados.size > 0, fallas };
}

/**
 * Regla 9: en todos los que no cierran y en ninguno de los que cierran. Informativo: ordena dónde mirar.
 * Un control sin partes (la completitud) no señala dónde mirar y dejaría vacía la intersección: no entra.
 */
function interseccion(controles: Control[]): string[] {
  const fallan = controles.filter((c) => c.estado === "no-cierra" && c.partes.length > 0);
  if (!fallan.length) return [];
  const descartados = new Set(controles.filter((c) => c.estado === "cierra").flatMap((c) => c.partes));
  const comunes = fallan.map((c) => new Set(c.partes)).reduce((a, b) => new Set([...a].filter((x) => b.has(x))));
  return [...comunes].filter((x) => !descartados.has(x)).sort();
}

const JUEZ_DEL_COORDINADOR = "coordinador";

function alternativaMalFormada(lista: string, k: number, e: unknown): Control {
  return {
    id: `${JUEZ_DEL_COORDINADOR}: alternativa ${k} de ${lista} mal formada`, estado: "no-se-puede-juzgar", residuo: null, partes: [], faltan: [],
    sospechosos: { informa: false }, posicion: { informa: false }, veredicto: "unavailable",
    motivo: `la alternativa no se pudo juzgar: ${e instanceof Error ? e.message : String(e)}`,
    juez: JUEZ_DEL_COORDINADOR, parteMasDebil: "unavailable",
  };
}

/**
 * Sobre una alternativa que no se pudo leer (`unavailable`) o que no tiene lectura (`abstained`) no se afirma
 * nada: ningún control cierra ni deja de cerrar, tenga elementos o no. Nunca más firme de lo que ya era.
 */
function sinLectura(c: Control, v: Verdict): Control {
  if (v !== "unavailable" && v !== "abstained") return c;
  const causa = v === "unavailable" ? "la alternativa no se pudo leer" : "la alternativa no tiene lectura";
  return { ...c, estado: "no-se-puede-juzgar", residuo: null, veredicto: masDebil([c.veredicto, v]), motivo: `${c.motivo} · ${causa}` };
}

const citaLista = (c: Control, lista: string) => c.faltan.some((f) => "elementoDe" in f && f.elementoDe === lista);
const claveDeControl = (c: Control) => JSON.stringify([c.juez, c.id]);

/**
 * La lectura que ve cada juez al juzgar una alternativa: ella reemplaza a su lista y ninguna lista lleva
 * alternativas. Cada elemento vale a lo sumo lo que la alternativa (`v`, ya normalizado). Tira si la
 * alternativa o la lista no tienen forma: lo atrapa quien la llama.
 */
function lecturaDeAlternativa(lectura: Lectura, lista: string, alt: ListaAlternativa, repetidas: Set<string>) {
  if (repetidas.has(lista)) throw new Error(`lista repetida: ${lista}`);
  if (!alt || typeof alt !== "object" || !Array.isArray(alt.elementos)) throw new Error("alternativa sin lista de elementos");
  if (!alt.elementos.every((e) => typeof e === "object" && e !== null && typeof e.id === "string")) throw new Error("elemento de la alternativa sin forma");
  const v = masDebil([alt.veredicto]);
  const acotados = alt.elementos.map((e) => ({ ...e, veredicto: acotar(e.veredicto, v) }));
  const otra: Lectura = {
    campos: lectura.campos,
    listas: lectura.listas.map((l) => ({ id: l.id, elementos: l.id === lista ? acotados : l.elementos })),
  };
  indice(otra);
  return { otra, v, ids: alt.elementos.map((e) => e.id) };
}

/**
 * Regla 11: los controles que usan la lista, juzgados con cada alternativa. El coordinador no elige ni propone.
 * `alternativa` es el índice en la entrada y el tope deja las primeras N en ese orden. La alternativa entera es
 * parte de todo control que usa la lista: acota sus elementos y, para todo control, su `parteMasDebil`.
 * Usa la lista el control que la cita, que cita un elemento suyo (principal o de la alternativa), que declara
 * faltarle elementos, o que es el de un juez con el id de uno principal que la usaba (cubre la alternativa
 * vacía). La falla de un juez roto no tiene partes y vale para toda alternativa: no se filtra.
 */
function alternativas(lectura: Lectura, d: Declaracion, principales: Control[]) {
  const porAlternativa: Dictamen["porAlternativa"] = [];
  let truncada = false;
  const vistas = new Set<string>();
  const repetidas = new Set<string>();
  for (const l of lectura.listas) (vistas.has(l.id) ? repetidas : vistas).add(l.id);
  for (const lista of lectura.listas) {
    const alts: unknown = lista.alternativas ?? [];
    if (!Array.isArray(alts)) {
      porAlternativa.push({ lista: lista.id, alternativa: 0, controles: [alternativaMalFormada(lista.id, 0, new Error("alternativas no es una lista"))] });
      continue;
    }
    if (alts.length > d.tope.alternativasDeLista) truncada = true;
    const propios = new Set([lista.id, ...lista.elementos.map((e) => e.id)]);
    const delPrincipal = new Set(principales.filter((c) => c.partes.some((p) => propios.has(p)) || citaLista(c, lista.id)).map(claveDeControl));
    alts.slice(0, d.tope.alternativasDeLista).forEach((alt: ListaAlternativa, k) => {
      let lec: ReturnType<typeof lecturaDeAlternativa>;
      try {
        lec = lecturaDeAlternativa(lectura, lista.id, alt, repetidas);
      } catch (e) {
        porAlternativa.push({ lista: lista.id, alternativa: k, controles: [alternativaMalFormada(lista.id, k, e)] });
        return;
      }
      const ids = new Set([...propios, ...lec.ids]);
      const { controles, fallas, rotos } = juzgarTodo(lec.otra, d);
      const esFalla = (c: Control) => fallas.has(c.id) && rotos.includes(c.juez);
      const usa = (c: Control) => esFalla(c)
        || c.partes.some((p) => ids.has(p)) || citaLista(c, lista.id) || delPrincipal.has(claveDeControl(c));
      const acotado = (c: Control) => sinLectura(esFalla(c) ? c : { ...c, parteMasDebil: acotar(c.parteMasDebil, lec.v) }, lec.v);
      porAlternativa.push({ lista: lista.id, alternativa: k, controles: controles.filter(usa).map(acotado) });
    });
  }
  return { porAlternativa, truncada };
}

/** Un tope que no es un entero >= 0 es un error de la declaración, no de la lectura: cortaría en silencio. */
function topeValido(d: Declaracion) {
  for (const k of Object.keys(TOPE_POR_DEFECTO) as Array<keyof typeof TOPE_POR_DEFECTO>) {
    const v: unknown = d.tope?.[k];
    if (!Number.isInteger(v) || (v as number) < 0) throw new Error(`tope inválido: ${k}`);
  }
}

function sinJuecesRepetidos(jueces: Juez[]) {
  const vistos = new Set<string>();
  for (const j of jueces) {
    if (vistos.has(j.id)) throw new Error(`juez repetido: ${j.id}`);
    vistos.add(j.id);
  }
}

export function coordinar(entrada: Lectura, d: Declaracion): Dictamen {
  sinJuecesRepetidos(d.jueces);
  topeValido(d);
  const lectura = canonica(entrada);
  const { controles: juzgados, fallas: fallasDeJuzgar, rotos } = juzgarTodo(lectura, d);
  const { propuestas, ambiguas, truncada, fallas } = proponerTodo(lectura, d, juzgados, fallasDeJuzgar, rotos);
  const alt = alternativas(lectura, d, juzgados);
  return {
    version: { modulo: VERSION_DEL_MODULO, jueces: Object.fromEntries([...d.jueces].sort(porId).map((j) => [j.id, j.version])) },
    controles: [...juzgados, ...fallas].sort((a, b) => (a.juez < b.juez ? -1 : a.juez > b.juez ? 1 : 0)),
    sospechososPorInterseccion: interseccion(juzgados),
    porAlternativa: alt.porAlternativa,
    propuestas,
    ambiguas,
    truncada: truncada || alt.truncada,
  };
}
