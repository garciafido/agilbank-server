/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * De un snapshot Matu (roles por capa de contraste) al `Preset` que el sistema
 * ya consume. Es la única pieza que sabe las dos lenguas.
 *
 * Se eligió el adaptador y NO reescribir `buildTheme` para leer roles nativos:
 * el beneficio de los roles de primera clase es estética interna que nadie ve
 * desde afuera, y el costo era tocar el archivo más frágil del cliente. Matu se
 * honra igual —la tabla de abajo es la misma que usaría la versión role-first—;
 * lo que se paga es que las seis capas de contraste se COLAPSAN a las cuatro
 * superficies que el `SemanticSet` distingue. Si mañana un componente necesita
 * una capa que no está, se promueve entonces y no antes.
 *
 * Las dos decisiones que valen la pena leer antes de tocar nada:
 *
 *  1. **La tabla tier→(capa, roles) es DATO, no condicionales.** Misma doctrina
 *     que `semanticMap.ts`. Un solo juego de tablas sirve para claro y oscuro
 *     porque en Matu elegir modo es elegir tabla de tintas: la inversión ya
 *     ocurrió aguas arriba, y acá no hay un solo `mode === "light"`.
 *
 *  2. **Los estados se hornean a hex con una sola regla**: el rol `Main` de la
 *     capa, compuesto sobre el fondo de la superficie, a la opacidad que Matu
 *     declara. Es su modelo de estados —un tinte de acento sobre el elemento—,
 *     no el de MUI (que superpone el color del texto al 4%). El `SemanticSet`
 *     lleva hex opacos, así que la superposición se resuelve acá y una sola vez.
 */

import { compositeOver, Hex } from "./color";
import { OPACIDAD_DE_BORDE } from "./semanticMap";
import {
  SIN_GRADIENTES,
  TIPO_DE_FILA_POR_DEFECTO,
  espaciadosDeComponente,
  iconography,
} from "./doctrine";
import { rowAltFrom } from "./semanticMap";
import { pilaCss } from "./fonts";
import {
  ComponentTokens,
  FamilySurfaces,
  Preset,
  Primitives,
  RadiusScale,
  SemanticSet,
  SpacingScale,
  Surface,
  TypographyIngredients,
} from "./types";
import {
  ContrastModeName,
  ContentContrast,
  DEFAULT_CONTENT_CONTRAST,
  DEFAULT_SOLID_CHROME,
  DEFAULT_SURFACE_STAIR,
  MatuStateName,
  RoleName,
  StatusName,
  SolidChrome,
  SurfaceStair,
} from "./matuAuthoring";
import { rem } from "./matuRamp";
import { MatuResolved, ResolvedMode, ResolvedRoles } from "./matuSnapshot";

/** Un valor por nombre, con un mensaje que dice qué token falta y para qué. */
function need(
  map: Record<string, number>,
  name: string,
  purpose: string
): number {
  const v = map[name];
  if (v === undefined)
    throw new Error(`El tema Matu no trae "${name}", que ${purpose} necesita.`);
  return v;
}

// ────────────────────────────────────────────────── Nivel 2: color por capas

/**
 * De qué capa y de qué roles sale cada superficie.
 *
 * `bg`/`on`/`onMuted`/`border` nombran roles DE ESA CAPA. `subtle` y `onSubtle`
 * salen de la capa de tinte (`Canvas High`), que es donde vive la versión suave
 * de un color —MUI la usa como fondo de alerta y como `palette.X.light`— y su
 * ink: los dos registros de un estado son pares completos, no colores sueltos.
 */
interface TierRefs {
  layer: ContrastModeName;
  bg: RoleName;
  on: RoleName;
  onMuted: RoleName;
  border: RoleName;
  borderStrong?: RoleName;
  /** Rol de la capa `Canvas High` que hace de variante suave. */
  subtle?: RoleName;
  /** Rol de la capa `Canvas High` que escribe sobre `subtle`. */
  onSubtle?: RoleName;
}

/**
 * Las superficies neutras, en las DOS direcciones de la escalera (ver
 * `SurfaceStair`). Los escalones son los que Matu llama Canvas / Surface /
 * Mantle dentro de una misma capa; que salgan de la MISMA capa es el punto: son
 * el mismo aire, a distinta altura.
 *
 * Son dos TABLAS y no una tabla con condicionales, por la misma razón de la
 * decisión (1) del encabezado: el reparto de cada dirección se lee entero de un
 * vistazo, y no hay que simular el cómputo para saber de qué color es una
 * tarjeta.
 *
 * **`Canvas`** —la de siempre, y la que rige sin declarar nada—. El lienzo está
 * en el extremo de la rampa (blanco en claro), así que todo lo que se separa
 * entra hacia adentro: la tarjeta toma `Surface`, el escalón más adentro, porque
 * sobre una página blanca lo elevado es lo que TIENE que verse; lo hundido toma
 * `Mantle`, un escalón suave; y la barra se queda en el plano de la página, que
 * ya es el de más al frente.
 *
 * **`Mantle`** —el lienzo entra un escalón y el extremo queda libre—. Lo que
 * flota lo ocupa: elevarse acá es acercarse al extremo, no alejarse. La tarjeta
 * toma `Mantle`, y la barra también, porque en esta dirección la barra ya no
 * comparte plano con la página. Lo hundido es el lienzo MISMO: la página ya es
 * el fondo del que las cosas se despegan, y darle un escalón propio haría el
 * pozo más hondo que alta la tarjeta.
 *
 * `Surface` queda entonces afuera de la escalera en la dirección `Mantle`, y
 * está bien: no es un escalón del lienzo. Es el rol de superficie RELLENA —el
 * que va con `On_Surface`, el que acá abajo hace de `subtle` y de tinte de las
 * situaciones de dato sensible—, y en un esquema teñido no es un gris sino un
 * color (`#C4E1FF` en `Blue Cated`). No se invierte con la dirección: es el
 * escalón más adentro en las dos, que es justamente la prueba de que no forma
 * parte de lo que este eje da vuelta. Usarlo de hundido pondría un bloque de
 * color donde el ojo espera que no haya nada. Donde SÍ entra en esta dirección
 * es como relleno, que es lo suyo: ver `SENSITIVE_FILL`.
 */
const NEUTRAL_TIERS: Record<
  SurfaceStair,
  Record<"page" | "raised" | "sunken" | "appBar", TierRefs>
> = {
  Canvas: {
    page: {
      layer: "Canvas High",
      bg: "Canvas",
      on: "Content",
      onMuted: "Content_Low",
      border: "Border",
    },
    // `borderStrong` es el borde de un campo, y 1.4.11 le exige 3:1 sobre su
    // fondo. El rol `Border` de Matu no lo alcanza —2.25:1 en claro, 1.76:1 en
    // oscuro, y su propio resolver ya lo avisa—, así que el campo usa el único
    // rol que por construcción contrasta con esa superficie. Es un caso donde el
    // gate manda sobre la fidelidad, y el aviso queda para llevárselo a Matu.
    raised: {
      layer: "Canvas High",
      bg: "Surface",
      on: "On_Surface",
      onMuted: "Content_Low",
      border: "Border",
      borderStrong: "On_Surface",
    },
    sunken: {
      layer: "Canvas High",
      bg: "Mantle",
      on: "Content",
      onMuted: "Content_Low",
      border: "Border",
    },
    appBar: {
      layer: "Canvas High",
      bg: "Canvas",
      on: "Content",
      onMuted: "Content_Low",
      border: "Border",
    },
  },
  Mantle: {
    page: {
      layer: "Mantle High",
      bg: "Canvas",
      on: "Content",
      onMuted: "Content_Low",
      border: "Border",
    },
    // El mismo caso que arriba, con el rol que acá corresponde: la tarjeta ya no
    // es `Surface`, así que el ink que por construcción contrasta con ella es
    // `Content` y no `On_Surface`.
    raised: {
      layer: "Mantle High",
      bg: "Mantle",
      on: "Content",
      onMuted: "Content_Low",
      border: "Border",
      borderStrong: "Content",
    },
    sunken: {
      layer: "Mantle High",
      bg: "Canvas",
      on: "Content",
      onMuted: "Content_Low",
      border: "Border",
    },
    appBar: {
      layer: "Mantle High",
      bg: "Mantle",
      on: "Content",
      onMuted: "Content_Low",
      border: "Border",
    },
  },
};

/**
 * El relleno neutro de un dato oculto (`masked` / `forbidden`): el escalón que
 * NO es ni la página ni la tarjeta.
 *
 * Es la única regla que sirve en las dos direcciones, y no es prolijidad: un
 * campo enmascarado se dibuja tanto sobre la página como adentro de una tarjeta,
 * así que si tomara cualquiera de esos dos escalones desaparecería en la mitad
 * de los lugares donde aparece. En la dirección de siempre el que sobra es
 * `Mantle`; en la invertida, donde la tarjeta ya se lo lleva, es `Surface`. Ahí
 * `Surface` sí entra —como superficie RELLENA, que es lo que es—, y no como un
 * escalón de la escalera.
 */
const SENSITIVE_FILL: Record<SurfaceStair, RoleName> = {
  Canvas: "Mantle",
  Mantle: "Surface",
};

/**
 * La capa neutra de una dirección y un nivel: la que lee su página, y con ella
 * todo lo que se apoya en el lienzo (el menú, los fondos de dato sensible, el
 * texto).
 *
 * La DIRECCIÓN sale de la tabla y no de una segunda constante para que no puedan
 * discrepar; el NIVEL se pega al nombre, que es cómo Matu lo escribe. Los dos
 * ejes son ortogonales por construcción: las cuatro capas neutras existen.
 */
const neutralLayerOf = (
  stair: SurfaceStair,
  level: ContentContrast
): ContrastModeName =>
  NEUTRAL_TIERS[stair].page.layer.replace(
    /(High|Low)$/,
    level
  ) as ContrastModeName;

/** En qué dirección lee las superficies un tema. Sin declararla, la de siempre. */
const stairOf = (m: MatuResolved): SurfaceStair =>
  m.selection?.surfaces ?? DEFAULT_SURFACE_STAIR;

/** Cuánto contrasta el contenido. Sin declararlo, el nivel firme. */
const levelOf = (m: MatuResolved): ContentContrast =>
  m.selection?.contentContrast ?? DEFAULT_CONTENT_CONTRAST;

/** Qué cromo va teñido de marca. Sin declararlo, nada. */
const chromeOf = (m: MatuResolved): SolidChrome =>
  m.selection?.solidChrome ?? DEFAULT_SOLID_CHROME;

/**
 * El mismo reparto de roles, leído del nivel de contraste pedido.
 *
 * El nivel es una propiedad de la CAPA y no del reparto: qué rol le toca a cada
 * superficie es idéntico en `Canvas High` y `Canvas Low` —lo único que cambia
 * entre ellas es el valor de `Content` y `Content_Low`—, así que duplicar las
 * tablas por nivel sería escribir cuatro veces la misma decisión.
 */
const withLevel = (tier: TierRefs, level: ContentContrast): TierRefs =>
  tier.layer === "Solid" || tier.layer === "Highest"
    ? tier
    : {
        ...tier,
        layer: tier.layer.replace(/(High|Low)$/, level) as ContrastModeName,
      };

/**
 * El cromo TEÑIDO: la barra o el lateral pintados con la capa `Solid`.
 *
 * Es el mismo reparto que un relleno de marca —`Canvas` de fondo con su
 * `Content` encima, que es el texto que Matu ya eligió para ese fondo— más el
 * borde en `Mantle`, el registro más profundo de la capa.
 *
 * Lo que NO se hereda es el renglón activo: sobre un fondo ya teñido, un lavado
 * del mismo color no se ve. Se resuelve con `Surface`, el escalón hondo de la
 * propia capa (1.76:1 contra su fondo — un paso visible sin ser otro bloque), y
 * su `On_Surface` encima, que contra ese fondo da 12.17:1. Los dos son de Matu:
 * no hay ningún color elegido acá.
 */
const CHROME_SOLID_TIER: TierRefs = {
  layer: "Solid",
  bg: "Canvas",
  on: "Content",
  onMuted: "Content_Low",
  border: "Mantle",
};

/**
 * El tooltip: fondo oscuro sobre claro, y claro sobre oscuro. En Matu eso no es
 * una excepción sino la capa `Highest`, cuyo `Surface` ya está invertido
 * respecto del canvas del modo. Es exactamente el defecto que el tema viejo
 * tenía —un tooltip negro sobre fondo negro— resuelto por construcción.
 */
const INVERSE_TIER: TierRefs = {
  layer: "Highest",
  bg: "Surface",
  on: "On_Surface",
  onMuted: "On_Surface",
  border: "Surface",
};

/**
 * Un color de acento —la marca o un estado— se rellena con la capa `Solid`, que
 * es la que Matu define para "el color como fondo". Su `Content` es el texto
 * que va encima, ya elegido por él para ese relleno.
 */
const SOLID_TIER: TierRefs = {
  layer: "Solid",
  bg: "Canvas",
  on: "Content",
  onMuted: "Content_Low",
  border: "Mantle",
  subtle: "Surface",
  onSubtle: "On_Surface",
};

/**
 * El menú lateral se apoya en el manto, no en el lienzo: es lo que lo separa del
 * contenido. El ROL no cambia con la dirección —el manto es justo uno de los dos
 * que se intercambian—, así que el menú se separa de la página en las dos: por
 * debajo en `Canvas`, por encima en `Mantle`. Lo único que cambia es de qué capa
 * se lee.
 */
const sidebarTier = (layer: ContrastModeName): TierRefs => ({
  layer,
  bg: "Mantle",
  on: "Content",
  onMuted: "Content_Low",
  border: "Border",
});

const roles = (mode: ResolvedMode, layer: ContrastModeName): ResolvedRoles => {
  const r = mode.contrast[layer];
  if (!r)
    throw new Error(`El tema Matu no trae la capa de contraste "${layer}".`);
  return r;
};

/**
 * Un estado horneado: el acento de la capa lavando sobre el fondo, a la
 * opacidad que Matu declara. Ver la decisión (2) del encabezado.
 */
const state = (bg: Hex, accent: Hex, alpha: number): Hex =>
  compositeOver(accent, bg, alpha);

function surfaceOf(
  m: MatuResolved,
  mode: ResolvedMode,
  refs: TierRefs
): Surface {
  const r = roles(mode, refs.layer);
  const bg = r[refs.bg];
  return {
    bg,
    on: r[refs.on],
    onMuted: r[refs.onMuted],
    border: r[refs.border],
    hover: state(bg, r.Main, m.states.hover),
    ...(refs.borderStrong ? { borderStrong: r[refs.borderStrong] } : {}),
    ...(refs.subtle ? { subtle: roles(mode, "Canvas High")[refs.subtle] } : {}),
    ...(refs.onSubtle
      ? { onSubtle: roles(mode, "Canvas High")[refs.onSubtle] }
      : {}),
  };
}

// ──────────────────────────────────────────── Nivel 2: superficies de familia

/**
 * De dónde sale UN color de familia. Tres formas y no más, que son las tres que
 * el resto del adaptador ya usa: un rol de una capa, un rol lavado sobre otro
 * —los estados horneados de la decisión (2) del encabezado— y un rol leído del
 * esquema de ACENTO en vez del de superficies.
 *
 * Es la misma doctrina que `TierRefs`, en la unidad que estas superficies piden:
 * una familia no es un juego fijo de `bg`/`on`/`border`, así que cada color
 * nombra su origen por separado.
 */
type FamilyRef =
  | { layer: ContrastModeName; role: RoleName }
  | { layer: ContrastModeName; wash: MatuStateName; over: RoleName }
  | { layer: ContrastModeName; accent: RoleName };

/**
 * Los tokens de familia que NO nombran una capa, porque el vocabulario de Matu
 * no tiene con qué nombrarlos: sus estados son `hover`, `selected` y `disable`,
 * y "fila par" no es ninguno. Se derivan, y quedan fuera de la tabla por el
 * tipo — un token nuevo que tampoco tenga capa tiene que declararse acá, o no
 * compila.
 */
type NoOwnLayer = "rowAlt";

type FamilyRefs = {
  [F in keyof FamilySurfaces]: Record<
    Exclude<keyof FamilySurfaces[F], NoOwnLayer>,
    FamilyRef
  >;
};

/**
 * Qué capa y qué rol consume cada familia, en las dos direcciones de la
 * escalera. Es la tabla que vuelve EXPLÍCITO lo que hasta ahora era un préstamo:
 * la grilla no "usa el borde de lo hundido", lee el rol `Border` de la capa
 * neutra de su dirección.
 *
 * **El hallazgo de la medición, que esta tabla deja a la vista.** Se imprimieron
 * los diez roles de las seis capas para `Neutral` y para `Blue Cated`: el rol
 * `Border` es EL MISMO en las cuatro capas neutras (`Canvas High/Low`,
 * `Mantle High/Low`) — `#94A3B8` en `Neutral` claro, `#3296FE` en `Blue Cated`
 * claro—, y las dos capas que sí lo mueven lo llevan a los extremos: `Solid` al
 * ink del relleno y `Highest` al máximo contraste del sistema (20.98:1). Entre
 * el borde general (2.56:1 sobre el lienzo) y el escalón de relleno más cercano
 * (`Surface`, 1.24:1) no hay ningún rol.
 *
 * O sea: **el eje de capas no gradúa el borde**, y la línea más suave que una
 * grilla necesita no existe en el vocabulario de Matu. Por eso `grid.border` y
 * `field.border` nombran acá el mismo rol —que es exactamente lo que valía hoy—
 * y ablandar la grilla no puede ser un corrimiento de capa: es un derivado de
 * color, que es lo que la perilla de la Task 3 tiene que ofrecer.
 *
 * `headBg` y `rowHover` sí se benefician del sistema: son escalones y lavados
 * que las capas expresan de primera mano.
 */
const FAMILY_TIERS: Record<SurfaceStair, FamilyRefs> = {
  Canvas: {
    grid: {
      border: { layer: "Canvas High", role: "Border" },
      headBorder: { layer: "Canvas High", role: "Border" },
      headBg: { layer: "Canvas High", role: "Mantle" },
      rowHover: { layer: "Canvas High", wash: "hover", over: "Canvas" },
    },
    field: {
      border: { layer: "Canvas High", role: "Border" },
      // El borde del campo al pasar por encima: el mismo rol que `borderStrong`
      // de la tarjeta, y por el mismo motivo (ver `NEUTRAL_TIERS`) — es el único
      // que por construcción contrasta con esa superficie.
      borderHover: { layer: "Canvas High", role: "On_Surface" },
      borderFocus: { layer: "Solid", accent: "Canvas" },
    },
  },
  Mantle: {
    grid: {
      border: { layer: "Mantle High", role: "Border" },
      headBorder: { layer: "Mantle High", role: "Border" },
      // En esta dirección lo hundido es el lienzo MISMO (ver `NEUTRAL_TIERS`),
      // así que el encabezado se apoya en él y no en un escalón propio.
      headBg: { layer: "Mantle High", role: "Canvas" },
      rowHover: { layer: "Mantle High", wash: "hover", over: "Canvas" },
    },
    field: {
      border: { layer: "Mantle High", role: "Border" },
      borderHover: { layer: "Mantle High", role: "Content" },
      borderFocus: { layer: "Solid", accent: "Canvas" },
    },
  },
};

/**
 * El foco del campo sigue al ACENTO y no a las superficies: es la marca diciendo
 * "estás escribiendo acá". Por eso el resolver necesita los dos esquemas.
 */
function familiesOf(
  m: MatuResolved,
  brand: ResolvedMode,
  stair: SurfaceStair,
  /** Dónde se dibujan las filas: la tarjeta. Lo necesita el rayado. */
  rowSurface: Hex
): FamilySurfaces {
  const color = (ref: FamilyRef): Hex => {
    // `accent` no nombra otro esquema: nombra el rol que lleva el color de la
    // MARCA —el anillo de foco es el único de la familia— frente a los que salen
    // de la escalera de superficies.
    if ("accent" in ref) return roles(brand, ref.layer)[ref.accent];
    const r = roles(brand, ref.layer);
    if ("wash" in ref) return state(r[ref.over], r.Main, m.states[ref.wash]);
    return r[ref.role];
  };
  const t = FAMILY_TIERS[stair];

  /**
   * Los bordes por OPACIDAD del rol `Content`, sobre el fondo donde se dibujan.
   *
   * Es lo que pidió Matu, y por el motivo que él vio: un borde de color fijo no
   * puede servir en las dos direcciones de superficie. Medido, el mismo token
   * daba 3.03 sobre la página y 2.25 sobre la tarjeta en `Canvas`, y al revés en
   * `Mantle`. Compuesto contra su propio fondo queda bien en las dos por
   * construcción, y el de control alcanza 3:1 en los dos modos.
   */
  const content = roles(brand, t.grid.border.layer).Content;
  const line = (background: Hex, intensity: number) =>
    compositeOver(content, background, intensity);
  const rowBackground = rowSurface;
  const headerBackground = color(t.grid.headBg);

  return {
    grid: {
      border: line(rowBackground, OPACIDAD_DE_BORDE.decorativa),
      headBorder: line(headerBackground, OPACIDAD_DE_BORDE.decorativa),
      headBg: color(t.grid.headBg),
      rowHover: color(t.grid.rowHover),
      // El rayado NO sale de `FAMILY_TIERS`: Matu no tiene un rol ni un estado
      // para "fila par" —sus estados son hover, selected, disable— e inventarle
      // una capa sería elegir por el sistema. Sale de la misma regla que en los
      // demás presets, que además es la que mantiene el hover legible encima
      // (ver `rowAltFrom`).
      rowAlt: rowAltFrom(color(t.grid.rowHover), rowSurface),
    },
    field: {
      border: line(rowBackground, OPACIDAD_DE_BORDE.control),
      borderHover: line(rowBackground, OPACIDAD_DE_BORDE.controlEnfasis),
      borderFocus: color(t.field.borderFocus),
    },
  };
}

/**
 * Las cuatro situaciones de 6.9, cada una con una razón para verse como se ve:
 *
 * - `masked` y `forbidden` comparten el fondo neutro —los dos son "acá hay algo
 *   que no estás viendo"— y se separan por el borde: el de `forbidden` es el de
 *   la capa `Highest`, el máximo contraste del sistema, porque "no corresponde
 *   ver" tiene que leerse como una afirmación y no como un campo vacío.
 * - `revealed` lleva el tinte de `warning`: revelar deja señal.
 * - `ownership` lleva el de `info`: de quién es lo que se está mirando.
 *
 * `ownership` se QUEDA en el eje de estados y no pasa al de acento, aunque la
 * tentación sea fuerte —"de quién es" suena a marca—. Las cuatro se leen como
 * familia, y lo que cada una tiene que decir es un hecho sobre el DATO, no sobre
 * el producto. El acento ya es el color más repetido de la pantalla (todo botón,
 * el renglón activo del menú): un tinte que lo reusara se leería como "esto es
 * accionable" y dejaría de leerse como una advertencia de sensibilidad. La
 * familia queda coherente así: dos neutras de superficie y dos tintes de estado.
 */
function sensitiveOf(
  m: MatuResolved,
  brand: ResolvedMode,
  mode: "light" | "dark",
  stair: SurfaceStair
): SemanticSet["sensitive"] {
  // El relleno neutro sigue a la dirección (ver `SENSITIVE_FILL`). El TINTE de
  // las otras dos no: es una superficie de color, y de la escalera de
  // superficies el color no participa.
  const ch = roles(brand, neutralLayerOf(stair, levelOf(m)));
  const fill = ch[SENSITIVE_FILL[stair]];
  const highest = roles(brand, "Highest");
  const tint = (name: StatusName): Surface => {
    const st = roles(m.status[name][mode], "Canvas High");
    return {
      bg: st.Surface,
      on: st.On_Surface,
      onMuted: st.Content_Low,
      border: st.Border,
      hover: state(st.Surface, st.Main, m.states.hover),
    };
  };

  const neutral = (border: Hex): Surface => ({
    bg: fill,
    on: ch.Content_Low,
    onMuted: ch.Content_Low,
    border,
    hover: state(fill, ch.Main, m.states.hover),
  });

  return {
    masked: neutral(ch.Border),
    revealed: tint("warning"),
    ownership: tint("info"),
    forbidden: neutral(highest.Border),
  };
}

/**
 * Todo color de un modo sale del MISMO esquema: el de la marca.
 *
 * Hubo un eje de acento propio —un segundo esquema, o un color libre— y se
 * quitó: el sistema de Matu no lo tiene. Sus dos familias de acento
 * (`Color_hue-30`, `Color_hue-330`) son dos posiciones por modo —`vivid` y
 * `soft`, con la misma inversión claro/oscuro que `Tint`— pero **sin `on`**, y
 * sus luminosidades difieren tanto (0.76 contra 0.43 en OKLab) que una de las
 * dos no soporta texto blanco. Cablearlas a una superficie exige elegir ese
 * `on`, y eso es identidad: no vive en el generador.
 *
 * La consecuencia, medida: los 13 tokens que movía el acento —`primary`,
 * `secondary`, el renglón activo del lateral y el anillo de foco del campo—
 * siguen a la marca. Con una marca gris, los botones son grises.
 */
function semanticSetOf(m: MatuResolved, mode: "light" | "dark"): SemanticSet {
  const brand = m[mode];
  const stair = stairOf(m);
  const level = levelOf(m);
  const chrome = chromeOf(m);
  const steps = NEUTRAL_TIERS[stair];
  const neutralLayer = neutralLayerOf(stair, level);
  const ch = roles(brand, neutralLayer);
  // El acento se lee siempre de la capa de tinte: `Main` es idéntico en las dos
  // direcciones, y de la escalera de superficies el acento no participa.
  const chAccent = roles(brand, "Canvas High");
  const accent = (mode_: ResolvedMode) => surfaceOf(m, mode_, SOLID_TIER);
  const tintedSidebar = chrome === "sidebar" || chrome === "both";
  const sidebarBase = surfaceOf(
    m,
    brand,
    tintedSidebar ? CHROME_SOLID_TIER : sidebarTier(neutralLayer)
  );
  /**
   * El renglón activo del menú: el ACENTO lavado sobre el fondo del menú.
   *
   * Sigue al acento y no a las superficies porque es lo único que dice DÓNDE
   * estás: con superficies neutras, un lavado neutro sobre un fondo neutro no se
   * distingue de un hover ni de una fila cualquiera, y la marca de posición se
   * pierde justo en el tema que más la necesita. El lavado es suave, así que el
   * fondo sigue siendo esencialmente el del menú y el texto tiene que seguir
   * contrastando con ÉL: `onSelected` se queda en las superficies.
   */
  const selected = tintedSidebar
    ? roles(brand, "Solid").Surface
    : state(sidebarBase.bg, chAccent.Main, m.states.selected);

  const set: Omit<SemanticSet, "families"> = {
    page: surfaceOf(m, brand, withLevel(steps.page, level)),
    raised: surfaceOf(m, brand, withLevel(steps.raised, level)),
    sunken: surfaceOf(m, brand, withLevel(steps.sunken, level)),
    inverse: surfaceOf(m, brand, INVERSE_TIER),

    primary: accent(brand),
    // Matu no declara un segundo acento: su esquema tiene UN hue, y los
    // `Color_hue-*` de relación vienen vacíos. Lo secundario es entonces la
    // misma marca en su registro profundo —`Surface`/`On_Surface` de la capa
    // `Solid`—, que es lo más cerca que su vocabulario tiene. Inventar un hue
    // acá sería identidad, y eso no vive en el generador.
    secondary: surfaceOf(m, brand, {
      ...SOLID_TIER,
      bg: "Surface",
      on: "On_Surface",
      border: "Mantle",
    }),
    error: accent(m.status.error[mode]),
    warning: accent(m.status.warning[mode]),
    success: accent(m.status.success[mode]),
    info: accent(m.status.info[mode]),

    appBar: surfaceOf(
      m,
      brand,
      chrome === "appBar" || chrome === "both"
        ? CHROME_SOLID_TIER
        : withLevel(steps.appBar, level)
    ),
    sidebar: {
      ...sidebarBase,
      subtle: selected,
      selected: selected,
      // Sobre un lateral teñido el texto del renglón activo sale de la MISMA
      // capa: `ch.Content` es el ink del lienzo y sobre un fondo de marca no
      // contrasta. Con el lateral neutro el lavado es suave y el fondo sigue
      // siendo esencialmente el del menú, así que ahí sí manda el ink del lienzo.
      onSelected: tintedSidebar ? roles(brand, "Solid").On_Surface : ch.Content,
    },

    sensitive: sensitiveOf(m, brand, mode, stair),

    text: {
      primary: ch.Content,
      secondary: ch.Content_Low,
      // Deshabilitado es el contenido a la opacidad que Matu declara para eso,
      // no un gris elegido aparte.
      disabled: state(ch.Canvas, ch.Content, m.states.disable),
    },
    divider: ch.Border,
    focusRing: ch.Focus,
  };

  // Las superficies de familia ya NO se toman prestadas de otra superficie: se
  // derivan de las capas, por su propia tabla (`FAMILY_TIERS`). Con la selección
  // estándar el resultado es idéntico al del préstamo —y un test lo ata—; lo que
  // cambia es que ahora hay dónde apartarse.
  return { ...set, families: familiesOf(m, brand, stair, set.raised.bg) };
}

// ─────────────────────────────────────────────────────── Niveles 1 y 3

function spacingOf(s: Record<string, number>): SpacingScale {
  const px = (name: string) => need(s, name, "la escala de espaciado");
  return {
    unit: px("s-8"),
    none: 0,
    xs: px("s-4"),
    s: px("s-8"),
    m: px("s-16"),
    l: px("s-24"),
    xl: px("s-32"),
    xxl: px("s-48"),
  };
}

function radiusOf(r: Record<string, number>): RadiusScale {
  const px = (name: string) => need(r, name, "la escala de radios");
  return {
    none: px("Radius_None"),
    xs: px("Radius_XS"),
    s: px("Radius_S"),
    m: px("Radius_M"),
    l: px("Radius_L"),
    xl: px("Radius_XL"),
    full: px("Radius_Full"),
  };
}

/**
 * Las 25 entradas que MUI espera, desde las sombras que Matu SÍ declara.
 *
 * Se prefieren las suyas a las de `doctrine.ts` —que el resolver ya dejó en
 * `shadows` como red— porque acá existen: el gap-fill es para lo que falta, no
 * para lo que está. Por encima del último nivel se repite, que es la misma
 * regla de `elevation()`: más de cuatro o cinco alturas no se perciben.
 */
function shadowLadder(
  effects: Record<string, string>,
  red: string[]
): string[] {
  const ownShadows = Object.keys(effects)
    .filter((k) => /^Shadow /.test(k))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((k) => effects[k]);
  if (ownShadows.length === 0) return red;

  const s: string[] = Array(25).fill("none");
  for (let i = 1; i < 25; i++)
    s[i] = ownShadows[Math.min(i - 1, ownShadows.length - 1)];
  return s;
}

/**
 * Los ingredientes sueltos, sin componer a nivel semántico. `fontSize` se
 * convierte a rem acá —la misma conversión que usa `composeRamp`— porque el
 * cliente no la trae: lo que se emite tiene que quedar listo para usar.
 */
function typographyIngredientsOf(m: MatuResolved): TypographyIngredients {
  const fontSize: Record<string, string> = {};
  for (const [k, v] of Object.entries(m.primitives.fontSize))
    fontSize[k] = rem(v);
  return {
    fontSize,
    lineHeight: m.primitives.lineHeight,
    fontWeight: m.primitives.fontWeight,
  };
}

function primitivesOf(m: MatuResolved): Primitives {
  const spacing = spacingOf(m.primitives.spacing);
  const radius = radiusOf(m.primitives.radius);
  const shadows = shadowLadder(m.effects, m.shadows);
  const family =
    m.aliases.icons.family.toLowerCase() === "lucide" ? "lucide" : "material";

  return {
    // El color de un tema Matu NO se expresa en escalas de once pasos: vive en
    // los roles de cada capa, y ya está aplanado en `light`/`dark`. Declarar
    // escalas acá obligaría a inventar una correspondencia entre su escala de
    // trece pasos y la de once, que nadie leería y que se desalinearía sola.
    scales: {},
    spacingUnit: spacing.unit,
    spacing,
    radius,
    radiusProgression: "growing",
    // La familia llega del corpus PELADA ("Manrope") y acá se vuelve pila, por
    // el mismo camino del catálogo que usa `resolveTheme` (`pilaCss`): sin
    // respaldos, una fuente que no cargó degrada al default del navegador
    // —Times—, no a la sans del sistema.
    //
    // Es UNA familia para todo — la de párrafo, elegida en `resolveMatu` —
    // aunque el corpus declara familias DISTINTAS por rol (en Cated, Título =
    // IBM Plex Serif y Párrafo/Botón/Sistema = Manrope). Honrar esa distinción
    // es una decisión de diseño pendiente de discutir con Matu, no un hueco.
    typography: {
      ...m.typography,
      fontFamily: pilaCss(m.typography.fontFamily),
      titleFontFamily: pilaCss(m.typography.titleFontFamily),
      buttonFontFamily: pilaCss(m.typography.buttonFontFamily),
    },
    typographyIngredients: typographyIngredientsOf(m),
    elevation: {
      doctrine: "layered",
      levels: Math.min(4, shadows.length),
      shadows,
    },
    gradients: SIN_GRADIENTES,
    motion: m.motion,
    focus: m.focus,
    icons: { ...iconography(family), strokeWidth: m.aliases.icons.strokeWidth },
    layers: m.layers,
    // `Outline` y `Divider` co-varían en los cinco temas de Matu: un solo ajuste.
    // El anillo de foco no —va en 2 o en 3 según el tema—, así que es propio.
    stroke: {
      outline: m.aliases.stroke["Outline_Stroke"] ?? 1,
      focusRing: m.aliases.stroke["Focus_Ring_Stroke"] ?? m.focus.width,
    },
    opacity: {
      // Las claves de Matu son `opacity-10`…`opacity-90`; acá quedan numéricas,
      // que es como el resto del sistema nombra los escalones de una escala.
      scale: Object.fromEntries(
        Object.entries(m.primitives.opacity).map(([k, v]) => [
          Number(k.replace(/\D/g, "")),
          v,
        ])
      ),
      text: m.aliases.opacity["Text_Opacity"] ?? 1,
      lowText: m.aliases.opacity["Low_Text_Opacity"] ?? 1,
      overlay: m.aliases.opacity["Overlay_Opacity"] ?? 1,
      states: m.states,
    },
    shadows,
    duration: {
      fast: m.motion.duration.fast,
      base: m.motion.duration.base,
      slow: m.motion.duration.slow,
    },
  };
}

function componentsOf(m: MatuResolved, prim: Primitives): ComponentTokens {
  const a = m.aliases.radius;
  const r = (name: string) => need(a, name, "los radios de componente");
  const fs = (name: string) =>
    rem(need(m.primitives.fontSize, name, "los tamaños de componente"));
  // El espaciado del nivel 3 sale de la MISMA tabla que el resto del sistema
  // (`espaciadosDeComponente`), alimentada con la unidad que Matu declara: la
  // tabla es doctrina nuestra —Matu no dice cuántos píxeles tiene una celda—,
  // y escribirla acá otra vez era la copia que dejaba al tooltip fijo.
  const sp = espaciadosDeComponente(prim.spacing.unit);

  return {
    button: {
      radius: r("Button_Radius"),
      ...sp.button,
      fontSize: fs("text-14"),
    },
    card: { radius: r("Container_Radius") },
    dialog: { radius: r("Large_Container_Radius"), shadow: prim.shadows[4] },
    chip: { radius: r("Badge_Radius"), fontSize: fs("text-12") },
    tooltip: { radius: prim.radius.xs, ...sp.tooltip, fontSize: fs("text-12") },
    input: { radius: r("Input_Radius") },
    table: {
      ...sp.table,
      fontSize: fs("text-14"),
      headFontSize: fs("text-12"),
      rows: TIPO_DE_FILA_POR_DEFECTO,
    },
  };
}

/**
 * Lo que el `SemanticSet` NO puede expresar, y solo eso.
 *
 * Es la proyección que se emite al cliente: las seis capas de contraste —de la
 * marca y de los cuatro estados—, la escala de color de la que salen, y las
 * opacidades de estado. Los primitivos, la rampa TIPOGRÁFICA y el movimiento NO
 * van: ya llegan adaptados en `tokens.primitives`, y emitirlos dos veces serían
 * dos verdades que pueden divergir, que es el defecto que el kit existe para
 * evitar.
 *
 * La escala de color no cae en esa regla porque no llega adaptada por ningún
 * otro lado: `primitives.scales` es el vocabulario de los presets DERIVADOS
 * (familias de once escalones) y el adaptador lo deja vacío, así que sin esto
 * la escala del esquema no existía del lado del cliente. Que no esté ahí no es
 * lo mismo que que no exista, y la galería llegó a afirmar lo segundo.
 */
export interface MatuLayers {
  /** Cuál de las combinaciones es, para poder nombrarla en pantalla. */
  selection?: MatuResolved["selection"];
  /** La escala del esquema que pinta las superficies. Ver `MatuResolved.baseColors`. */
  baseColors: MatuResolved["baseColors"];
  states: MatuResolved["states"];
  light: ResolvedMode;
  dark: ResolvedMode;
  status: MatuResolved["status"];
}

export const matuLayers = (m: MatuResolved): MatuLayers => ({
  ...(m.selection ? { selection: m.selection } : {}),
  baseColors: m.baseColors,
  states: m.states,
  light: m.light,
  dark: m.dark,
  status: m.status,
});

// ──────────────────────────────────────────────────────────── Punto de entrada

export function matuToPreset(m: MatuResolved, name = "base"): Preset {
  const primitives = primitivesOf(m);
  return {
    name,
    primitives,
    components: componentsOf(m, primitives),
    light: semanticSetOf(m, "light"),
    dark: semanticSetOf(m, "dark"),
    // El snapshot viaja con el preset: es lo que permite emitir los roles al
    // cliente sin volver a resolver, y lo que la galería de la Fase 2 va a leer.
    matu: m,
  };
}
