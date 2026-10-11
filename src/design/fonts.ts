/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Las familias tipográficas que el sistema puede usar, como datos.
 *
 * Existe por lo mismo que la tabla de íconos: la decisión tiene que poder
 * tomarse eligiendo de una lista corta, no escribiendo una pila de respaldos a
 * mano. Un campo de texto libre para la familia parece más potente y es peor —
 * se escribe un nombre que el navegador no tiene y no pasa nada, sin aviso.
 *
 * **Lo que se APLICA se sirve desde el propio dominio con `@fontsource`, nunca
 * desde un CDN.** No es una preferencia: un sistema de gestión no puede depender
 * de que un tercero esté disponible para que sus pantallas se lean, y una
 * petición a otro dominio en cada carga cuenta a quién le pertenece cada usuario.
 *
 * De ahí `empaquetada`, y de ahí que el catálogo tenga DOS niveles. El costo del
 * nivel único estaba medido: las familias empaquetadas pesan ~2.4 MB cada una en
 * `node_modules` y el generador instala TODAS cuando el proyecto enciende el
 * laboratorio. Con 35 son 73 MB para que alguien pruebe tres. Cien serían 240.
 *
 * Así que se separa elegir de aplicar, y cada mitad conserva su regla:
 *
 * - **Elegir** en el laboratorio —una pantalla de SysAdmin— puede traer la
 *   familia de la red al seleccionarla. Los dos motivos del párrafo de arriba no
 *   alcanzan: no es una pantalla que alguien tenga que poder leer para trabajar,
 *   y la petición ocurre UNA vez, cuando un administrador la pide a propósito,
 *   nunca en la carga de un tenant.
 * - **Aplicar** de forma permanente exige que esté empaquetada. Una familia de
 *   sólo vista previa aplicada caería a los respaldos del sistema operativo, y
 *   hasta acá eso pasaba EN SILENCIO — el defecto que esta separación arregla.
 *
 * La vista previa se trae de jsDelivr y no de Google Fonts, y el motivo es
 * técnico: jsDelivr sirve los MISMOS paquetes `@fontsource` que el build
 * empaqueta, así que lo que se ve al probar son los mismos archivos que se van a
 * ver al aplicar. Con otro origen el subconjunto puede diferir y la vista previa
 * mentiría justo en lo que existe para mostrar.
 */

/**
 * El carácter de la familia. Es lo que hace elegible una lista larga: nadie
 * compara veintinueve nombres, pero sí elige primero un tono —neutra, con
 * personalidad, de lectura, angosta, monoespaciada— y después dentro de ese.
 */
export type Grupo =
  | "neutra"
  | "carácter"
  | "lectura"
  | "angosta"
  | "monoespaciada";

/**
 * El primer nivel de la jerarquía: la CLASE del dibujo de la letra.
 *
 * Cinco grupos planos ya eran muchos para recorrer, y el catálogo tiene que poder
 * crecer. Con dos niveles, elegir es primero una clase —¿sin serifas, con
 * serifas, monoespaciada?— y después un tono dentro de ella, que es como alguien
 * elige de verdad.
 */
export type Clase = "sans" | "serif" | "mono";

/** A qué clase pertenece cada grupo. Sale de acá y no de cada familia: es una
 * propiedad del grupo, y repetirla en cada entrada la deja desincronizarse. */
export const CLASE_DE_GRUPO: Record<Grupo, Clase> = {
  neutra: "sans",
  carácter: "sans",
  angosta: "sans",
  lectura: "serif",
  monoespaciada: "mono",
};

export const CLASES: { id: Clase; etiqueta: string }[] = [
  { id: "sans", etiqueta: "Sin serifas" },
  { id: "serif", etiqueta: "Con serifas" },
  { id: "mono", etiqueta: "Monoespaciadas" },
];

export interface Familia {
  /** Como se la nombra en la configuración. */
  id: string;
  grupo: Grupo;
  /** Como se la muestra al elegir. */
  etiqueta: string;
  /** El paquete de `@fontsource` que la sirve. */
  paquete: string;
  /** El nombre real de la familia dentro del CSS del paquete. */
  nombre: string;
  /** Una línea sobre a qué se parece. Es lo que hace elegible una lista. */
  nota: string;
  /**
   * Si su paquete se instala en el proyecto. Ausente ⇒ sí.
   *
   * Es la línea que separa elegir de aplicar (ver el encabezado): una familia sin
   * empaquetar se puede PROBAR en el laboratorio —se trae de la red al
   * seleccionarla— pero aplicarla de forma permanente avisa, porque en la
   * aplicación caería a los respaldos del sistema operativo.
   */
  empaquetada?: boolean;
}

/**
 * De dónde se trae una familia para PROBARLA, cuando no está empaquetada.
 *
 * Sirve los mismos paquetes `@fontsource` que el build usa, así que la vista
 * previa y lo aplicado son los mismos archivos. Ver el encabezado del módulo para
 * por qué esto no contradice la regla de no depender de un CDN.
 */
export const CDN_DE_VISTA_PREVIA = "https://cdn.jsdelivr.net/npm";

/** El CSS de una familia no empaquetada, para traerla al probarla. */
export const cssDeVistaPrevia = (f: Familia): string =>
  `${CDN_DE_VISTA_PREVIA}/${f.paquete}/index.css`;

/** Las que el proyecto instala: las únicas que se pueden aplicar. */
export const EMPAQUETADAS = (): Familia[] =>
  FAMILIAS.filter((f) => f.empaquetada !== false);

/**
 * Los respaldos. Se usan iguales para todas: si la elegida no cargó, lo que
 * corresponde es la del sistema operativo, no otra descarga que también puede
 * fallar.
 */
export const RESPALDOS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

export const FAMILIAS: Familia[] = [
  {
    id: "inter",
    grupo: "neutra",
    etiqueta: "Inter",
    paquete: "@fontsource/inter",
    nombre: "Inter",
    nota: "Neutra y muy legible en tamaños chicos. Es la que el sistema trae.",
  },
  {
    id: "geist",
    grupo: "neutra",
    etiqueta: "Geist",
    paquete: "@fontsource/geist",
    nombre: "Geist",
    nota: "Contemporánea y algo más estrecha: entra más texto por línea.",
  },
  {
    id: "figtree",
    grupo: "carácter",
    etiqueta: "Figtree",
    paquete: "@fontsource/figtree",
    nombre: "Figtree",
    nota: "Redondeada y cordial. Baja el tono técnico de la pantalla.",
  },
  {
    id: "manrope",
    grupo: "carácter",
    etiqueta: "Manrope",
    paquete: "@fontsource/manrope",
    nombre: "Manrope",
    nota: "Geométrica, de carácter marcado. Se nota en los títulos.",
  },
  {
    id: "public-sans",
    grupo: "neutra",
    etiqueta: "Public Sans",
    paquete: "@fontsource/public-sans",
    nombre: "Public Sans",
    nota: "Sobria, de uso público. Buena para formularios largos.",
  },
  {
    id: "source-sans-3",
    grupo: "neutra",
    etiqueta: "Source Sans 3",
    paquete: "@fontsource/source-sans-3",
    nombre: "Source Sans 3",
    nota: "Clásica y de lectura tranquila. Envejece bien.",
  },
  {
    id: "ibm-plex-sans",
    grupo: "neutra",
    etiqueta: "IBM Plex Sans",
    paquete: "@fontsource/ibm-plex-sans",
    nombre: "IBM Plex Sans",
    nota: "Con aire de ingeniería. Le da un tono de herramienta seria.",
  },
  {
    id: "jetbrains-mono",
    grupo: "monoespaciada",
    etiqueta: "JetBrains Mono",
    paquete: "@fontsource/jetbrains-mono",
    nombre: "JetBrains Mono",
    nota: "Monoespaciada: cada carácter ocupa lo mismo. Alinea columnas de números, pero cansa en textos largos.",
  },

  // ── Con personalidad: se notan, sobre todo en títulos ──────────────────
  {
    id: "dm-sans",
    grupo: "carácter",
    paquete: "@fontsource/dm-sans",
    nombre: "DM Sans",
    etiqueta: "DM Sans",
    nota: "Geométrica y de formas abiertas. Moderna sin ser fría.",
  },
  {
    id: "plus-jakarta-sans",
    grupo: "carácter",
    paquete: "@fontsource/plus-jakarta-sans",
    nombre: "Plus Jakarta Sans",
    etiqueta: "Plus Jakarta Sans",
    nota: "Amable y algo redondeada. Suaviza pantallas densas.",
  },
  {
    id: "outfit",
    grupo: "carácter",
    paquete: "@fontsource/outfit",
    nombre: "Outfit",
    etiqueta: "Outfit",
    nota: "Geométrica pura, casi circular. Muy marcada en títulos.",
  },
  {
    id: "space-grotesk",
    grupo: "carácter",
    paquete: "@fontsource/space-grotesk",
    nombre: "Space Grotesk",
    etiqueta: "Space Grotesk",
    nota: "Rara a propósito, con detalles técnicos. Distingue mucho.",
  },
  {
    id: "work-sans",
    grupo: "carácter",
    paquete: "@fontsource/work-sans",
    nombre: "Work Sans",
    etiqueta: "Work Sans",
    nota: "Pensada para textos de interfaz cortos. Sobria pero no anónima.",
  },
  {
    id: "archivo",
    grupo: "carácter",
    paquete: "@fontsource/archivo",
    nombre: "Archivo",
    etiqueta: "Archivo",
    nota: "Robusta y de trazo parejo. Aguanta bien tamaños grandes.",
  },
  // La declaran los temas del corpus de Matu (Font_Family.Tokens).
  {
    id: "shantell-sans",
    grupo: "carácter",
    paquete: "@fontsource/shantell-sans",
    nombre: "Shantell Sans",
    etiqueta: "Shantell Sans",
    nota: "De trazo casi manuscrito, informal. Para acentos, no para interfaz densa.",
  },

  // ── De lectura: con remates, para textos largos ────────────────────────
  {
    id: "source-serif-4",
    grupo: "lectura",
    paquete: "@fontsource/source-serif-4",
    nombre: "Source Serif 4",
    etiqueta: "Source Serif 4",
    nota: "Con remates, pensada para pantalla. Da tono editorial.",
  },
  {
    id: "ibm-plex-serif",
    grupo: "lectura",
    paquete: "@fontsource/ibm-plex-serif",
    nombre: "IBM Plex Serif",
    etiqueta: "IBM Plex Serif",
    nota: "La hermana con remates de Plex. Combina con la sans del mismo nombre.",
  },
  {
    id: "lora",
    grupo: "lectura",
    paquete: "@fontsource/lora",
    nombre: "Lora",
    etiqueta: "Lora",
    nota: "Contemporánea y con algo de caligrafía. Calida en textos largos.",
  },
  {
    id: "literata",
    grupo: "lectura",
    paquete: "@fontsource/literata",
    nombre: "Literata",
    etiqueta: "Literata",
    nota: "Hecha para leer libros en pantalla. Muy comoda de recorrer.",
  },
  {
    id: "spectral",
    grupo: "lectura",
    paquete: "@fontsource/spectral",
    nombre: "Spectral",
    etiqueta: "Spectral",
    nota: "De remates finos y aire clasico. Elegante, menos neutra.",
  },
  {
    id: "newsreader",
    grupo: "lectura",
    paquete: "@fontsource/newsreader",
    nombre: "Newsreader",
    etiqueta: "Newsreader",
    nota: "Tono periodistico. Da sensacion de documento serio.",
  },
  {
    id: "roboto-slab",
    grupo: "lectura",
    paquete: "@fontsource/roboto-slab",
    nombre: "Roboto Slab",
    etiqueta: "Roboto Slab",
    nota: "Remates rectangulares y firmes. Mas tecnica que editorial.",
  },
  {
    id: "bitter",
    grupo: "lectura",
    paquete: "@fontsource/bitter",
    nombre: "Bitter",
    etiqueta: "Bitter",
    nota: "Remates gruesos, pensada para pantalla. Se lee bien en chico.",
  },
  {
    id: "merriweather",
    grupo: "lectura",
    paquete: "@fontsource/merriweather",
    nombre: "Merriweather",
    etiqueta: "Merriweather",
    nota: "Ancha y de mucha presencia. Ocupa mas lugar por linea.",
  },
  {
    id: "playfair-display",
    grupo: "lectura",
    paquete: "@fontsource/playfair-display",
    nombre: "Playfair Display",
    etiqueta: "Playfair Display",
    nota: "Muy contrastada, casi de revista. Solo para titulos.",
  },
  // La declaran los temas del corpus de Matu (Font_Family.Tokens).
  {
    id: "podkova",
    grupo: "lectura",
    paquete: "@fontsource/podkova",
    nombre: "Podkova",
    etiqueta: "Podkova",
    nota: "Remates rectangulares y redondeados. Firme pero amable en titulos.",
  },

  // ── Angostas: entra mas texto por linea ────────────────────────────────
  {
    id: "barlow-condensed",
    grupo: "angosta",
    paquete: "@fontsource/barlow-condensed",
    nombre: "Barlow Condensed",
    etiqueta: "Barlow Condensed",
    nota: "Angosta y neutra. Util en grillas con muchas columnas.",
  },
  {
    id: "roboto-condensed",
    grupo: "angosta",
    paquete: "@fontsource/roboto-condensed",
    nombre: "Roboto Condensed",
    etiqueta: "Roboto Condensed",
    nota: "La condensada mas conocida. Entra mucho texto sin que canse.",
  },
  {
    id: "oswald",
    grupo: "angosta",
    paquete: "@fontsource/oswald",
    nombre: "Oswald",
    etiqueta: "Oswald",
    nota: "Muy angosta y vertical. Fuerte en titulos, dura en textos.",
  },

  // ── Monoespaciadas: cada caracter ocupa lo mismo ───────────────────────
  {
    id: "ibm-plex-mono",
    grupo: "monoespaciada",
    paquete: "@fontsource/ibm-plex-mono",
    nombre: "IBM Plex Mono",
    etiqueta: "IBM Plex Mono",
    nota: "Monoespaciada de tono sobrio. Alinea columnas de numeros.",
  },
  {
    id: "source-code-pro",
    grupo: "monoespaciada",
    paquete: "@fontsource/source-code-pro",
    nombre: "Source Code Pro",
    etiqueta: "Source Code Pro",
    nota: "Monoespaciada clasica y muy legible en tamanios chicos.",
  },

  // ── Sólo vista previa ────────────────────────────────────────────────────
  //
  // No se instalan: se traen de la red al probarlas y aplicarlas AVISA. Están
  // para que el catálogo pueda crecer sin que crezca el build — ver el
  // encabezado del módulo. El día que un proyecto quiera una de éstas de
  // verdad, se le saca `empaquetada: false` y entra a su package.json.
  {
    id: "atkinson",
    grupo: "neutra",
    etiqueta: "Atkinson Hyperlegible",
    paquete: "@fontsource/atkinson-hyperlegible",
    nombre: "Atkinson Hyperlegible",
    nota: "Diseñada para baja visión: distingue formas que otras confunden (l, I, 1).",
    empaquetada: false,
  },
  {
    id: "nunito-sans",
    grupo: "neutra",
    etiqueta: "Nunito Sans",
    paquete: "@fontsource/nunito-sans",
    nombre: "Nunito Sans",
    nota: "Neutra de terminaciones blandas. Menos técnica que Inter sin ser cordial.",
    empaquetada: false,
  },
  {
    id: "rubik",
    grupo: "carácter",
    etiqueta: "Rubik",
    paquete: "@fontsource/rubik",
    nombre: "Rubik",
    nota: "Esquinas apenas redondeadas y ojo grande. Amable en títulos.",
    empaquetada: false,
  },
  {
    id: "sora",
    grupo: "carácter",
    etiqueta: "Sora",
    paquete: "@fontsource/sora",
    nombre: "Sora",
    nota: "Geométrica y algo severa. Da un tono de producto técnico.",
    empaquetada: false,
  },
  {
    id: "libre-baskerville",
    grupo: "lectura",
    etiqueta: "Libre Baskerville",
    paquete: "@fontsource/libre-baskerville",
    nombre: "Libre Baskerville",
    nota: "Transicional de contraste alto. Para texto largo que se lee de corrido.",
    empaquetada: false,
  },
  {
    id: "crimson-pro",
    grupo: "lectura",
    etiqueta: "Crimson Pro",
    paquete: "@fontsource/crimson-pro",
    nombre: "Crimson Pro",
    nota: "De libro, con serifas finas. La más literaria del catálogo.",
    empaquetada: false,
  },
  {
    id: "fira-mono",
    grupo: "monoespaciada",
    etiqueta: "Fira Mono",
    paquete: "@fontsource/fira-mono",
    nombre: "Fira Mono",
    nota: "Monoespaciada de trazo parejo, pensada para pantallas chicas.",
    empaquetada: false,
  },
  {
    id: "archivo-narrow",
    grupo: "angosta",
    etiqueta: "Archivo Narrow",
    paquete: "@fontsource/archivo-narrow",
    nombre: "Archivo Narrow",
    nota: "Angosta y neutra: entra mucho texto sin cambiar de tono.",
    empaquetada: false,
  },
];

export const FAMILIA_POR_DEFECTO = "inter";

/** El orden en que conviene recorrerlas al elegir. */
export const GRUPOS: { id: Grupo; etiqueta: string }[] = [
  { id: "neutra", etiqueta: "Neutras" },
  { id: "carácter", etiqueta: "Con personalidad" },
  { id: "lectura", etiqueta: "De lectura" },
  { id: "angosta", etiqueta: "Angostas" },
  { id: "monoespaciada", etiqueta: "Monoespaciadas" },
];

/** Si una familia se puede aplicar de forma permanente. Un valor que no está en
 * el catálogo —una pila propia del proyecto— se considera empaquetada: la trae
 * él, y no nos toca opinar. */
export const sePuedeAplicar = (id: string | undefined): boolean => {
  const f = FAMILIAS.find((x) => x.id === id);
  return !f || f.empaquetada !== false;
};

export function familia(id: string | undefined): Familia {
  return FAMILIAS.find((f) => f.id === id) ?? FAMILIAS[0];
}

/**
 * La pila completa para CSS.
 *
 * Acepta tanto un identificador del catálogo (`"geist"`) como una pila escrita
 * a mano. Lo segundo sigue permitido porque un proyecto puede tener una familia
 * propia con licencia, y cerrarle la puerta a eso por prolijidad sería
 * cambiarle la identidad a alguien que la tenía decidida.
 */
export function pilaCss(
  value: string | undefined,
  fallbacks = RESPALDOS
): string {
  if (!value) return `"${FAMILIAS[0].nombre}", ${fallbacks}`;
  const known = FAMILIAS.find((f) => f.id === value);
  if (known) return `"${known.nombre}", ${fallbacks}`;
  // Ya viene como pila si nombra más de una o trae comillas.
  return value.includes(",") || value.includes('"')
    ? value
    : `"${value}", ${fallbacks}`;
}

/**
 * Qué paquete hay que importar para que una pila ya resuelta se vea.
 *
 * Se busca por el nombre dentro de la pila y no por identificador porque para
 * cuando el generador emite `App.tsx` la familia ya viaja resuelta a CSS. Una
 * pila propia del proyecto devuelve nulo: no hay paquete que traer, la trae él.
 */
export function paqueteDe(stack: string | undefined): string | null {
  if (!stack) return null;
  const f = FAMILIAS.find((x) => stack.includes(`"${x.nombre}"`));
  // Una familia de sólo vista previa NO tiene paquete que importar: importarlo
  // rompería el build del proyecto, que no lo instaló.
  return f && f.empaquetada !== false ? f.paquete : null;
}

/**
 * Qué paquete sirve una familia nombrada por su nombre CSS exacto ("Manrope"),
 * que es como las nombra el corpus de Matu — ni identificador ni pila. Fuera
 * del catálogo no hay paquete que traer: se devuelve nulo y los respaldos de la
 * pila deciden qué se ve.
 */
export function paqueteDeFamilia(name: string | undefined): string | null {
  const f = FAMILIAS.find((x) => x.nombre === name);
  return f && f.empaquetada !== false ? f.paquete : null;
}
