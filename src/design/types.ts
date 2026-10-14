/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Los tres niveles de 6.10 del sistema de diseño, como tres tipos distintos:
 *
 *     button.radius   →   radius.m   →   6
 *      (componente)      (semántico)   (primitivo)
 *
 * Que sean tipos separados es lo que hace que "todo el sistema menos
 * redondeado" y "solo los botones" sean operaciones diferentes. Con un solo
 * objeto plano las dos serían la misma cosa: buscar y reemplazar.
 */

import { ColorScale } from "./scale";
import { ContrastException, ContrastLevel } from "./contrast";
import { Hex } from "./color";
// Solo tipos, y por eso la circularidad con `matu/snapshot` no existe en
// ejecución: TypeScript la borra al compilar. El snapshot vive del lado Matu
// porque es su vocabulario; acá solo se lo transporta.
import { MatuResolved } from "./matuSnapshot";
import { Selection as MatuSelection } from "./matuAssemble";

// ─────────────────────────────────────────────────────────── Nivel 1: primitivos

export interface RadiusScale {
  none: number;
  xs: number;
  s: number;
  m: number;
  l: number;
  xl: number;
  full: number;
}

export interface TypographyScale {
  /** La del párrafo. Se llama así y no `paragraphFontFamily` por compatibilidad:
   *  es la que todo el sistema venía consumiendo. */
  fontFamily: string;
  /**
   * Las de título y botón, que Matu distingue y nosotros descartábamos.
   *
   * En su tema `Uchi` el botón es Source Serif 4 con el párrafo en Source Sans
   * Pro, y en `Cated` el título es IBM Plex Serif: la dupla serif/sans ya estaba
   * resuelta en su sistema. Donde un preset no las distinga valen lo mismo que
   * `fontFamily`, así que agregarlas no mueve nada.
   */
  titleFontFamily: string;
  buttonFontFamily: string;
  /**
   * Los pesos que la familia trae y el sistema puede usar. Declararlos importa:
   * hoy los imports de la fuente los fijan por afuera, así que pedir un 800 que
   * no se descargó produce una falsa negrita que el navegador inventa.
   */
  weights: number[];
  h1: TypeStyle;
  h2: TypeStyle;
  h3: TypeStyle;
  h4: TypeStyle;
  h5: TypeStyle;
  h6: TypeStyle;
  body1: TypeStyle;
  body2: TypeStyle;
  subtitle1: TypeStyle;
  subtitle2: TypeStyle;
  button: TypeStyle;
}

/**
 * Los ingredientes sueltos de los que sale `TypographyScale`: un tamaño, una
 * altura de línea o un peso, por nombre de token del esquema de origen — SIN
 * comprometerse a ningún nivel semántico.
 *
 * Existen porque `h1..h6` es jerarquía de lectura para accesibilidad, no
 * tamaño (ver `matu/ramp.ts`): hoy la única forma de pedir 20px es
 * `variant="h3"`, y eso declara al componente nivel 3 del documento aunque no
 * lo sea. De acá se pide un tamaño sin reclamar un nivel — el nivel semántico
 * sigue yendo por `component` en MUI (`<Typography variant="h3"
 * component="h2">`).
 *
 * Mismas unidades que `TypeStyle`: `fontSize` en rem, ya convertido — el
 * cliente no trae la conversión px→rem, así que se resuelve antes de emitir.
 * `lineHeight` como ratio unitless.
 *
 * Ausente cuando el preset no tiene una escala previa de la que salga la
 * rampa: hoy solo la llena el preset tokenizado (`matu`). `legacy` y los
 * presets derivados escriben cada nivel a mano, sin escala de origen — no se
 * les inventa una acá.
 */
export interface TypographyIngredients {
  fontSize: Record<string, string>;
  lineHeight: Record<string, number>;
  fontWeight: Record<string, number>;
}

export interface TypeStyle {
  fontWeight?: number;
  fontSize?: string;
  lineHeight?: number;
  /**
   * 6.2. El interletrado no aparece nombrado en el documento, pero es la
   * diferencia entre un titular que se lee como titular y uno que se lee como
   * texto grande. En cuerpos chicos se abre; en titulares se cierra.
   */
  letterSpacing?: string;
  textTransform?: "none" | "uppercase";
}

/**
 * 6.3. El documento no pide una unidad: pide **los valores admitidos**. La
 * diferencia es todo — con solo una unidad, cada quien elige su múltiplo y
 * reaparece el problema que la escala venía a resolver. Los nombres son lo que
 * vuelve comprobable "solo sus múltiplos".
 */
export interface SpacingScale {
  unit: number;
  none: number;
  xs: number;
  s: number;
  m: number;
  l: number;
  xl: number;
  xxl: number;
}

/**
 * 6.7. Movimiento.
 *
 * Lo que el documento pide y casi nunca se modela: no solo cuánto tarda, sino
 * **cómo arranca y frena**, y sobre todo **dónde no se anima**. Una lista vacía
 * de exclusiones es una decisión no tomada, no un sistema sin exclusiones: las
 * operaciones frecuentes suelen ganar sin animación.
 */
export interface Motion {
  duration: {
    instant: number;
    fast: number;
    base: number;
    slow: number;
    deliberate: number;
  };
  /**
   * Curvas de aceleración. `entering` arranca rápido y frena suave —lo que
   * aparece debe asentarse—; `exiting` hace lo contrario, porque lo que se va
   * no merece que se lo espere.
   */
  easing: {
    standard: string;
    entering: string;
    exiting: string;
    emphasized: string;
  };
  /** Dónde NO se anima. Nombres de interacción, no de componente. */
  neverAnimate: string[];
  /** 6.7 remite a 6.8: quien reduce el movimiento por salud debe ser respetado. */
  respectReducedMotion: boolean;
}

/**
 * 6.5. Sombras y degradados — "la decisión donde con mayor claridad se distingue
 * un sistema de 2026 de uno de 2018".
 */
export interface Elevation {
  doctrine: "flat" | "layered";
  /** Cuántos niveles se distinguen de verdad. Más de cuatro no se perciben. */
  levels: number;
  /** 25 entradas, como espera MUI. Ver la trampa del elevation 8 en el plan. */
  shadows: string[];
}

/**
 * 6.5, segunda mitad. El documento es explícito: "el degradado entre dos colores
 * muy distintos era el lenguaje de una época; el uso actual es casi
 * imperceptible". Nulo significa superficie plana, que es una decisión válida.
 */
export interface Gradients {
  surface: string | null;
  emphasis: string | null;
}

/**
 * 6.8. El foco visible. El documento lo trata como caso que beneficia a
 * cualquiera: quien carga datos todo el día opera con el teclado por velocidad,
 * no por necesidad. El color vive en el conjunto semántico porque cambia por
 * modo; la forma vive acá porque no.
 */
export interface FocusRing {
  width: number;
  offset: number;
  style: "solid" | "dashed";
}

/** 6.6. Iconografía: la familia, y su unidad de trazo y peso. */
export interface Iconography {
  family: "material" | "lucide";
  /** Solo aplica a familias de trazo. El documento pide que el trazo sea
   *  coherente con el peso tipográfico. */
  strokeWidth: number;
  size: { s: number; m: number; l: number };
}

/**
 * Los grosores de línea, de Matu.
 *
 * `outline` y `divider` co-varían en sus cinco temas —siempre el mismo valor—,
 * así que son un solo ajuste. El anillo de foco NO: va en 2 o en 3 según el
 * tema, y por eso es una decisión propia.
 */
export interface StrokeWidths {
  outline: number;
  focusRing: number;
}

/**
 * Las opacidades del sistema, de Matu.
 *
 * La escala existía en su corpus desde el principio y no la usábamos: los tres
 * alias ya apuntan a 80, 60 y 70 en sus cinco temas. Los cuatro `states` son el
 * vocabulario de interacción que nos faltaba — hoy el hover se calcula con una
 * mezcla propia que NO coincide con su 25%.
 */
export interface Opacities {
  /** La escala de 10 en 10, tal como la trae el corpus. Los alias apuntan acá. */
  scale: Record<number, number>;
  /** Texto normal sobre su fondo. 0.8 en los cinco temas. */
  text: number;
  /** Texto de menor jerarquía. 0.6. */
  lowText: number;
  /** El velo de un diálogo. 0.7. */
  overlay: number;
  states: { hover: number; selected: number; active: number; disable: number };
}

export interface Primitives {
  scales: Record<string, ColorScale>;
  /** Se conserva por compatibilidad: es `spacing.unit`. */
  spacingUnit: number;
  spacing: SpacingScale;
  radius: RadiusScale;
  /** 6.4: lo que diferencia no es el radio sino la progresión de la escala. */
  radiusProgression: "even" | "growing";
  typography: TypographyScale;
  /** Ver `TypographyIngredients`. Ausente cuando el preset no tiene escala de origen. */
  typographyIngredients?: TypographyIngredients;
  elevation: Elevation;
  gradients: Gradients;
  motion: Motion;
  focus: FocusRing;
  icons: Iconography;
  layers: Layers;
  /**
   * Los grosores de línea y las opacidades del sistema tokenizado.
   *
   * OPCIONALES a propósito, con el mismo criterio que `typographyIngredients`:
   * solo los trae el preset que los define de verdad. `legacy` no dibuja su
   * texto con opacidad —usa colores distintos para el ink apagado— y darle un
   * `text: 0.8` sería afirmar algo de él que nadie midió.
   */
  stroke?: StrokeWidths;
  opacity?: Opacities;
  /** Se conserva por compatibilidad: es `elevation.shadows`. */
  shadows: string[];
  /** Se conserva por compatibilidad: es `motion.duration`. */
  duration: { fast: number; base: number; slow: number };
}

// ────────────────────────────────────────────────────────── Nivel 2: semántico

/**
 * Una superficie y todo lo que va encima, declarados juntos. El tipo es lo que
 * vuelve imposible el defecto de 6.1: cambiar un fondo y dejar atrás el color
 * del texto, que después aparece ilegible solo en algunos lugares.
 */
export interface Surface {
  bg: Hex;
  on: Hex;
  onMuted: Hex;
  border: Hex;
  hover: Hex;
  /**
   * Variante más clara de la superficie. Opcional porque no toda superficie la
   * necesita, pero cuando falta MUI la deriva sola de `bg` — y su derivación no
   * coincide con la que el tema tenga escrita a mano.
   */
  subtle?: Hex;
  /**
   * El texto que va sobre `subtle`. El tinte de un estado se lee con su propio
   * ink, no con el `on` del relleno: sobre un lavado claro, el blanco que
   * funciona sobre el relleno pleno desaparece. Sin este campo, un componente
   * que pinta `subtle` no tiene con qué escribir encima y cae al par
   * equivocado.
   */
  onSubtle?: Hex;
  /** El borde en su estado enfatizado: el de un campo bajo el puntero. */
  borderStrong?: Hex;
}

/**
 * Las superficies que pertenecen a una FAMILIA DE COMPONENTE y no a un rol de
 * pantalla.
 *
 * `page`/`raised`/`sunken` contestan "¿a qué altura está esto?"; estas
 * contestan "¿qué clase de cosa es?". No es una taxonomía más fina por gusto:
 * la línea de una grilla se repite diez veces por pantalla y la de una tarjeta
 * una sola, así que el gris que separa dos bloques satura una tabla. Hasta acá
 * cada familia tomaba PRESTADA la superficie que más se le parecía —la grilla
 * el borde de `sunken`, el campo el `borderStrong` de `raised`— y ablandar la
 * tabla obligaba a ablandar todos los bordes de esa superficie.
 *
 * Viven en el nivel 2 y no en `ComponentTokens` porque son COLORES: el nivel 3
 * lleva medidas y es invisible para el gate de contraste, que mide pares del
 * conjunto semántico. Un color que nadie mide es el agujero que ya dejó
 * ilegible una alerta.
 */
export interface FamilySurfaces {
  /**
   * Grilla/tabla: la línea que se repite N veces por pantalla.
   *
   * **Ninguno de sus colores entra al gate de contraste, y eso está medido**:
   * los cuatro pares de grilla (`border`/`headBorder` sobre la tarjeta,
   * `headBg`/`rowHover` con el texto encima) fallarían en la práctica totalidad
   * de los presets y los dos modos, porque 1.4.11 exige 3:1 a lo que identifica
   * un CONTROL y un separador de filas no lo es. Un gate que avisa de nada en
   * casi todos los casos es un gate que se ignora. Lo que sí se mide es el borde del campo, que sí
   * identifica un control — ver `pairsOf` en `semanticMap.ts`.
   */
  grid: {
    /** La línea entre dos filas del cuerpo. */
    border: Hex;
    /** La línea bajo el encabezado: separa dos zonas, no dos filas. */
    headBorder: Hex;
    headBg: Hex;
    /** El fondo de la fila bajo el puntero. */
    rowHover: Hex;
    /**
     * El fondo de las filas pares cuando la grilla se separa por rayado.
     *
     * Es el ÚNICO token de familia que no existía en ninguna forma antes: los
     * demás transcriben lo que la pantalla ya pintaba. Se deriva —nunca se
     * escribe— con `rowAltFrom` (`semanticMap.ts`): la mitad de la separación
     * que el hover tiene con la superficie donde se dibujan las filas.
     *
     * Que salga del hover y no de un escalón aparte es lo que mantiene viva la
     * señal de "estás acá": la fila rayada queda a mitad de camino, así que el
     * hover se sigue notando sobre ella tanto como el rayado se nota sobre la
     * tarjeta. Con un escalón independiente las dos señales pueden cruzarse, y
     * la que se pierde es la que importa.
     *
     * A diferencia del resto de la familia, ESTE sí entra al gate —con umbral
     * propio, ver `subtle` en `contrast.ts`— y solo cuando el rayado está
     * elegido: un rayado que no se ve no separa nada, y es el único de los
     * cinco cuya falla no es "no llega a 3:1" sino "no existe".
     */
    rowAlt: Hex;
  };
  /**
   * Campo de formulario, en sus tres estados. El borde es lo ÚNICO que
   * identifica al control —adentro no tiene fondo propio—, y por eso 1.4.11 le
   * exige 3:1 mientras al de una tarjeta no: una tarjeta se separa por su
   * relleno, y con 3:1 se vería como una caja dibujada con marcador.
   *
   * Los tres son estados de lo mismo y por eso viajan juntos: cambiar el de
   * reposo sin mover el de foco produce un control que al enfocarse se ablanda.
   */
  field: { border: Hex; borderHover: Hex; borderFocus: Hex };
}

/**
 * Cuánta línea quiere una familia: la INTENSIDAD DE BORDE, como opacidad del
 * rol `Content` con la que se dibuja la línea, de 5 a 100.
 *
 * Es una relación con el fondo, no un color. El vocabulario de Matu **no gradúa
 * el borde**: el rol `Border` es idéntico en las cuatro capas neutras, en las
 * dos marcas y en los dos modos, y las dos capas que lo mueven lo tiran a los
 * extremos (`Solid` al ink del relleno, `Highest` a 20.98:1). Pero el problema
 * de fondo no era la falta de escalones intermedios: un color de borde FIJO no
 * puede servir en las dos direcciones de superficie —medido, el mismo token daba
 * 3.03:1 sobre la página y 2.25:1 sobre la tarjeta—, y ningún escalón de la
 * escala pasa 3:1 en los dos modos. Componiendo el contenido sobre su propio
 * fondo la línea conserva su fuerza sea cual sea ese fondo.
 *
 * Era un vocabulario de tres palabras (`suave | normal | fuerte`) y pasó a ser
 * un número cuando el borde dejó de ser un color con variantes. Ver
 * `OPACIDAD_DE_BORDE` en `semanticMap.ts` para los valores por defecto y por qué
 * son esos.
 *
 * Ausente ⇒ lo que el preset trae. Declarar la intensidad de fábrica ⇒ el MISMO
 * tema, byte a byte, en todos los presets menos `legacy`, que es transcripción
 * literal del tema histórico y no pasa por la regla.
 */
export type BorderIntensity = number;

/**
 * Por familia, porque ese es el punto: la línea de una grilla se repite diez
 * veces por pantalla y la de un campo una vez por control. Ablandar la tabla no
 * puede obligar a ablandar los campos, que es lo que pasaba cuando las dos
 * tomaban prestado el mismo borde.
 */
export interface BorderIntensities {
  grid?: BorderIntensity;
  field?: BorderIntensity;
}

/**
 * Cómo se separan las filas de una grilla entre sí. Son tres alternativas
 * EXCLUYENTES, no tres perillas: elegir una apaga las otras.
 *
 * Lo que varía en una fila son tres cosas, y dos ya tenían perilla — el alto lo
 * mueve `spacingUnit` y la intensidad de la línea la mueve `borders.grid`.
 * Ésta es la tercera y la única que no es un ajuste continuo: "línea o rayado"
 * no es un punto de una escala.
 *
 * Ausente ⇒ `linea`, que es lo de hoy.
 */
export type RowStyle = "linea" | "rayado" | "limpio";

export interface SemanticSet {
  page: Surface;
  raised: Surface;
  sunken: Surface;
  /** Fondo oscuro sobre claro (tooltips). Hoy es el `#1A1A1A` fijo. */
  inverse: Surface;

  primary: Surface;
  secondary: Surface;
  error: Surface;
  warning: Surface;
  success: Surface;
  /**
   * Opcional a propósito: hoy el tema NO declara `info` y MUI aplica el suyo.
   * Declararlo en el preset `legacy` cambiaría el objeto de tema —MUI deriva
   * `light`/`dark` de un `main` dado, y no coinciden con sus defaults—, así que
   * la etapa 1 dejaría de ser invisible. Los presets nuevos sí lo declaran.
   */
  info?: Surface;

  appBar: Surface;
  sidebar: Surface & { selected: Hex; onSelected: Hex };

  /** `disabled` es opcional por el mismo motivo que `info`: hoy no se declara. */
  text: { primary: Hex; secondary: Hex; disabled?: Hex };
  divider: Hex;
  focusRing: Hex;

  /**
   * 6.9 y definición 11. El documento pide CUATRO situaciones, no una, y la
   * distinción entre las dos últimas es la que más cuesta y más importa:
   * "no tenés permiso" y "no hay nada cargado" son afirmaciones distintas y no
   * deben verse igual.
   *
   * Los cuatro asientos se declaran aunque el acta todavía no haya decidido su
   * forma. Sin asiento, cada pantalla inventa la suya.
   */
  sensitive: {
    /** Hay un valor y no se ve cuál. */
    masked: Surface;
    /** El acto de revelarlo, y la señal que queda de que se lo vio. */
    revealed: Surface;
    /** De qué cliente es lo que se está mirando. */
    ownership: Surface;
    /** Existe, pero no corresponde ver. Distinto de vacío. */
    forbidden: Surface;
  };

  /**
   * Las superficies por familia de componente. Ver `FamilySurfaces`.
   *
   * Obligatorio y no opcional —a diferencia de `info`— porque su ausencia no
   * tiene un default sensato: un preset que no las declare dejaría a la grilla
   * y al campo sin borde. Declararlas no cambia nada por sí mismo; nacen con
   * el valor que cada familia ya tomaba prestado.
   */
  families: FamilySurfaces;
}

// ───────────────────────────────────────────────────────── Nivel 3: componente

/**
 * Cada entrada es una decisión de un componente que apunta a un nombre del
 * nivel 2 o del 1 — nunca a un valor. Se emite al cliente como código que
 * referencia los otros dos niveles, no como literales, porque si se aplanara
 * acá se perdería justamente la indirección que hace útil todo esto.
 */
export interface ComponentTokens {
  button: {
    radius: number;
    paddingY: number;
    paddingX: number;
    fontSize: string;
    variantPaddingLeft: number;
  };
  card: { radius: number };
  dialog: { radius: number; shadow: string };
  chip: { radius: number; fontSize: string };
  tooltip: {
    radius: number;
    fontSize: string;
    paddingY: number;
    paddingX: number;
  };
  input: { radius: number };
  /**
   * `rows` es la única entrada del nivel 3 que no es una medida: es la
   * ALTERNATIVA de separación entre filas, y el nivel 3 es "las decisiones de
   * cada componente", no "los números de cada componente". Vive acá y no en el
   * nivel 2 porque no es un color — el color que el rayado necesita
   * (`families.grid.rowAlt`) sí está allá, y es lo que el gate mide.
   */
  table: {
    cellPaddingY: number;
    cellPaddingX: number;
    fontSize: string;
    headFontSize: string;
    rows: RowStyle;
  };
}

/**
 * La banda alta de apilamiento. Los defaults de MUI (modal 1300, snackbar 1400,
 * tooltip 1500) quedan cortos para esta aplicación, que anida modales: un
 * tooltip en 1500 aparece DETRÁS de un diálogo de edición anidada, y la
 * descripción de un campo se vuelve invisible dentro de un mini-form.
 *
 * El orden es lo que importa, no los números: menú por encima del diálogo
 * anidado, y las capas que pueden dispararse DESDE dentro de un modal
 * —notificaciones y ayuda contextual— por encima de todo lo demás.
 */
export interface Layers {
  menu: number;
  snackbar: number;
  tooltip: number;
}

// ───────────────────────────────────────────────────── Lo que declara el proyecto

export interface HaikuThemeConfig {
  preset?: string;
  /**
   * Qué combinación del sistema de diseño de Matu, cuando el preset es `matu`.
   *
   * Sus dos ejes —marca y tema— se combinan en ~30 temas, y un nombre plano de
   * preset no puede expresar dos ejes: por eso la combinación es dato de la
   * configuración y no una entrada más del catálogo. Ausente ⇒ la combinación
   * estándar, que es lo que recibe hoy quien no declara nada.
   *
   * `statusSchemes` deja cambiar de qué esquema sale cada estado; ausente ⇒ los
   * cuatro que Matu ya trae.
   *
   * `brand` reemplaza a `colorScheme` por una marca PROPIA derivada de un color
   * semilla (`{"brand": "#2B6CB0", "theme": "Cated"}`): queda como una
   * combinación más junto a las del corpus, sin entrar en él. Los dos son
   * excluyentes.
   *
   * `accent` separa el ACENTO del esquema que pinta las superficies —un nombre
   * del corpus o una semilla—, que es lo que hace alcanzable el tema que ningún
   * esquema solo puede dar: superficies neutras con un acento de marca
   * (`{"colorScheme": "Neutral", "accent": "#2B6CB0", "theme": "Cated"}`).
   * Ausente ⇒ el acento sigue a las superficies, como siempre.
   *
   * `surfaces` elige la DIRECCIÓN de la escalera de superficies: `"Canvas"` —lo
   * elevado se separa de la página oscureciendo— o `"Mantle"`, la misma escalera
   * al revés (página apagada, tarjeta al frente), que es como está hecho el
   * preset de siempre. Ausente ⇒ la primera, como siempre.
   */
  base?: MatuSelection;
  seeds?: Partial<
    Record<
      "brand" | "accent" | "neutral" | "error" | "warning" | "success" | "info",
      Hex
    >
  >;
  typography?: {
    family?: string;
    fallback?: string;
    /** 6.2: la webfont no llega al correo. Acá va su reemplazo. */
    emailFamily?: string;
    /**
     * Las familias de los TÍTULOS y de los BOTONES, cuando no siguen a la de
     * párrafo.
     *
     * El sistema de diseño distingue cuatro roles tipográficos y hasta acá se
     * podía pedir uno. Los otros llegaban solo por el eje de temas, entero: para
     * tener títulos con serifas había que adoptar todo un tema del corpus.
     *
     * Ausentes ⇒ siguen a la de párrafo, que es lo que hacían antes de existir.
     */
    title?: string;
    button?: string;
  };
  spacingUnit?: number;
  /**
   * `base` reescala los siete escalones; los cuatro por familia se aplican
   * ENCIMA de lo que el preset trajo, así que se puede pedir "paneles más
   * redondeados que los botones" sin tocar la escala.
   */
  radius?: {
    base?: number;
    progression?: "even" | "growing";
    button?: number;
    field?: number;
    panel?: number;
    largePanel?: number;
  };
  /**
   * 6.3. Multiplica la escala tipográfica, no el espaciado.
   *
   * Vive acá y no solo en `DerivedOptions` porque el banco lo deja elegir: una
   * decisión que se puede tomar y no se puede escribir en la configuración es
   * peor que no poder tomarla.
   */
  density?: "compact" | "default" | "comfortable";
  elevation?: "flat" | "layered";
  /**
   * Cuánta línea quiere cada familia. Ver `BorderIntensities`.
   *
   * Vive acá y no solo en la autoría aplicada por el mismo motivo que
   * `density`: una decisión que se puede tomar desde el banco y no se puede
   * escribir en la configuración es peor que no poder tomarla — al regenerar
   * se perdería.
   */
  borders?: BorderIntensities;
  /**
   * Cómo se separan las filas de una grilla. Ver `RowStyle`.
   *
   * No es un color y por eso no vive en el nivel 2: aterriza en el nivel 3
   * (`components.table.rows`), que es donde viven las decisiones de un
   * componente. Lo que sí toca del nivel 2 es qué se mide — con `rayado`, el
   * gate empieza a comprobar el par del rayado, que sin rayado no existe.
   */
  rows?: RowStyle;
  /** 6.7. `speed` elige el juego de duraciones; el resto se afina en primitives. */
  motion?: { speed?: "fast" | "default" | "slow" };
  /** 6.6. El trazo y los tamaños se afinan en primitives. */
  /**
   * La familia de íconos y el grosor de su trazo, por separado.
   *
   * El grosor es una clave propia porque declarar la familia NO puede llevárselo
   * puesto. Los temas del corpus de Matu traen trazos medidos —0.2 en `Tech`, 0.8
   * en `Cated`— y `iconography()` devuelve 1.75 para cualquier `lucide`: un
   * proyecto que declaraba solo la familia perdía el trazo del tema y sus íconos
   * se dibujaban dos veces más gruesos, sin que nada avisara.
   *
   * Declarar solo `family` conserva el trazo del tema si la familia no cambió, y
   * cae al de la nueva familia si cambió — un trazo de 0.8 no significa nada en
   * `material`, que no dibuja con trazo.
   */
  icons?: { family?: "material" | "lucide"; strokeWidth?: number };
  /**
   * El grosor de la LÍNEA con la que el tema dibuja bordes y separadores.
   *
   * Es un primitivo (`stroke.outline`) y el sistema de diseño lo declara desde
   * siempre; no era pedible. El anillo de foco NO entra acá: tiene su propia
   * clave (`focus.width`) porque su umbral es de accesibilidad y no de estilo.
   */
  stroke?: { outline?: number };
  /**
   * El peso de la letra de un BOTÓN.
   *
   * Los temas del corpus lo mueven entre 400 y 700, y era lo único de su
   * vocabulario tipográfico que llegaba al tema sin poder pedirse aparte del
   * tema entero.
   */
  weight?: { button?: number };
  /**
   * Con qué modo abre el sistema cuando el usuario todavía no eligió.
   * Sale de acá y no de dos constantes sueltas del cliente: el valor inicial
   * del store y el default del perfil TIENEN que decir lo mismo, y cuando
   * viven separados uno se cambia y el otro no.
   */
  defaultMode?: Mode;
  /**
   * Emite el banco de diseño. Es una herramienta de autoría, no una función del
   * producto: un proyecto que no la pide no la recibe. Aun encendida, el panel
   * solo aparece para SysAdmin.
   */
  lab?: boolean;
  /**
   * La identidad visible: el logo y los colores de la pantalla de entrada.
   *
   * `dir` es un directorio del propio repo `.haiku` que el generador copia a
   * `public/`. Los assets viven ahí y no en `static-files/` del generador
   * porque son identidad del proyecto: en `static-files` se los pisaría en cada
   * corrida, y editándolos dentro del código generado chocan en cada merge —
   * que es exactamente lo que venía pasando.
   */
  brand?: {
    dir?: string;
    /** Archivo dentro de `dir`, servido desde la raíz. */
    logo?: string;
    /** El fondo de la pantalla de entrada. Ausente ⇒ el fondo de página. */
    loginBackground?: Hex;
    /** El color de los enlaces de esa pantalla. Ausente ⇒ el principal. */
    loginLink?: Hex;
    /**
     * `false`: las páginas públicas (la verificación de email y la validación de
     * datos) van sin tarjeta, con el contenido directamente sobre
     * `loginBackground` y un tema propio para ese fondo, que se mide como el
     * resto (pares `publicFrame.*`, ver `design/publicFrame.ts`). Exige
     * `loginBackground`. Ausente ⇒ la tarjeta sobre el color de marca, como
     * siempre.
     */
    publicCard?: boolean;
  };
  /**
   * Un segundo tema que solo ve una audiencia acotada.
   *
   * Es cómo se despliega un rediseño sin cambiarle la cara a todos de golpe:
   * el equipo lo acomoda contra datos y pantallas de producción mientras el
   * resto de los clientes sigue viendo lo de siempre. Ausente ⇒ todos ven lo
   * mismo, que es el comportamiento normal.
   *
   * Solo alcanza a la aplicación web. Los correos y la portada se generan una
   * vez y no saben quién los va a mirar, así que siguen el tema oficial — si no
   * fuera así, el equipo veria una aplicación y recibiría correos de la otra.
   */
  preview?: Omit<HaikuThemeConfig, "preview" | "lab" | "defaultMode"> & {
    audience?: ThemeAudience;
  };
  contrast?: {
    level?: ContrastLevel;
    onFailure?: "error" | "warn";
    exceptions?: ContrastException[];
  };
  /** Overrides puntuales, por modo. Escapatoria, no la vía principal. */
  light?: DeepPartial<SemanticSet>;
  dark?: DeepPartial<SemanticSet>;
  /**
   * Overrides de los niveles 1 y 3.
   *
   * Existen para que TODO lo que el banco de diseño permite ajustar se pueda
   * llevar al proyecto. Un editor que deja cambiar la altura de línea y una
   * configuración que no sabe expresarla producen exactamente el peor
   * resultado: alguien decide algo que después no hay cómo aplicar.
   */
  primitives?: DeepPartial<Primitives>;
  components?: DeepPartial<ComponentTokens>;
}

/**
 * Quién ve el tema en pruebas. Las condiciones se suman: alcanza con cumplir
 * una. Vacío no significa "todos" sino "nadie" — un tema en pruebas sin
 * audiencia declarada es un error de configuración, no una invitación abierta.
 */
export interface ThemeAudience {
  roles?: string[];
  /** El tenant dueño del sistema, el de `systemOwner` en la configuración. */
  systemOwner?: boolean;
  /** Nombres de tenant, además del dueño. */
  tenants?: string[];
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// ──────────────────────────────────────────────────────────── Lo que sale

/**
 * La vista del correo. No es otra paleta: son los mismos tokens con las
 * restricciones del medio aplicadas (hex de 6 dígitos, sin sombras, tipografía
 * de sistema). Modo oscuro no lleva: ningún cliente de correo lo soporta de
 * forma fiable, y fingir que sí produce correos ilegibles.
 */
export interface EmailView {
  fontFamily: string;
  colors: Record<string, Hex>;
}

export type Mode = "light" | "dark";

export interface ResolvedTheme {
  preset: string;
  defaultMode: Mode;
  lab: boolean;
  brand: {
    dir: string;
    logo: string;
    loginBackground: string | null;
    loginLink: string | null;
  };
  primitives: Primitives;
  light: SemanticSet;
  dark: SemanticSet;
  components: ComponentTokens;
  email: EmailView;
  iconFamily: "material" | "lucide";
  /**
   * El snapshot de roles del que salió este tema, si salió de uno.
   *
   * Viaja hasta el cliente porque las seis capas de contraste son más de lo que
   * el `SemanticSet` distingue: emitirlas deja que la galería muestre el sistema
   * completo y que un componente futuro pida una capa sin tener que regenerar el
   * vocabulario. Ausente en los presets que no vienen de Matu — no se inventa.
   */
  matu?: MatuResolved;
  /** El segundo tema y su audiencia, si el proyecto declaró uno. */
  preview?: {
    /**
     * El preset del que salió ESTE tema, que no tiene por qué ser el del
     * oficial. La galería lo nombra en pantalla: sin él tendría que nombrar el
     * del oficial, que es justo el dato que no corresponde a lo que se está
     * viendo.
     */
    preset: string;
    light: SemanticSet;
    dark: SemanticSet;
    primitives: Primitives;
    components: ComponentTokens;
    /** Las capas de este tema, con el mismo sentido que `matu` de arriba. */
    matu?: MatuResolved;
    audience: ThemeAudience;
  };
}

/**
 * Un preset entrega los dos conjuntos ya resueltos. Cómo los obtuvo —literales
 * transcritos, o derivados de semillas— es asunto suyo: `legacy` los declara a
 * mano para poder reproducir la pantalla actual exactamente, y los demás los
 * derivan. `resolveTheme` no necesita saber cuál es cuál.
 */
export interface Preset {
  name: string;
  primitives: Primitives;
  light: SemanticSet;
  dark: SemanticSet;
  components: ComponentTokens;
  /**
   * Las opciones con las que se derivó, si se derivó. Es lo que permite que un
   * proyecto cambie las semillas y el preset se reconstruya entero en vez de
   * quedar con un color nuevo y las escalas viejas. Los presets literales
   * —`legacy`— no lo tienen, y por eso no admiten semillas.
   */
  derivedFrom?: unknown;
  /** El snapshot Matu del que se adaptó, si vino de uno. Ver `ResolvedTheme.matu`. */
  matu?: MatuResolved;
  /**
   * Excepciones de contraste que trae el preset mismo, con la misma forma que
   * `theme.contrast.exceptions`. Existen para un preset como `legacy`, que
   * transcribe una paleta anterior al gate y no se puede corregir sin cambiar
   * la cara de producción — ver el comentario de cabecera de `presets/legacy.ts`.
   * La deuda es del preset, no de cada proyecto que lo usa: declararla acá
   * evita que todos repitan las mismas 15 excepciones con un motivo que no es
   * suyo. `resolveTheme` las fusiona con las que declare `theme.contrast.exceptions`.
   * Ausente ⇒ el preset no tiene deuda propia — los presets nuevos no declaran
   * ninguna, y sus fallas de contraste siguen avisando.
   */
  contrastExceptions?: ContrastException[];
}
