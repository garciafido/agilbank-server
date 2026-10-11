/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Conversiones sRGB ↔ OKLab ↔ OKLCH.
 *
 * Se implementan acá en vez de tomar una dependencia porque son ~100 líneas de
 * matemática cerrada y, como funciones puras, entran en la lista de mutación de
 * `stryker.conf.json` — que es donde este repo pone la lógica que no puede
 * fallar en silencio.
 *
 * OKLab y no HSL: en HSL, dos colores con la misma `L` se perciben con brillos
 * muy distintos según el tono (un amarillo al 50% se ve mucho más claro que un
 * azul al 50%). Una escala derivada en HSL produce pasos que no son parejos, y
 * el modo oscuro construido sobre ella queda desbalanceado. En OKLab la
 * lightness sí corresponde a lo que el ojo percibe.
 */

export type Hex = string;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function parseHex(hex: Hex): Rgb {
  const raw = hex.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Color inválido: "${hex}". Se espera #RGB o #RRGGBB.`);
  }

  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

export function toHex({ r, g, b }: Rgb): Hex {
  const channel = (x: number) =>
    Math.round(clamp01(x) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** sRGB con gamma → lineal. */
const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/** Lineal → sRGB con gamma. */
const toGamma = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

export function rgbToOklch(rgb: Rgb): Oklch {
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  const lCone = Math.cbrt(
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  );
  const mCone = Math.cbrt(
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  );
  const sCone = Math.cbrt(
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  );

  const l = 0.2104542553 * lCone + 0.793617785 * mCone - 0.0040720468 * sCone;
  const a = 1.9779984951 * lCone - 2.428592205 * mCone + 0.4505937099 * sCone;
  const bb = 0.0259040371 * lCone + 0.7827717662 * mCone - 0.808675766 * sCone;

  const c = Math.sqrt(a * a + bb * bb);
  // Un color acromático no tiene tono: devolver 0 y no el ángulo que salga del
  // ruido de punto flotante, porque ese ángulo después tiñe toda la escala.
  const h = c < 1e-6 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;

  return { l, c, h };
}

export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const lCone = Math.pow(l + 0.3963377774 * a + 0.2158037573 * b, 3);
  const mCone = Math.pow(l - 0.1055613458 * a - 0.0638541728 * b, 3);
  const sCone = Math.pow(l - 0.0894841775 * a - 1.291485548 * b, 3);

  return {
    r: toGamma(
      4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone
    ),
    g: toGamma(
      -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone
    ),
    b: toGamma(
      -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone
    ),
  };
}

/**
 * Baja la croma hasta que el color entra en el gamut sRGB, conservando
 * lightness y tono. Sin esto, un `oklch` fuera de gamut se recorta canal por
 * canal y el resultado cambia de tono — un azul saturado vira a violeta.
 */
export function toGamutHex(target: Oklch): Hex {
  const inGamut = (rgb: Rgb) =>
    rgb.r >= -1e-4 &&
    rgb.r <= 1 + 1e-4 &&
    rgb.g >= -1e-4 &&
    rgb.g <= 1 + 1e-4 &&
    rgb.b >= -1e-4 &&
    rgb.b <= 1 + 1e-4;

  if (inGamut(oklchToRgb(target))) return toHex(oklchToRgb(target));

  let lo = 0;
  let hi = target.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgb({ ...target, c: mid }))) lo = mid;
    else hi = mid;
  }
  return toHex(oklchToRgb({ ...target, c: lo }));
}

export const hexToOklch = (hex: Hex): Oklch => rgbToOklch(parseHex(hex));

const OKLCH_RE =
  /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i;

/**
 * Lee la notación CSS `oklch(L C H)`. Existe porque los sistemas de diseño
 * actuales —shadcn entre ellos— publican sus temas así, y convertirlo en el
 * borde permite que todo lo de adentro siga trabajando con un solo formato.
 *
 * `L` admite fracción (`0.985`) o porcentaje (`98.5%`); `C` en porcentaje se
 * interpreta sobre 0.4, que es la referencia que usa la especificación CSS.
 */
export function parseOklch(css: string): Oklch & { alpha: number } {
  const m = OKLCH_RE.exec(css.trim());
  if (!m) throw new Error(`No es un color oklch() válido: "${css}".`);

  const pct = (raw: string, full: number) =>
    raw.endsWith("%") ? (parseFloat(raw) / 100) * full : parseFloat(raw);

  return {
    l: pct(m[1], 1),
    c: pct(m[2], 0.4),
    h: parseFloat(m[3]),
    alpha: m[4] === undefined ? 1 : pct(m[4], 1),
  };
}

/** Mezcla `fg` con opacidad `alpha` sobre el fondo `bg`. */
export function compositeOver(fg: Hex, bg: Hex, alpha: number): Hex {
  if (alpha >= 1) return toHex(parseHex(fg));
  const f = parseHex(fg);
  const b = parseHex(bg);
  return toHex({
    r: f.r * alpha + b.r * (1 - alpha),
    g: f.g * alpha + b.g * (1 - alpha),
    b: f.b * alpha + b.b * (1 - alpha),
  });
}

/**
 * Acepta `#RGB`, `#RRGGBB` u `oklch(...)` —con o sin alfa— y devuelve hex
 * opaco. El `backdrop` es sobre qué se aplana la transparencia: los temas de
 * shadcn declaran sus bordes de modo oscuro como blanco al 10%, y sin aplanar
 * contra el fondo real un borde sutil se convertiría en una línea blanca.
 */
export function parseCssColor(css: string, backdrop: Hex = "#FFFFFF"): Hex {
  const value = css.trim();
  if (!/^oklch\(/i.test(value)) return toHex(parseHex(value));

  const { alpha, ...oklch } = parseOklch(value);
  return compositeOver(toGamutHex(oklch), backdrop, alpha);
}
