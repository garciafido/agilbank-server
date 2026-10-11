/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * El snapshot RESUELTO de un tema Matu: la "respuesta" (en el sentido de
 * `tokens` vs `themeConfig`). Sin alias, sin modos por elegir — todo aplanado a
 * valores que el navegador consume directo.
 *
 * Es lo que se GUARDA junto a la autoría (decisión #8) y lo que se valida. Como
 * es un cache de un cómputo que el generador es dueño, cuando el resolver mejore
 * se re-deriva desde la autoría; por eso puede ser rico sin miedo a que envejezca
 * en silencio.
 *
 * Reusa `Motion`/`Layers`/`FocusRing`/`TypographyScale` de `../types`: el modelo
 * interno ya modela esas capas mejor que el export de Matu, así que el gap-fill
 * cae en tipos existentes en vez de duplicarlos.
 */

import {
  ContentContrast,
  ContrastModeName,
  MatuStateName,
  RoleName,
  SolidChrome,
  StatusName,
  SurfaceStair,
} from "./matuAuthoring";
import { Hex } from "./color";
import { FocusRing, Layers, Motion, TypographyScale } from "./types";

/** Los diez roles de una capa de contraste, ya resueltos a hex opaco. */
export type ResolvedRoles = Record<RoleName, Hex>;

/**
 * La escala de un esquema —`Color_0` (claro) .. `Color_1000` (oscuro)—, ya
 * resuelta a hex opaco. Es de donde salen las capas de contraste: cada capa
 * toma escalones de acá y les da un rol.
 *
 * El nombre de cada escalón se conserva tal cual: son trece y se llaman
 * `Color_N`, no once índices numéricos como los de un preset derivado.
 * Renombrarlos para que entren en el molde del otro sería inventar una
 * correspondencia que no existe.
 */
export type ResolvedScale = Record<string, Hex>;

/** Un modo (light o dark) resuelto: las seis capas de contraste, cada una completa. */
export interface ResolvedMode {
  contrast: Record<ContrastModeName, ResolvedRoles>;
}

/** Primitivos resueltos a números (px salvo donde se indique). */
export interface ResolvedPrimitives {
  radius: Record<string, number>;
  spacing: Record<string, number>;
  fontSize: Record<string, number>;
  /** Ratios unitless (0.9 = 90%). */
  lineHeight: Record<string, number>;
  fontWeight: Record<string, number>;
  /** Escala base 0..1. */
  opacity: Record<string, number>;
}

/** La capa de alias de Themes, aplanada a valores. */
export interface ResolvedAliases {
  fontFamily: Record<string, string>;
  radius: Record<string, number>;
  stroke: Record<string, number>;
  opacity: Record<string, number>;
  weight: Record<string, number>;
  width: Record<string, number>;
  height: Record<string, number>;
  icons: { family: string; strokeWidth: number };
}

export interface MatuResolved {
  /**
   * De qué combinación del corpus salió: una marca por un tema. Viaja con el
   * snapshot porque un tema que no sabe decir cuál de las ~30 combinaciones es
   * solo se puede nombrar "matu", y eso es justo lo que no distingue una de otra
   * en pantalla.
   *
   * Ausente en un snapshot que no vino del corpus (uno armado a mano en un test).
   *
   * `brand` presente significa que la marca es PROPIA del proyecto y no una de
   * las del corpus: `colorScheme` la nombra como tal, y acá viaja la semilla de
   * la que se derivó.
   *
   * `accent` viaja tal como se declaró —un nombre del corpus o una semilla—
   * porque las dos formas se leen igual de bien en pantalla y el `#` ya dice
   * cuál es cuál. Ausente ⇒ el acento sigue al esquema de superficies.
   *
   * `surfaces` es la DIRECCIÓN de la escalera de superficies. No trae capas
   * propias —las seis ya están en `light`/`dark`—: dice de cuál de ellas lee el
   * adaptador, y por eso viaja acá y no como un bloque resuelto aparte. Ausente
   * ⇒ la dirección de siempre.
   */
  selection?: {
    colorScheme: string;
    brand?: Hex;
    theme: string;
    surfaces?: SurfaceStair;
    contentContrast?: ContentContrast;
    solidChrome?: SolidChrome;
  };
  /**
   * La escala del esquema que pinta las superficies, resuelta.
   *
   * Viaja porque es un DATO del tema que nada aguas abajo puede reconstruir: el
   * resolver la consume para derivar las seis capas y hasta acá la descartaba,
   * con lo que el sistema entero terminaba sin poder decir de qué escala salió
   * lo que muestra. Que las capas se puedan mirar no la reemplaza — una capa es
   * una elección de escalones, no la escala.
   */
  baseColors: ResolvedScale;
  primitives: ResolvedPrimitives;
  aliases: ResolvedAliases;
  /** Rampa tipográfica compuesta (h1..button) desde las escalas crudas — gap-fill de `ramp.ts`. */
  typography: TypographyScale;
  /** Overlays de estado, 0..1: hover/selected/active/disable. */
  states: Record<MatuStateName, number>;
  /** Sombras resueltas a CSS `box-shadow`, por nombre (Shadow 1.., Hover, Active). */
  effects: Record<string, string>;
  /** Gap-fill originado en `doctrine.ts` (Matu no lo expresa). */
  motion: Motion;
  layers: Layers;
  focus: FocusRing;
  /** Escalera de 25 entradas que MUI espera, derivada del gap-fill de elevación. */
  shadows: string[];
  light: ResolvedMode;
  dark: ResolvedMode;
  /**
   * Los estados, resueltos por el MISMO camino que la marca: las seis capas,
   * los diez roles, los dos modos. La simetría no es prolijidad — es lo que
   * permite que `validate` les aplique una sola regla y que un componente que
   * mañana pida otra capa de un estado la encuentre sin volver a tocar la
   * tubería.
   */
  status: Record<StatusName, { light: ResolvedMode; dark: ResolvedMode }>;
}
