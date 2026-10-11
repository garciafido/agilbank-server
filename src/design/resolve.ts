/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * El único punto de entrada del sistema de diseño.
 *
 * Lo llaman los tres generadores —cliente, servidor y landing— con el mismo
 * hkconfig, y de ahí sale la identidad de las tres superficies. Es lo que hace
 * que el correo y la aplicación se vean del mismo producto sin que el servidor
 * tenga que importar nada del cliente: no comparten código, comparten origen.
 */

import {
  ContrastLevel,
  checkPairs,
  formatFailures,
  formatOrphaned,
} from "./contrast";
import {
  DENSITY_FACTOR,
  DerivedOptions,
  Seeds,
  derivePreset,
  radiosDeComponente,
  radiusScale,
} from "./derived";
import {
  TIPOS_DE_FILA,
  elevation,
  espaciadosDeComponente,
  iconography,
  motion,
  spacingScale,
} from "./doctrine";
import { DEFAULT_PRESET, PRESETS, getPreset } from "./presets";
import { composeRamp, px } from "./matuRamp";
import { matuResolvedFor } from "./matuSelection";
import { matuToPreset } from "./matuAdapter";
import { conBordesPorOpacidad, pairsOf } from "./semanticMap";
import { pilaCss, sePuedeAplicar } from "./fonts";
import {
  ComponentTokens,
  EmailView,
  HaikuThemeConfig,
  Iconography,
  Primitives,
  Preset,
  ResolvedTheme,
  RowStyle,
  SemanticSet,
  TypographyIngredients,
  TypographyScale,
} from "./types";

export interface ResolveOptions {
  /** Adónde van los avisos. Inyectable para poder testear sin capturar consola. */
  warn?: (message: string) => void;
}

/**
 * Qué presets admiten `density`, derivado del catálogo y no escrito.
 *
 * Son dos familias por dos motivos distintos: los DERIVADOS la reconstruyen
 * desde las semillas (`derivedFrom`), y los TOKENIZADOS la recomponen desde su
 * escala de origen (`typographyIngredients`). Un preset literal sin
 * ingredientes —`legacy`— no tiene de dónde: sus tamaños están escritos uno por
 * uno y no hay escala cruda que multiplicar.
 *
 * Se calcula al pedirlo y no una vez al cargar: el catálogo se arma en el mismo
 * ciclo de módulos que este archivo, y leerlo arriba lo tomaría a medio llenar.
 */
const densityCapablePresets = (): string[] =>
  Object.entries(PRESETS)
    .filter(([, p]) => p.derivedFrom || p.primitives.typographyIngredients)
    .map(([name]) => name);

/**
 * La rampa de un preset TOKENIZADO, recompuesta con el factor de densidad.
 *
 * De las dos formas de aplicar densidad sobre una escala tokenizada se eligió
 * **escalar los tamaños**, no correr la tabla rol→escalón a los escalones
 * vecinos. Dos razones, y la segunda es la que decide:
 *
 *  1. Los escalones del corpus son gruesos —12, 14, 16, 18, 20, 24, 32— y
 *     correr uno solo mueve entre 8% y 25%, cuando la densidad pide 6,25%.
 *     `h1` bajaría de 32 a 24 px para expresar "un poco más compacto". Y en los
 *     extremos no hay escalón adonde correrse: `h1` no tiene siguiente hacia
 *     arriba ni `text-12` hacia abajo, así que la rampa se aplastaría por las
 *     puntas.
 *  2. Escalar es lo que la densidad YA significa en los presets derivados
 *     (`typography()` en `presets/derived.ts`, mismo `DENSITY_FACTOR`). Con la
 *     otra opción, "compacto" querría decir dos cosas distintas según el
 *     preset, y la perilla dejaría de ser comparable entre temas.
 *
 * Se recompone con `composeRamp` —la misma tabla rol→escalón que armó la rampa
 * original— y no multiplicando la rampa ya compuesta: así los pesos y las
 * alturas de línea salen de donde siempre salieron, y la densidad toca
 * únicamente el tamaño. Con `density: "default"` el factor es 1 y la salida es
 * la rampa de siempre, valor por valor.
 */
function rampWithDensity(
  ingredients: TypographyIngredients,
  base: TypographyScale,
  density: NonNullable<HaikuThemeConfig["density"]>
): TypographyScale {
  const k = DENSITY_FACTOR[density];
  const fontSize: Record<string, number> = {};
  for (const [name, value] of Object.entries(ingredients.fontSize)) {
    fontSize[name] = px(value) * k;
  }
  // Las tres familias se llevan desde la rampa BASE: recomponer con solo la de
  // párrafo perdía las de título y botón, y el test de identidad de densidad lo
  // denunció en el mismo commit que las agregó.
  return composeRamp(
    { fontSize, lineHeight: ingredients.lineHeight },
    base.fontFamily,
    base.button.fontWeight,
    base.titleFontFamily,
    base.buttonFontFamily
  );
}

/**
 * Las opciones que NO se pueden aplicar parchando primitivos, porque de ellas
 * cuelga más de un nivel del tema.
 *
 * `radius.base` alimenta la escala de radios Y los siete radios de componente;
 * `spacingUnit`, la escala de espaciado Y los siete paddings de componente
 * —que son la densidad que el ojo mide, y que hasta acá no se movían—;
 * `density`, la escala tipográfica entera. Parchar solo el primitivo dejaba el
 * nivel 3 apuntando a los valores viejos — que es exactamente lo que venía
 * pasando: `radius.base` estaba declarado en el tipo, nombrado en el comentario
 * de `atajos`, y no lo leía nadie.
 *
 * Se re-deriva desde `derivedFrom`, que es la misma vía que ya usaban las
 * semillas: una sola forma de expresar "esto cambia el preset entero".
 */
function reDerive(
  preset: Preset,
  config: HaikuThemeConfig,
  warn: (message: string) => void
): Preset {
  const seeds =
    config.seeds && Object.keys(config.seeds).length > 0
      ? config.seeds
      : undefined;
  const { base: radiusBase, progression } = config.radius ?? {};
  const density = config.density;
  const spacingUnit = config.spacingUnit;

  // Los radios por familia también disparan: sin esto, pedir solo
  // `radius: {panel: 16}` salía por acá y no movía nada, en silencio.
  const radiusPerFamily = ["button", "field", "panel", "largePanel"].some(
    (f) =>
      (config.radius as Record<string, unknown> | undefined)?.[f] !== undefined
  );

  if (
    !seeds &&
    radiusBase === undefined &&
    !progression &&
    !density &&
    spacingUnit === undefined &&
    !radiusPerFamily
  ) {
    return preset;
  }

  if (!preset.derivedFrom) {
    // Las semillas cortan y el resto avisa, y la asimetría es deliberada: pedir
    // colores propios sobre un preset literal es un malentendido de fondo,
    // mientras que pedir otro radio es algo que se puede conseguir por la vía
    // que el aviso indica.
    if (seeds) {
      // El preset tokenizado tiene su propia vía y hay que nombrarla: sus
      // colores salen de una escala de marca, no de siete semillas sueltas, y
      // mandar a "elegir un preset derivado" sería mandar a salirse del sistema
      // de diseño para conseguir algo que el sistema ya da.
      throw new Error(
        preset.name === "base"
          ? `El preset "base" declara sus colores uno por uno, así que no admite semillas.\n` +
            `Para una marca propia dentro del sistema de diseño, declarar su color en ` +
            `hkconfig.json → theme.base.brand (excluyente con theme.base.colorScheme).`
          : `El preset "${preset.name}" declara sus colores uno por uno, así que no admite semillas.\n` +
            `Para declarar colores propios, elegir un preset derivado (neutral, slate, atrium) ` +
            `en hkconfig.json → theme.preset.`
      );
    }
    // El radio y el espaciado SÍ se pueden: `radiusScale` y
    // `espaciadosDeComponente` son funciones completas de su propio número, no
    // necesitan saber de dónde salieron los colores. Negárselo a un preset
    // literal sería una restricción inventada — y en la práctica significaba
    // que mover el control no hacía nada, en silencio.
    let primitives = preset.primitives;
    // El nivel 3 acompaña al nivel 1, si no el botón se redondea y la tarjeta
    // no, o la escala se abre y la celda de la grilla se queda quieta. Las dos
    // perillas escriben sobre el MISMO objeto: aplicadas por separado, la
    // segunda partiría del preset y borraría lo que hizo la primera.
    const components = { ...preset.components } as Record<string, object>;
    let touched = false;

    if (radiusBase !== undefined || progression) {
      const prog = progression ?? preset.primitives.radiusProgression;
      const scale = radiusScale(radiusBase ?? preset.primitives.radius.s, prog);
      const rc = radiosDeComponente(scale) as Record<
        string,
        { radius: number }
      >;
      for (const [key, value] of Object.entries(rc)) {
        components[key] = { ...components[key], ...value };
      }
      primitives = { ...primitives, radius: scale, radiusProgression: prog };
      touched = true;
    }

    /**
     * Los radios por familia, encima de lo que la escala dejó.
     *
     * Van DESPUÉS del bloque de `base` a propósito: si `base` reescaló todo, una
     * familia declarada tiene que ganarle. Al revés, reescalar borraría la
     * decisión más específica con la más general.
     */
    const perFamily: Record<string, string[]> = {
      button: ["button"],
      field: ["input", "chip"],
      panel: ["card"],
      largePanel: ["dialog"],
    };
    for (const [adjustment, targets] of Object.entries(perFamily)) {
      const value = (
        config.radius as Record<string, number | undefined> | undefined
      )?.[adjustment];
      if (value === undefined) continue;
      for (const target of targets) {
        components[target] = { ...components[target], radius: value };
      }
      touched = true;
    }

    if (
      spacingUnit !== undefined &&
      spacingUnit !== preset.primitives.spacingUnit
    ) {
      const spacings = espaciadosDeComponente(spacingUnit) as Record<
        string,
        object
      >;
      for (const [key, value] of Object.entries(spacings)) {
        components[key] = { ...components[key], ...value };
      }
      // Los primitivos de espaciado siguen saliendo de `atajos`, que ya los
      // recalcula con la misma unidad: hacerlo acá también sería una segunda
      // cuenta que puede discrepar de la que manda.
      touched = true;
    }

    // La densidad depende de lo que el preset traiga. Un preset TOKENIZADO
    // guarda su escala cruda (`typographyIngredients`) y la rampa se recompone
    // desde ahí — es el caso de `matu`, donde hasta acá la perilla existía y no
    // llegaba. Uno que declara sus tamaños uno por uno no tiene de dónde: ahí
    // sí, avisar y no tocar nada.
    if (density) {
      const ingredients = preset.primitives.typographyIngredients;
      if (ingredients) {
        primitives = {
          ...primitives,
          typography: rampWithDensity(
            ingredients,
            preset.primitives.typography,
            density
          ),
        };
        touched = true;
      } else {
        warn(
          `El preset "${preset.name}" declara su tipografía tamaño por tamaño y no trae la ` +
            `escala de la que salió, así que "density" no tiene qué multiplicar.\n` +
            `Los presets que sí admiten densidad son: ${densityCapablePresets().join(
              ", "
            )}. ` +
            `Elegir uno en hkconfig.json → theme.preset.`
        );
      }
    }

    return touched
      ? {
          ...preset,
          primitives: primitives,
          components: components as unknown as Preset["components"],
        }
      : preset;
  }

  const base = preset.derivedFrom as DerivedOptions;
  return derivePreset({
    ...base,
    seeds: seeds ? ({ ...base.seeds, ...seeds } as Seeds) : base.seeds,
    radiusBase: radiusBase ?? base.radiusBase,
    radiusProgression: progression ?? base.radiusProgression,
    density: density ?? base.density,
    spacingUnit: spacingUnit ?? base.spacingUnit,
  });
}

/**
 * La combinación de Matu que el proyecto eligió, si eligió alguna.
 *
 * Declararla con otro preset CORTA en vez de ignorarse: es una confusión fácil
 * —el bloque está ahí, escrito, y no haría nada— y el silencio la volvería
 * indistinguible de haberla aplicado.
 */
function withMatuCombination(preset: Preset, config: HaikuThemeConfig): Preset {
  if (!config.base) return preset;
  if (preset.name !== "base") {
    throw new Error(
      `theme.base elige una combinación del sistema de diseño tokenizado, pero el preset es "${preset.name}".\n` +
        `Declarar theme.preset = "base", o sacar el bloque theme.base.`
    );
  }
  return matuToPreset(matuResolvedFor(config.base));
}

/** Fusiona los overrides puntuales del proyecto sobre el conjunto del preset. */
function mergeSet(base: SemanticSet, override?: object): SemanticSet {
  if (!override) return base;
  const out: any = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = (base as any)[key];
    out[key] =
      value && typeof value === "object" && !Array.isArray(value) && current
        ? { ...current, ...value }
        : value;
  }
  return out as SemanticSet;
}

/**
 * Fusiona en profundidad, pero solo donde hay objetos. Los arrays —las sombras—
 * se reemplazan enteros: una escala de elevación a medio pisar no significa
 * nada, y fusionarla por índice produciría una mezcla que nadie eligió.
 */
function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base;
  if (Array.isArray(override) || typeof override !== "object")
    return override as T;

  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(
    override as Record<string, unknown>
  )) {
    out[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? deepMerge(out[key], value)
        : value;
  }
  return out as T;
}

/**
 * La vista del correo: los mismos tokens con las restricciones del medio.
 * Siempre el conjunto claro — ningún cliente de correo soporta modo oscuro de
 * forma fiable, y fingir que sí produce correos ilegibles.
 */
function emailView(light: SemanticSet, fontFamily: string): EmailView {
  return {
    fontFamily,
    colors: {
      background: light.page.bg,
      surface: light.raised.bg,
      text: light.text.primary,
      textMuted: light.text.secondary,
      border: light.page.border,
      primary: light.primary.bg,
      onPrimary: light.primary.on,
      error: light.error.bg,
      warning: light.warning.bg,
      success: light.success.bg,
    },
  };
}

/**
 * Los atajos que se pueden aplicar sobre los primitivos ya derivados, sin
 * volver a construir el preset: `spacingUnit`, `elevation`, `motion.speed`,
 * `icons.family` y la familia tipográfica.
 *
 * Existen porque nadie deberia tener que escribir una escala de espaciado
 * entera para decir "la unidad es 10". Lo fino se afina en `theme.primitives`.
 *
 * `spacingUnit` está en las dos partes, y es la única: acá recalcula la escala
 * de espaciado (nivel 1) y en `reDerivar` los paddings de componente (nivel 3).
 * No son dos cuentas que puedan discrepar —las dos leen `config.spacingUnit`—
 * sino un mismo número entrando a dos niveles.
 *
 * Lo que NO está acá —radios y densidad— es lo que arrastra al nivel 3 y solo
 * va por `reDerivar`. La distinción no es de estilo: parchar acá lo que cuelga
 * de dos niveles deja el tema internamente inconsistente sin que nada avise.
 */
/**
 * La escala tipográfica con las familias y el peso que la configuración pida.
 *
 * Los cuatro roles del sistema —párrafo, títulos, botones, y el peso del botón—
 * llegaban solo por el eje de TEMAS, entero: para tener títulos con serifas había
 * que adoptar un tema del corpus completo, con sus radios y sus íconos. Ahora se
 * piden por separado.
 *
 * Ausentes, los títulos y los botones siguen a la familia de párrafo, que es lo
 * que hacían antes de que estas claves existieran. Y el peso, el del tema.
 */
function typographicRoles(
  base: TypographyScale,
  config: HaikuThemeConfig,
  fontFamily: string
): TypographyScale {
  const family = (value: string | undefined, defaultValue: string) =>
    value ? pilaCss(value, config.typography?.fallback) : defaultValue;
  return {
    ...base,
    fontFamily,
    // Cada rol es INDEPENDIENTE: declarar el párrafo no toca los títulos.
    //
    // Se probó al revés —que los otros dos siguieran al párrafo— y estaba mal por
    // dos razones. La primera es que el emparejamiento tipográfico de un tema es
    // una decisión de diseño: sus títulos con serifas sobre su párrafo sin ellas
    // no es una casualidad que convenga borrar porque alguien cambió el párrafo.
    // La segunda es más dura: `typography.family` existe desde antes que estos
    // dos roles, y hay proyectos que ya la declaran. Hacer que arrastre a los
    // otros dos les cambiaría el tema en silencio.
    titleFontFamily: family(config.typography?.title, base.titleFontFamily),
    buttonFontFamily: family(config.typography?.button, base.buttonFontFamily),
    ...(config.weight?.button === undefined
      ? {}
      : { button: { ...base.button, fontWeight: config.weight.button } }),
  };
}

/**
 * Los íconos que resultan de lo que el tema trae y lo que la configuración
 * declara.
 *
 * La regla que importa es la del TRAZO: declarar la familia no puede llevárselo
 * puesto. Ver `HaikuThemeConfig.icons` para el defecto que esto arregla.
 */
function iconsOf(
  base: Iconography,
  config: HaikuThemeConfig["icons"]
): Iconography {
  if (!config?.family && config?.strokeWidth === undefined) return base;
  const family = config?.family ?? base.family;
  const fromFamily = family === base.family ? base : iconography(family);
  return {
    ...fromFamily,
    family: family,
    ...(config?.strokeWidth !== undefined
      ? { strokeWidth: config.strokeWidth }
      : {}),
  };
}

function shortcuts(
  base: Primitives,
  config: HaikuThemeConfig,
  fontFamily: string
): Primitives {
  const unit = config.spacingUnit ?? base.spacingUnit;
  const mot = config.motion?.speed ? motion(config.motion.speed) : base.motion;
  const elev = config.elevation ? elevation(config.elevation) : base.elevation;

  return {
    ...base,
    spacingUnit: unit,
    spacing: unit === base.spacingUnit ? base.spacing : spacingScale(unit),
    typography: typographicRoles(base.typography, config, fontFamily),
    stroke:
      config.stroke?.outline === undefined
        ? base.stroke
        : {
            ...(base.stroke ?? { outline: 1, focusRing: 2 }),
            outline: config.stroke.outline,
          },
    motion: mot,
    duration: {
      fast: mot.duration.fast,
      base: mot.duration.base,
      slow: mot.duration.slow,
    },
    elevation: elev,
    shadows: elev.shadows,
    icons: iconsOf(base.icons, config.icons),
  };
}

/**
 * El tipo de fila sobre el nivel 3 ya armado.
 *
 * Ausente devuelve el MISMO objeto, sin copiarlo: la identidad con "lo de hoy"
 * no se consigue porque el valor coincida sino porque no se toca nada. Es la
 * misma forma que `conBordesPorOpacidad` cuando no se declara ninguna familia.
 */
function withRowType(
  components: ComponentTokens,
  rows: RowStyle | undefined,
  warn: (message: string) => void
): ComponentTokens {
  if (!rows) return components;
  // `hkconfig.json` llega como `any`, igual que en `conBordesPorOpacidad`: un
  // valor que no existe no puede colarse hasta el cliente y dejar la grilla sin
  // ninguna separación —que es lo que haría el `else` de `buildTheme`—.
  if (!TIPOS_DE_FILA.includes(rows)) {
    warn(
      `El tema declara para las filas de la grilla un tipo que no existe: "${rows}".\n` +
        `Los que hay son: ${TIPOS_DE_FILA.join(
          ", "
        )}. Se ignora y quedan como están.`
    );
    return components;
  }
  return { ...components, table: { ...components.table, rows } };
}

export { pairsOf };

export function resolveTheme(
  config: HaikuThemeConfig = {},
  options: ResolveOptions = {}
): ResolvedTheme {
  const warn = options.warn ?? ((m: string) => console.warn(m));

  const preset = reDerive(
    withMatuCombination(getPreset(config.preset ?? DEFAULT_PRESET), config),
    config,
    warn
  );

  // La intensidad de borde entra DESPUÉS de los overrides puntuales y ANTES del
  // gate: después, porque un proyecto que se escribió un borde a mano igual
  // quiere poder ablandar su grilla; antes, porque lo que se mide tiene que ser
  // el color que se va a ver. Una intensidad baja puede hacer caer un par —el
  // borde del campo bajo el puntero es el candidato— y entonces el aviso
  // aparece, como con cualquier otra elección.
  const light = conBordesPorOpacidad(
    mergeSet(preset.light, config.light),
    config.borders,
    { preset: preset.name, mode: "light" },
    warn
  );
  const dark = conBordesPorOpacidad(
    mergeSet(preset.dark, config.dark),
    config.borders,
    { preset: preset.name, mode: "dark" },
    warn
  );

  // La intensidad de grilla y el tipo de fila se pisan a medias, y el aviso
  // dice EXACTAMENTE hasta dónde: sin línea entre filas la perilla no tiene qué
  // ablandar ahí, pero el encabezado conserva su borde en las tres
  // alternativas, así que la perilla sigue moviendo ESA línea. Decir "no hace
  // nada" sería mentir; callarlo sería ofrecer medio ajuste sin decirlo.
  if (config.rows && config.rows !== "linea" && config.borders?.grid) {
    warn(
      `El tema pide filas "${config.rows}" y a la vez bordes de grilla ` +
        `"${config.borders.grid}". Sin línea entre filas, esa intensidad ya no ` +
        `alcanza a la grilla: sigue valiendo solo para la línea del encabezado, ` +
        `que se dibuja igual en las tres alternativas.`
    );
  }

  const level: ContrastLevel = config.contrast?.level ?? "AA";
  // Las del preset primero: es deuda que el preset trae consigo (ver
  // `Preset.contrastExceptions`), y se funde con la del proyecto sin pisarla —
  // las dos listas entran a la MISMA comprobación, así que un par sobrante en
  // cualquiera de las dos se denuncia igual, no solo en la del config.
  const exceptions = [
    ...(preset.contrastExceptions ?? []),
    ...(config.contrast?.exceptions ?? []),
  ];
  const report = checkPairs(
    [
      ...pairsOf(light, "light", { rows: config.rows }),
      ...pairsOf(dark, "dark", { rows: config.rows }),
    ],
    level,
    exceptions
  );

  if (report.failures.length > 0) {
    const message = formatFailures(report.failures, level);
    // El default es avisar y no cortar. Cortar es lo correcto una vez que la
    // identidad está aplicada; hacerlo antes bloquearía la reorganización
    // inicial por defectos que esa etapa tiene prohibido corregir.
    if ((config.contrast?.onFailure ?? "warn") === "error")
      throw new Error(message);
    warn(message);
  }

  if (report.orphaned.length > 0) warn(formatOrphaned(report.orphaned));

  // La familia pasa por el catálogo: así `"geist"` alcanza para elegirla, y una
  // pila propia del proyecto sigue entrando tal cual.
  const fontFamily = config.typography?.family
    ? pilaCss(config.typography.family, config.typography.fallback)
    : preset.primitives.typography.fontFamily;

  // Una familia de sólo vista previa aplicada NO se ve: su paquete no está
  // instalado, así que el navegador cae a los respaldos del sistema operativo.
  // Hasta acá eso pasaba en silencio, que es el peor modo de falla para una
  // decisión de identidad — se elige una letra, se aplica, y se ve otra.
  if (!sePuedeAplicar(config.typography?.family)) {
    warn(
      `La familia tipográfica "${config.typography?.family}" es de sólo vista previa: ` +
        `su paquete no se instala en el proyecto.\n` +
        `Aplicada, la aplicación va a mostrar la familia del sistema operativo, no ésta. ` +
        `Para poder aplicarla hay que empaquetarla en el catálogo (fonts.ts, quitarle ` +
        `"empaquetada: false") y regenerar.`
    );
  }

  // El tema en pruebas se resuelve con el MISMO camino que el oficial —mismo
  // preset, mismas semillas, misma comprobación de contraste—. Si se resolviera
  // por otra vía, la audiencia acotada estaría validando algo que no es lo que
  // el resto va a recibir después, y la prueba no probaría nada.
  let preview: ResolvedTheme["preview"];
  if (config.preview) {
    const { audience, ...rest } = config.preview;
    if (
      !audience ||
      (!audience.roles?.length &&
        !audience.systemOwner &&
        !audience.tenants?.length)
    ) {
      throw new Error(
        "El tema en pruebas no declara audiencia. Sin audiencia lo verían todos, " +
          "que es lo contrario de para lo que existe.\n" +
          "Declarar theme.preview.audience con roles, systemOwner o tenants."
      );
    }
    const resolved = resolveTheme(rest, options);
    preview = {
      preset: resolved.preset,
      light: resolved.light,
      dark: resolved.dark,
      primitives: resolved.primitives,
      components: resolved.components,
      ...(resolved.matu ? { matu: resolved.matu } : {}),
      audience,
    };
  }

  return {
    preset: preset.name,
    defaultMode: config.defaultMode ?? "light",
    lab: config.lab ?? false,
    brand: {
      dir: config.brand?.dir ?? "brand",
      // Por default el logo que el generador ya trae, para que un proyecto sin
      // marca propia siga emitiendo exactamente lo mismo que hoy.
      logo: config.brand?.logo ?? "favicon.svg",
      loginBackground: config.brand?.loginBackground ?? null,
      loginLink: config.brand?.loginLink ?? null,
    },
    preview,
    primitives: deepMerge<Primitives>(
      shortcuts(preset.primitives, config, fontFamily),
      config.primitives
    ),
    light,
    dark,
    // El tipo de fila entra DESPUÉS del override de componentes: es una perilla
    // con vocabulario cerrado y validado, y un `components.table.rows` escrito
    // a mano en el hkconfig no tiene por qué ganarle a lo que la autoría eligió.
    components: withRowType(
      deepMerge<ComponentTokens>(preset.components, config.components),
      config.rows,
      warn
    ),
    email: emailView(
      light,
      config.typography?.emailFamily ?? "Helvetica, Arial, sans-serif"
    ),
    iconFamily: config.icons?.family ?? "material",
    ...(preset.matu ? { matu: preset.matu } : {}),
  };
}
