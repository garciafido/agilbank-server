/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Lo que el laboratorio de temas necesita SABER, separado de cómo lo dibuja.
 *
 * Dos preguntas, y las dos se contestan derivando en vez de anotando:
 *
 *  1. **¿Qué acabé de cambiar?** Se compara el tema anterior con el nuevo y se
 *     marcan los ejemplos que muestran alguno de los tokens que se movieron. Es
 *     la pregunta que un laboratorio tiene que contestar, y NO es la misma que
 *     "¿qué toca este control?": un control puede no mover nada —declarar la
 *     intensidad de fábrica, elegir la capa que ya estaba— y entonces la
 *     respuesta honesta es "nada", que una lista escrita al lado nunca daría.
 *  2. **¿De dónde sale este color?** La cadena completa, del token de componente
 *     al escalón de la escala.
 *
 * Vive acá y no en el cliente porque es lógica pura y se puede probar: en el
 * cliente sería un puñado de funciones dentro de un componente, sin forma de
 * comprobar que la cadena que muestra es la cadena que el sistema recorrió.
 *
 * **Nada de esto se anota a mano.** Un mapa control→ejemplos escrito al lado se
 * desincroniza en silencio la primera vez que un control cambia de alcance, y el
 * síntoma —un ejemplo que no se marca— es invisible.
 */

import { Hex } from "./color";
import { ResolvedTheme, SemanticSet } from "./types";

/** Un token y su valor, por camino: `light.raised.bg`, `components.button.radius`. */
export type Caminos = Record<string, string | number>;

const isLeaf = (v: unknown): v is string | number =>
  typeof v === "string" || typeof v === "number";

/**
 * Todos los tokens de un tema, aplanados a `camino → valor`.
 *
 * Se aplanan los tres niveles juntos —primitivos, conjuntos semánticos y tokens
 * de componente— porque la pregunta que esto contesta no distingue nivel: quien
 * mueve un control quiere ver qué cambió en la PANTALLA, y en la pantalla los
 * tres niveles llegan mezclados.
 *
 * Se excluye `matu`: es el corpus del que sale el tema, no el tema. Incluirlo
 * haría que cualquier cambio de combinación marcara todo, que es lo mismo que no
 * marcar nada.
 */
export function caminosDeTokens(theme: ResolvedTheme): Caminos {
  const output: Caminos = {};
  const traverse = (node: unknown, prefix: string) => {
    if (isLeaf(node)) {
      output[prefix] = node;
      return;
    }
    if (node === null || typeof node !== "object" || Array.isArray(node))
      return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      traverse(v, prefix ? `${prefix}.${k}` : k);
    }
  };
  traverse({ light: theme.light, dark: theme.dark }, "");
  traverse(theme.primitives, "primitives");
  traverse(theme.components, "components");
  return output;
}

/**
 * Los caminos cuyo valor difiere entre dos temas.
 *
 * Un camino que aparece o desaparece cuenta como cambio: una superficie que un
 * preset declara y otro no ES una diferencia, y tratarla como "igual" haría que
 * pasar de un preset a otro no marcara nada.
 */
export function queCambio(
  before: ResolvedTheme,
  after: ResolvedTheme
): Set<string> {
  const a = caminosDeTokens(before);
  const b = caminosDeTokens(after);
  const changes = new Set<string>();
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[k] !== b[k]) changes.add(k);
  }
  return changes;
}

/**
 * Una ZONA del tema: un pedazo del espacio de tokens con un nombre que se
 * reconoce en pantalla.
 *
 * No es una lista de los ejemplos de la galería, y la distinción importa: la
 * galería tiene su propio catálogo de ~40 entradas por COMPONENTE, y anotarle a
 * cada una qué tokens muestra sería exactamente la lista paralela que se
 * desincroniza. Esto es otro eje — una partición del espacio de tokens — y su
 * integridad no depende de que alguien la mantenga al día: el test de cobertura
 * comprueba que todo color de un conjunto semántico caiga en alguna zona, así
 * que un token nuevo sin zona rompe la suite en vez de dejar de marcarse.
 *
 * Los caminos son PREFIJOS y no tokens exactos, y eso es a propósito: la zona de
 * grillas abarca todo lo que cuelga de `families.grid`, y enumerar sus hojas
 * obligaría a volver acá cada vez que la familia gane una.
 *
 * Sin el modo adelante: una zona existe en las dos mitades, y cuál se marca lo
 * decide el camino que cambió. Es lo que deja ver un defecto de un solo modo —los
 * únicos que aparecieron en todo este trabajo— sin cambiar de vista.
 */
export interface Zona {
  id: string;
  titulo: string;
  /** Prefijos de camino, sin `light.`/`dark.` adelante. */
  muestra: string[];
}

/**
 * Las zonas, nombradas por lo que se VE en pantalla — que es la otra mitad de la
 * organización mixta: los controles se agrupan por tipo de decisión y lo que
 * cambia se nombra por dónde aparece.
 */
export const ZONAS: Zona[] = [
  {
    id: "pagina",
    titulo: "Página y tarjetas",
    muestra: ["page", "raised", "sunken", "text", "divider", "components.card"],
  },
  {
    id: "botones",
    titulo: "Botones",
    muestra: ["primary", "secondary", "components.button"],
  },
  {
    id: "campos",
    titulo: "Campos",
    muestra: [
      "families.field",
      "focusRing",
      "components.field",
      "components.input",
      // Un chip se dibuja adentro de un campo de selección múltiple y toma su
      // radio del mismo ajuste: va con los campos y no con el cromo.
      "components.chip",
    ],
  },
  {
    id: "grillas",
    titulo: "Grillas",
    muestra: ["families.grid", "components.table", "components.grid"],
  },
  { id: "cromo", titulo: "Barra y menú", muestra: ["appBar", "sidebar"] },
  {
    id: "estados",
    titulo: "Avisos y estados",
    muestra: ["error", "warning", "success", "info"],
  },
  { id: "sensible", titulo: "Dato sensible", muestra: ["sensitive"] },
  {
    id: "flotante",
    titulo: "Tooltip y menús",
    muestra: [
      "inverse",
      "components.tooltip",
      "components.menu",
      // Un diálogo es lo mismo que un tooltip para esta partición: algo que
      // flota por encima de la página, con su propio radio y su propia capa.
      "components.dialog",
      "primitives.layers",
    ],
  },
  {
    id: "letra",
    titulo: "Tipografía",
    muestra: [
      "primitives.typography",
      "primitives.fontSize",
      // Los INGREDIENTES de la rampa: los tamaños y los interlineados crudos de
      // los que la escala se compone. Mover la densidad los mueve, y sin esto
      // el destacado decía que no había cambiado nada.
      "primitives.typographyIngredients",
    ],
  },
  {
    id: "forma",
    titulo: "Forma y espacio",
    muestra: [
      "primitives.radius",
      "primitives.radiusProgression",
      "primitives.spacing",
      "primitives.spacingUnit",
      "primitives.focus",
      "primitives.stroke",
      // Las opacidades son la escala con la que el sistema atenúa: el texto
      // secundario, lo deshabilitado, los velos. Es forma, no color — el color
      // es el mismo y lo que cambia es cuánto se ve.
      "primitives.opacity",
    ],
  },
  {
    id: "relieve",
    titulo: "Relieve y movimiento",
    muestra: [
      "primitives.elevation",
      "primitives.shadows",
      "primitives.motion",
      "primitives.duration",
    ],
  },
  { id: "iconos", titulo: "Íconos", muestra: ["primitives.icons"] },
  /**
   * La ESCALA de la que salen todos los colores.
   *
   * Los presets derivados llevan sus familias de once escalones en
   * `primitives.scales`, y no estaban en ninguna zona: cambiar la marca movía 79
   * caminos que el destacado no podía nombrar. Es su propia zona y no parte de
   * "Página y tarjetas" porque es el ORIGEN, no un lugar donde se ve: la pantalla
   * donde se mira es el rail de inspección, que la dibuja escalón por escalón.
   */
  { id: "escala", titulo: "Escala de color", muestra: ["primitives.scales"] },
];

/** Si un camino cae dentro de lo que un ejemplo muestra, en cualquiera de los modos. */
const showsIt = (zone: Zona, path: string): boolean => {
  const withoutMode = path.replace(/^(light|dark)\./, "");
  return zone.muestra.some(
    (p) => withoutMode === p || withoutMode.startsWith(p + ".")
  );
};

/**
 * Qué zonas MARCAR, y en qué mitad, después de un cambio.
 *
 * La mitad importa: un cambio que solo mueve el modo oscuro tiene que marcar la
 * mitad oscura y no la clara. Todos los defectos de contraste que aparecieron en
 * este trabajo eran de un solo modo, y con una sola mitad a la vista
 * sobrevivieron meses.
 *
 * Un camino que no lleva modo —los primitivos y los tokens de componente— marca
 * las DOS: no es una imprecisión, es que el token vale para las dos mitades.
 */
export function zonasTocadas(
  changes: Set<string>
): Map<string, Set<"light" | "dark">> {
  const touched = new Map<string, Set<"light" | "dark">>();
  const mark = (id: string, mode: "light" | "dark") => {
    const previous = touched.get(id) ?? new Set<"light" | "dark">();
    previous.add(mode);
    touched.set(id, previous);
  };
  for (const path of changes) {
    const mode = path.startsWith("light.")
      ? "light"
      : path.startsWith("dark.")
      ? "dark"
      : null;
    for (const zone of ZONAS) {
      if (!showsIt(zone, path)) continue;
      if (mode) mark(zone.id, mode);
      else {
        mark(zone.id, "light");
        mark(zone.id, "dark");
      }
    }
  }
  return touched;
}

/** Un eslabón de la cadena: cómo se llama y qué vale ahí. */
export interface Eslabon {
  /** De qué se trata este paso: "token de componente", "escalón de la escala"… */
  nivel: string;
  /** El nombre del token o del rol en ese nivel. */
  nombre: string;
  /** Lo que vale. */
  valor: string;
}

/**
 * De dónde sale un color, eslabón por eslabón.
 *
 * Es la respuesta a "¿por qué este gris?", que es la pregunta que el laboratorio
 * no podía contestar: se movía un desplegable y algo cambiaba en algún lado, sin
 * ver qué. La cadena se RECONSTRUYE buscando el valor hacia atrás en el corpus,
 * no leyendo un mapa: un mapa escrito acá diría lo que creíamos que hace el
 * adaptador, y esto dice lo que hizo.
 *
 * Los eslabones son los cuatro del sistema de Matu más el token que se clickeó:
 * token semántico → rol de una capa → posición del modo → escalón de la escala.
 * En un preset que no viene de Matu la cadena tiene un solo eslabón, y eso no es
 * una falla: sus colores llegan ya resueltos, sin progresión intermedia. Decirlo
 * es más honesto que inventarle una.
 */
export function cadenaDeColor(
  theme: ResolvedTheme,
  mode: "light" | "dark",
  path: string
): Eslabon[] {
  const value = caminosDeTokens(theme)[`${mode}.${path}`];
  if (typeof value !== "string") return [];

  const chain: Eslabon[] = [
    { nivel: "token del tema", nombre: path, valor: value },
  ];
  const layers = theme.matu;
  if (!layers) return chain;

  // El ROL: qué capa de contraste y qué rol tienen exactamente este color. Se
  // recorren todas porque un mismo color puede estar en más de una, y la primera
  // en el orden del corpus es la que el adaptador leería.
  const contrast = layers[mode]?.contrast ?? {};
  for (const [layer, roles] of Object.entries(contrast)) {
    const role = Object.entries(roles as Record<string, string>).find(
      ([, v]) => v === value
    );
    if (role) {
      chain.push({
        nivel: "rol de capa",
        nombre: `${layer} · ${role[0]}`,
        valor: value,
      });
      break;
    }
  }

  // La POSICIÓN del modo: cómo Matu llama a este color dentro del modo claro u
  // oscuro (`Tint`, `Vivid`, `Contrast`…). Es el eslabón que explica por qué el
  // tema oscuro no es el claro invertido.
  const positions =
    (layers[mode] as { ink?: Record<string, string> })?.ink ?? {};
  const position = Object.entries(positions).find(([, v]) => v === value);
  if (position)
    chain.push({
      nivel: "posición del modo",
      nombre: position[0],
      valor: value,
    });

  // El ESCALÓN de la escala de marca: el origen de todo.
  const step = Object.entries(layers.baseColors ?? {}).find(
    ([, v]) => v === value
  );
  if (step)
    chain.push({
      nivel: "escalón de la escala",
      nombre: step[0],
      valor: value,
    });

  return chain;
}

/**
 * Qué le tomó el sistema a un color de marca elegido, y qué NO.
 *
 * Es lo que el control de color tiene que decir para no parecer roto: de la
 * semilla salen el tono y la croma, y la luminosidad de cada escalón la fija el
 * generador. Sin decirlo, la rueda "no toma el color" — el que vuelve nunca es
 * exactamente el que se picó, y eso se lee como un defecto.
 */
export interface SeedReading {
  hue: number;
  chroma: number;
  /** El escalón principal que produjo, para poder mostrarlo al lado. */
  result: Hex;
}

/** Los caminos de color de un conjunto semántico: lo que se puede inspeccionar. */
export function caminosDeColor(set: SemanticSet): string[] {
  const output: string[] = [];
  const traverse = (node: unknown, prefix: string) => {
    if (typeof node === "string") {
      if (/^#[0-9A-Fa-f]{3,8}$/.test(node)) output.push(prefix);
      return;
    }
    if (node === null || typeof node !== "object" || Array.isArray(node))
      return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      traverse(v, prefix ? `${prefix}.${k}` : k);
    }
  };
  traverse(set, "");
  return output;
}
