/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Lógica pura de autoría → tema resuelto, y elección del tema activo.
 *
 * `resolveAuthoring` es el GATE de entrada de datos de usuario: la mutation
 * GraphQL que declara el tema de un tenant o el global (Task 4) recibe
 * `unknown` y pasa por acá antes de tocar la base. No re-implementa nada del
 * sistema de diseño — mapea la autoría a un `HaikuThemeConfig` y reusa
 * `resolveTheme` (la resolución completa: combinación de Matu, perillas de
 * forma vía `reDerivar`/`atajos`, chequeo de contraste). Su valor propio es
 * cortar ANTES: forma desconocida, claves extra, rangos de las perillas,
 * tamaño excedido y versión no soportada son cosas que `resolveTheme` no
 * tiene por qué saber validar, porque su entrada de siempre es un
 * `HaikuThemeConfig` escrito a mano en `hkconfig.json`, no un valor que llegó
 * por red.
 *
 * `pickActiveTheme` es la otra mitad, y no valida nada: elige entre dos filas
 * ya resueltas y guardadas.
 */

import { stripGenerationRemedy } from "./contrast";
import { Selection } from "./matuAssemble";
import { FAMILIAS } from "./fonts";
import { TIPOS_DE_FILA } from "./doctrine";
import { resolveTheme, ResolveOptions } from "./resolve";
import {
  BorderIntensities,
  HaikuThemeConfig,
  ResolvedTheme,
  RowStyle,
  SemanticSet,
} from "./types";

export interface ThemeAuthoring {
  v: 1;
  preset: string;
  base?: Selection;
  /**
   * Las familias de los cuatro roles tipográficos que el sistema distingue, cada
   * una opcional. Ausentes, los títulos y los botones siguen al párrafo.
   */
  typography?: { family?: string; title?: string; button?: string };
  /**
   * `base` mueve la escala entera; los cuatro por familia se aplican ENCIMA de
   * lo que el preset trajo. Los dos caminos conviven: `base` reescala todo y una
   * familia declarada gana sobre el escalón que le tocaba.
   *
   * No hay ajuste de "redondos": ningún componente consume un radio de avatar o
   * de imagen, y un control que no mueve nada es peor que su ausencia.
   */
  radius?: {
    base?: number;
    progression?: "even" | "growing";
    button?: number;
    field?: number;
    panel?: number;
    largePanel?: number;
  };
  spacingUnit?: number;
  density?: "compact" | "default" | "comfortable";
  motion?: { speed: "fast" | "default" | "slow" };
  elevation?: "flat" | "layered";
  focus?: { width: number; offset: number; style: "solid" | "dashed" };
  /**
   * Cuánta línea quiere cada familia. Las dos son opcionales por separado: la
   * queja que trajo esta perilla fue sobre la GRILLA, y obligar a decir algo
   * sobre los campos para ablandar una tabla sería pedir una decisión que nadie
   * tomó.
   */
  borders?: BorderIntensities;
  /**
   * La familia de íconos y el grosor de su trazo. Ver `HaikuThemeConfig.icons`
   * para por qué son dos claves y no una.
   *
   * Está en la AUTORÍA y no solo en la configuración del proyecto porque los
   * temas del corpus traen su propia familia, y la configuración la pisaba: un
   * tema con íconos rellenos era invisible en un proyecto que declaraba los de
   * trazo, sin ninguna forma de verlo.
   */
  /**
   * El grosor del trazo de los íconos. SIN la familia, y eso es deliberado.
   *
   * Qué familia se usa se decide en GENERACIÓN: elige de qué paquete se importan
   * los íconos, y son dos juegos de componentes distintos. Un tema aplicado no
   * puede cambiarla —el paquete ya está empaquetado— así que ofrecerla acá sería
   * prometer algo que el sistema no puede cumplir. Vive en `hkconfig.json`, que
   * es el plano donde una regeneración sí pasa.
   *
   * El grosor SÍ es en vivo: lo pone el tema como override de `MuiSvgIcon`.
   */
  icons?: { strokeWidth?: number };
  /** El grosor de la línea con la que se dibujan bordes y separadores. */
  stroke?: { outline?: number };
  /** El peso de la letra de un botón. */
  weight?: { button?: number };
  /**
   * Cómo se separan las filas de una grilla. Ver `RowStyle`.
   *
   * No convive del todo con `borders.grid`, y eso se avisa al resolver: sin
   * línea entre filas esa intensidad ya solo alcanza al encabezado.
   */
  rows?: RowStyle;
}

/**
 * Los rangos y vocabularios de las perillas de forma, como DATO con nombre.
 *
 * Son el contrato entre el gate y cualquier control que autoríe: el selector
 * de la galería deriva de acá los límites de sus desplegables y las opciones
 * de sus selects, en vez de re-escribirlos — un número copiado en dos lados
 * es la lista paralela de siempre, y el síntoma sería un control que ofrece lo
 * que el gate corta. El motivo viaja junto al rango porque el mensaje de error
 * tiene que poder decir POR QUÉ el límite existe, no solo cuál es.
 *
 * `pasos` es la OFERTA curada del selector para cada perilla numérica, no una
 * segunda regla: el gate sigue validando el RANGO completo — una autoría
 * escrita a mano, o una UI fina futura, puede declarar un valor que ningún
 * paso ofrece (7, por ejemplo), y sigue siendo válida. Cada lista cae DENTRO
 * del rango de su propia perilla (lo comprueba `applied.test.ts`, cruzando las
 * dos); ampliar `pasos` nunca angosta lo que `resolveAuthoring` acepta, pero
 * angostar el rango de arriba SÍ tiene que angostar la lista, o quedaría
 * ofreciendo un paso que el gate ya no deja elegir.
 */
export const RANGOS = {
  radius: {
    base: {
      min: 0,
      /**
       * El techo es la PÍLDORA, no un número redondo.
       *
       * Estaba en 32 con el motivo "32 ya es una píldora", y no es cierto: 999 es
       * la convención del sistema para "redondeado completo" —está en
       * `primitives.radius.full`— y el tema `Culture` del corpus pone su botón
       * justo ahí. Con el techo en 32, el eje de temas producía un radio que la
       * autoría no podía escribir a mano: se podía elegir `Culture` y no se podía
       * pedir su forma. Un sistema donde una vía genera lo que la otra rechaza
       * tiene un límite mal puesto, no dos caminos.
       */
      max: 999,
      motivo:
        "0 es esquina viva y 999 es el redondeado completo (la píldora) — no hay nada más allá",
      pasos: [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 999],
    },
    progressions: ["even", "growing"],
    /**
     * Las familias que pueden llevar su PROPIO radio, con su rótulo.
     *
     * Se publican por lo mismo que las familias de borde: el control se arma con
     * esta lista, y una escrita al lado del control deja una familia sin
     * desplegable sin que nada lo denuncie. Fue exactamente lo que pasó — el gate
     * las aceptaba desde el principio y el laboratorio ofrecía un solo radio, así
     * que "botón en píldora con la tarjeta en 8" —lo que el tema `Culture` del
     * corpus hace— no se podía pedir desde la pantalla.
     *
     * El rango es el MISMO que el de `base`: un radio de componente no tiene por
     * qué tener límites distintos que la escala de la que sale.
     */
    familias: ["button", "field", "panel", "largePanel"],
    etiquetas: {
      button: "Radio de botón",
      field: "Radio de campo",
      panel: "Radio de panel",
      largePanel: "Radio de panel grande",
    },
  },
  spacingUnit: {
    min: 2,
    max: 16,
    motivo:
      "por debajo de 2 la escala no separa nada, y por encima de 16 sus múltiplos no entran en una pantalla",
    pasos: [4, 6, 8, 10, 12],
  },
  /**
   * La densidad no tiene rango porque no es un número: es el vocabulario
   * cerrado de los tres modos, igual que las velocidades o las doctrinas de
   * relieve. Multiplica la escala tipográfica entera, no el espaciado — el
   * espaciado es la perilla de arriba, y son dos decisiones distintas.
   */
  density: { modes: ["compact", "default", "comfortable"] },
  /**
   * La intensidad de borde tampoco es un número: son las FAMILIAS que la
   * admiten y los tres niveles. Las dos listas viajan porque el selector arma
   * un control por familia y las opciones de cada uno con los niveles — con
   * solo los niveles tendría que escribir "grilla" y "campo" por su cuenta, y
   * agregar una familia acá dejaría un control faltante que nada denuncia.
   */
  // El rótulo viaja con la familia: una familia nueva sin su nombre visible
  // se rendiría con el de otra, y el control mentiría en silencio.
  borders: {
    families: ["grid", "field"],
    etiquetas: { grid: "Bordes de grilla", field: "Bordes de campo" },
    opacidad: {
      min: 5,
      max: 100,
      motivo:
        "por debajo de 5 el borde no se distingue del fondo, y en 100 es el propio color del texto",
      // Los dos por defecto —30 decorativo y 50 de control— y los escalones
      // intermedios que tienen sentido pedir. Ver `OPACIDAD_DE_BORDE`.
      pasos: [15, 20, 25, 30, 40, 50, 65, 80],
    },
  },
  /**
   * Las dos familias de íconos y el rango del trazo.
   *
   * El máximo es 3: por encima de eso el trazo de un ícono de 20px se come el
   * dibujo. El mínimo es 0 —sin trazo— y es el valor que corresponde a la
   * familia rellena, así que no se puede cortar por debajo.
   */
  /**
   * El grosor de la línea del tema. El anillo de foco NO entra: tiene su propio
   * rango porque su umbral es de accesibilidad y no de estilo.
   */
  stroke: {
    outline: {
      min: 0.5,
      max: 4,
      motivo:
        "por debajo de 0.5 la línea desaparece en pantallas sin escala, y por encima de 4 deja de ser una línea",
      pasos: [0.5, 1, 1.5, 2, 3],
    },
  },
  /**
   * Los pesos que un botón puede llevar. Son los de una webfont variable, no
   * cualquier número: pedir 437 da lo mismo que pedir 400.
   */
  weight: {
    button: {
      min: 300,
      max: 800,
      motivo:
        "son los pesos que las familias del catálogo traen — fuera de ese rango el navegador simula, y simular un peso se ve mal",
      pasos: [400, 500, 600, 700],
    },
  },
  icons: {
    families: ["material", "lucide"],
    etiquetas: { material: "rellenos", lucide: "de trazo" },
    strokeWidth: {
      min: 0,
      max: 3,
      motivo:
        "en 0 el ícono no tiene trazo, y por encima de 3 el trazo se come el dibujo de 20px",
      pasos: [0, 0.2, 0.5, 0.8, 1, 1.5, 2],
    },
  },
  /**
   * Las tres alternativas de separación entre filas, con su rótulo. Van con
   * etiqueta por el mismo motivo que las familias de borde: "rayado" es
   * publicable tal cual, pero el día que entre una cuarta con nombre técnico el
   * control la mostraría cruda, y nadie se enteraría hasta verla en pantalla.
   */
  rows: {
    styles: TIPOS_DE_FILA,
    etiquetas: { linea: "línea", rayado: "rayado", limpio: "limpio" },
  },
  motion: { speeds: ["fast", "default", "slow"] },
  elevation: { doctrines: ["flat", "layered"] },
  focus: {
    width: {
      min: 1,
      max: 6,
      motivo:
        "con menos de 1 el anillo no se ve, y con más de 6 tapa lo que enfoca",
      pasos: [1, 2, 3, 4],
    },
    offset: {
      min: 0,
      max: 8,
      motivo:
        "negativo se mete dentro del control, y con más de 8 el anillo queda lejos de lo que señala",
      pasos: [0, 2, 4, 6],
    },
    styles: ["solid", "dashed"],
  },
} as const;

/**
 * La misma doble parcialidad que `Override`/`ThemeDraft` en
 * `mobxWebapp/static-files/projectDir/src/theme/buildTheme.ts`: cada campo
 * top-level opcional, y cada superficie DENTRO de `light`/`dark` opcional
 * también. No se importa —`haiku/design/` no puede depender de un static file
 * del cliente, que ni siquiera se procesa en este árbol— así que se redeclara
 * con la misma forma. Si `ThemeDraft` cambia de forma esta declaración se
 * desincroniza en silencio; el test de "caso feliz" es lo que lo nota primero,
 * al comparar contra la composición que arma el selector de la galería.
 */
type Override<T> = { [K in keyof T]?: Partial<T[K]> };

export interface ThemeDraftShape {
  light?: Override<SemanticSet>;
  dark?: Override<SemanticSet>;
  primitives?: Record<string, unknown>;
  components?: Record<string, unknown>;
}

const BYTE_LIMIT = 16 * 1024;

const ROOT_KEYS = new Set([
  "v",
  "preset",
  "base",
  "typography",
  "radius",
  "spacingUnit",
  "density",
  "motion",
  "elevation",
  "focus",
  "borders",
  "rows",
  "icons",
  "stroke",
  "weight",
]);
const MATU_KEYS = new Set([
  "colorScheme",
  "brand",
  "theme",
  "surfaces",
  "contentContrast",
  "solidChrome",
  "statusSchemes",
]);

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Claves fuera de la lista permitida CORTAN, no se ignoran: en un gate de
 * datos de usuario una clave inesperada es señal de una versión incompatible
 * del cliente o de un intento de colar algo que este contrato no declara.
 */
function rejectUnknownKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  where: string
): void {
  const extra = Object.keys(obj).filter((k) => !allowed.has(k));
  if (extra.length > 0) {
    throw new Error(
      `El tema recibido trae claves desconocidas en ${where}: ${extra.join(
        ", "
      )}.\n` + `Disponibles: ${[...allowed].join(", ")}.`
    );
  }
}

function validateMatu(value: unknown): Selection {
  if (!isObject(value)) {
    throw new Error(`El tema recibido declara "base" que no es un objeto.`);
  }
  rejectUnknownKeys(value, MATU_KEYS, `"base"`);

  if (typeof value.theme !== "string" || !value.theme) {
    throw new Error(
      `El tema recibido declara "base" sin "theme" (o no es texto).`
    );
  }
  for (const field of [
    "colorScheme",
    "brand",
    "surfaces",
    "contentContrast",
    "solidChrome",
  ] as const) {
    if (value[field] !== undefined && typeof value[field] !== "string") {
      throw new Error(
        `El tema recibido declara "base.${field}" que no es texto.`
      );
    }
  }
  const statusSchemes = value.statusSchemes;
  if (statusSchemes !== undefined) {
    if (!isObject(statusSchemes)) {
      throw new Error(
        `El tema recibido declara "base.statusSchemes" que no es un objeto.`
      );
    }
    for (const [state, mode] of Object.entries(statusSchemes)) {
      if (typeof mode !== "string") {
        throw new Error(
          `El tema recibido declara "base.statusSchemes.${state}" que no es texto.`
        );
      }
    }
  }

  return value as unknown as Selection;
}

/**
 * `family` se restringe al catálogo por id, igual que `base.theme` se
 * restringe al corpus — y acá el motivo no es solo consistencia: `pilaCss`
 * tiene un camino deliberado que devuelve VERBATIM cualquier string con `,` o
 * `"` (pensado para una pila propia escrita a mano en `hkconfig.json`, dato
 * de un desarrollador). Esta función valida una autoría que llega por red:
 * dejar ese camino abierto acá guardaría un string arbitrario dentro del tema
 * resuelto, listo para cualquier consumidor futuro que lo interpole en un
 * contexto CSS crudo. Hoy no existe ese consumidor —el cliente lo pasa por
 * CSS-in-JS y los correos ignoran el tema—, y restringir al catálogo hace que
 * nunca haga falta comprobarlo: la entrada de red queda en vocabulario
 * conocido, que además es lo único que el selector ofrece.
 */
function validateTypography(
  value: unknown
): NonNullable<ThemeAuthoring["typography"]> {
  if (!isObject(value)) {
    throw new Error(
      `El tema recibido declara "typography" que no es un objeto.`
    );
  }
  const roles = ["family", "title", "button"] as const;
  rejectUnknownKeys(value, new Set(roles), `"typography"`);
  if (Object.keys(value).length === 0) {
    throw new Error(
      `El tema recibido declara "typography" sin ningún rol.\n` +
        `Declarar al menos uno de: ${roles.join(", ")}.`
    );
  }
  const output: Record<string, string> = {};
  for (const role of roles) {
    if (value[role] === undefined) continue;
    if (typeof value[role] !== "string" || !value[role]) {
      throw new Error(
        `El tema recibido declara "typography.${role}" que no es texto.`
      );
    }
    if (!FAMILIAS.some((f) => f.id === value[role])) {
      throw new Error(
        `La familia tipográfica "${value[role]}" no existe en el catálogo.\n` +
          `Disponibles: ${FAMILIAS.map((f) => f.id).join(", ")}.`
      );
    }
    output[role] = value[role] as string;
  }
  return output;
}

/**
 * Un número dentro de su rango de `RANGOS`, o el corte con el motivo del
 * límite en el mensaje: quien recibe "fuera de 0–32" sin el porqué solo puede
 * probar otro número.
 */
function validateNumber(
  value: unknown,
  field: string,
  range: { min: number; max: number; motivo: string }
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    // El valor entra al mensaje: `hkconfig.json` llega como `any`, y nombrar la
    // clave sin decir qué se leyó manda a buscar a mano cuál de las dos —la que
    // se escribió o la que se heredó— es la que está mal.
    throw new Error(
      `El tema recibido declara "${field}" = ${JSON.stringify(
        value
      )}, que no es un número.`
    );
  }
  if (value < range.min || value > range.max) {
    throw new Error(
      `El tema recibido declara "${field}" = ${value}, fuera de ${range.min}–${range.max}: ${range.motivo}.`
    );
  }
  return value;
}

/** Un valor de un vocabulario cerrado de `RANGOS`, nombrando los disponibles. */
function validateOption<T extends string>(
  value: unknown,
  field: string,
  options: readonly T[]
): T {
  if (
    typeof value !== "string" ||
    !options.some((option) => option === value)
  ) {
    throw new Error(
      `El tema recibido declara "${field}" = ${JSON.stringify(value)}.\n` +
        `Disponibles: ${options.join(", ")}.`
    );
  }
  return value as T;
}

function validateRadius(value: unknown): NonNullable<ThemeAuthoring["radius"]> {
  if (!isObject(value)) {
    throw new Error(`El tema recibido declara "radius" que no es un objeto.`);
  }
  // La lista sale del contrato y no de acá: escrita en los dos lados, agregar
  // una familia dejaba el gate aceptándola y el control sin ofrecerla.
  const families = RANGOS.radius.familias;
  rejectUnknownKeys(
    value,
    new Set(["base", "progression", ...families]),
    `"radius"`
  );
  if (Object.keys(value).length === 0) {
    throw new Error(
      `El tema recibido declara "radius" sin ninguna clave.\n` +
        `Declarar al menos una de: base, progression, ${families.join(", ")}.`
    );
  }
  const byFamily: Record<string, number> = {};
  for (const f of families) {
    if (value[f] !== undefined) {
      byFamily[f] = validateNumber(value[f], `radius.${f}`, RANGOS.radius.base);
    }
  }
  return {
    // `base` deja de ser obligatorio: se puede ajustar una sola familia sin
    // reescalar todo.
    ...(value.base !== undefined
      ? { base: validateNumber(value.base, "radius.base", RANGOS.radius.base) }
      : {}),
    ...(value.progression !== undefined
      ? {
          progression: validateOption(
            value.progression,
            "radius.progression",
            RANGOS.radius.progressions
          ),
        }
      : {}),
    ...byFamily,
  };
}

function validateMotion(value: unknown): NonNullable<ThemeAuthoring["motion"]> {
  if (!isObject(value)) {
    throw new Error(`El tema recibido declara "motion" que no es un objeto.`);
  }
  rejectUnknownKeys(value, new Set(["speed"]), `"motion"`);
  return {
    speed: validateOption(value.speed, "motion.speed", RANGOS.motion.speeds),
  };
}

/**
 * Las dos familias, cada una opcional y ninguna con default acá: la ausencia de
 * una familia es "esa queda como está", que no es lo mismo que la intensidad de
 * fábrica escrita a mano —aunque den el mismo tema— porque una es una decisión y
 * la otra no. Un objeto
 * vacío pasa: declarar el bloque sin ninguna familia no es un error, es no
 * haber elegido todavía.
 */
/**
 * La familia y el trazo, cada uno opcional por separado.
 *
 * Que el trazo se pueda declarar SIN la familia es el punto: es lo que deja
 * afinar el trazo del tema puesto sin cambiarle la familia, que es la decisión
 * que más se toca.
 */
/**
 * El valor de la única clave que un bloque de una sola clave puede traer.
 *
 * Existe para `stroke` y `weight`, que hoy tienen una clave cada uno: sin esto,
 * cada bloque repetiría las mismas cinco líneas de "es un objeto", "no trae
 * claves de más", "trae la que hace falta". Si alguno gana una segunda clave se
 * escribe su validador propio, como `icons`.
 */
function singleKey(value: unknown, key: string, where: string): unknown {
  if (!isObject(value)) {
    throw new Error(`El tema recibido declara "${where}" que no es un objeto.`);
  }
  rejectUnknownKeys(value, new Set([key]), `"${where}"`);
  if (value[key] === undefined) {
    throw new Error(`El tema recibido declara "${where}" sin "${key}".`);
  }
  return value[key];
}

function validateIcons(value: unknown): NonNullable<ThemeAuthoring["icons"]> {
  return {
    strokeWidth: validateNumber(
      singleKey(value, "strokeWidth", "icons"),
      "icons.strokeWidth",
      RANGOS.icons.strokeWidth
    ),
  };
}

function validateBorders(
  value: unknown
): NonNullable<ThemeAuthoring["borders"]> {
  if (!isObject(value)) {
    throw new Error(`El tema recibido declara "borders" que no es un objeto.`);
  }
  rejectUnknownKeys(value, new Set(RANGOS.borders.families), `"borders"`);
  const out: NonNullable<ThemeAuthoring["borders"]> = {};
  for (const family of RANGOS.borders.families) {
    if (value[family] !== undefined) {
      out[family] = validateNumber(
        value[family],
        `borders.${family}`,
        RANGOS.borders.opacidad
      );
    }
  }
  return out;
}

/**
 * Las tres partes juntas, ninguna opcional: un anillo de foco a medio declarar
 * no tiene con qué completarse acá — el default es no declarar la perilla.
 */
function validateFocus(value: unknown): NonNullable<ThemeAuthoring["focus"]> {
  if (!isObject(value)) {
    throw new Error(`El tema recibido declara "focus" que no es un objeto.`);
  }
  rejectUnknownKeys(value, new Set(["width", "offset", "style"]), `"focus"`);
  return {
    width: validateNumber(value.width, "focus.width", RANGOS.focus.width),
    offset: validateNumber(value.offset, "focus.offset", RANGOS.focus.offset),
    style: validateOption(value.style, "focus.style", RANGOS.focus.styles),
  };
}

/**
 * Valida la FORMA y nada más: si preset o base existen de verdad en el
 * sistema de diseño lo comprueba `resolveTheme` al resolver, no acá.
 */
function validateAuthoring(a: unknown): ThemeAuthoring {
  let size: number;
  try {
    size = new TextEncoder().encode(JSON.stringify(a)).length;
  } catch {
    throw new Error(
      `El tema recibido no se puede serializar (referencia circular o valor no soportado).`
    );
  }
  if (size > BYTE_LIMIT) {
    throw new Error(
      `El tema recibido pesa ${size} bytes, más que el máximo permitido (${BYTE_LIMIT} bytes).`
    );
  }

  if (!isObject(a)) {
    throw new Error(
      `El tema recibido no es un objeto (${a === null ? "null" : typeof a}).`
    );
  }
  rejectUnknownKeys(a, ROOT_KEYS, "la raíz");

  if (a.v !== 1) {
    throw new Error(
      `El tema recibido declara la versión ${JSON.stringify(
        a.v
      )}, y este generador solo entiende v=1.`
    );
  }
  if (typeof a.preset !== "string" || !a.preset) {
    throw new Error(`El tema recibido no declara "preset" (o no es texto).`);
  }

  return {
    v: 1,
    preset: a.preset,
    ...(a.base !== undefined ? { base: validateMatu(a.base) } : {}),
    ...(a.typography !== undefined
      ? { typography: validateTypography(a.typography) }
      : {}),
    ...(a.radius !== undefined ? { radius: validateRadius(a.radius) } : {}),
    ...(a.spacingUnit !== undefined
      ? {
          spacingUnit: validateNumber(
            a.spacingUnit,
            "spacingUnit",
            RANGOS.spacingUnit
          ),
        }
      : {}),
    ...(a.density !== undefined
      ? { density: validateOption(a.density, "density", RANGOS.density.modes) }
      : {}),
    ...(a.motion !== undefined ? { motion: validateMotion(a.motion) } : {}),
    ...(a.elevation !== undefined
      ? {
          elevation: validateOption(
            a.elevation,
            "elevation",
            RANGOS.elevation.doctrines
          ),
        }
      : {}),
    ...(a.focus !== undefined ? { focus: validateFocus(a.focus) } : {}),
    ...(a.borders !== undefined ? { borders: validateBorders(a.borders) } : {}),
    ...(a.rows !== undefined
      ? { rows: validateOption<RowStyle>(a.rows, "rows", RANGOS.rows.styles) }
      : {}),
    ...(a.icons !== undefined ? { icons: validateIcons(a.icons) } : {}),
    ...(a.stroke !== undefined
      ? {
          stroke: {
            outline: validateNumber(
              singleKey(a.stroke, "outline", "stroke"),
              "stroke.outline",
              RANGOS.stroke.outline
            ),
          },
        }
      : {}),
    ...(a.weight !== undefined
      ? {
          weight: {
            button: validateNumber(
              singleKey(a.weight, "button", "weight"),
              "weight.button",
              RANGOS.weight.button
            ),
          },
        }
      : {}),
  };
}

/**
 * Valida y resuelve una autoría de tema.
 *
 * Tira con mensaje en castellano si la forma no valida, ANTES de tocar el
 * sistema de diseño. Con la forma validada, `resolved` sale de `resolveTheme`
 * —el mismo camino que un `hkconfig.json`, con su chequeo de contraste— y
 * `draft` es ese MISMO resolved recortado a los cuatro campos que
 * `themeOptions` consume en el cliente. Antes el draft se armaba aparte, con
 * la composición gemela de `borradorDe` en el selector de la galería; desde
 * las perillas de forma (radio, espaciado, densidad, movimiento, relieve, foco) el
 * selector pide este mismo camino, así que ya no hay dos armados que puedan
 * discrepar. Un preset inexistente o unos ejes de Matu cruzados cortan acá
 * también, pero por el mismo mensaje que ya tiran
 * `resolveTheme`/`checkMatuSelection`: no hay una segunda regla que pueda
 * discrepar de la que manda de verdad.
 *
 * `options` baja tal cual a `resolveTheme`: sin `warn` propio, los pares que
 * fallan AA terminan en `console.warn` del proceso — que para una autoría
 * llegada por red es el lugar equivocado. El llamador que atiende a un usuario
 * pasa un colector y le devuelve los avisos — SIN el remedio de generación:
 * "declarar la excepción en hkconfig.json" es una instrucción para quien corre
 * el generador, y dentro de la aplicación no hay ningún hkconfig que editar.
 * Los pares medidos, que son el dato, viajan completos.
 */
export function resolveAuthoring(
  a: unknown,
  options: ResolveOptions = {}
): {
  authoring: ThemeAuthoring;
  resolved: ResolvedTheme;
  draft: ThemeDraftShape;
} {
  const authoring = validateAuthoring(a);

  const config: HaikuThemeConfig = {
    preset: authoring.preset,
    ...(authoring.base ? { base: authoring.base } : {}),
    // Los TRES roles, no solo el párrafo: mapear uno dejaba los otros dos
    // guardados en la autoría y sin llegar al tema — se guardaba más de lo que se
    // aplicaba, que es el mismo defecto que tenían los radios por familia.
    ...(authoring.typography
      ? { typography: { ...authoring.typography } }
      : {}),
    ...(authoring.radius ? { radius: authoring.radius } : {}),
    ...(authoring.spacingUnit !== undefined
      ? { spacingUnit: authoring.spacingUnit }
      : {}),
    ...(authoring.density ? { density: authoring.density } : {}),
    ...(authoring.motion ? { motion: authoring.motion } : {}),
    ...(authoring.elevation ? { elevation: authoring.elevation } : {}),
    ...(authoring.borders ? { borders: authoring.borders } : {}),
    ...(authoring.rows ? { rows: authoring.rows } : {}),
    ...(authoring.icons ? { icons: authoring.icons } : {}),
    ...(authoring.stroke ? { stroke: authoring.stroke } : {}),
    ...(authoring.weight ? { weight: authoring.weight } : {}),
    // El foco no tiene atajo propio en `HaikuThemeConfig`: es un primitivo, y
    // el override de primitivos es exactamente su vía de siempre.
    ...(authoring.focus ? { primitives: { focus: authoring.focus } } : {}),
  };

  const warn = options.warn;
  const resolved = resolveTheme(
    config,
    warn ? { ...options, warn: (m) => warn(stripGenerationRemedy(m)) } : options
  );
  const draft: ThemeDraftShape = {
    light: resolved.light,
    dark: resolved.dark,
    primitives: { ...resolved.primitives },
    components: { ...resolved.components },
  };

  return { authoring, resolved, draft };
}

/**
 * El tema activo entre dos filas ya resueltas: el del tenant si tiene uno, si
 * no el global, si no ninguno. Nunca tira — es una elección, no una
 * validación — y `null`/`undefined` no se distinguen: ninguno de los dos dice
 * algo distinto de "esta fila no tiene tema propio".
 */
export function pickActiveTheme<T>(
  tenantRow: T | null | undefined,
  globalRow: T | null | undefined
): T | null {
  return tenantRow ?? globalRow ?? null;
}
