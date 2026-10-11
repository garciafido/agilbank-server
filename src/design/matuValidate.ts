/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Validación estructural del snapshot resuelto.
 *
 * Hecho a mano, sin ajv: así no entra una dependencia pesada al kit del cliente,
 * y las reglas —que son pocas y estables— quedan legibles y mutables una por una.
 * El JSON Schema committeado (para interop con Matu/Figma) describe la MISMA
 * forma; este validador es su contraparte ejecutable.
 *
 * Comprueba lo que un tema tiene que cumplir para ser aplicable: las 6 capas de
 * contraste completas en ambos modos, cada rol un hex opaco válido, sin alias
 * sin resolver, los estados en rango, y la rampa presente. Un tema que no lo
 * cumple NO se guarda: es un cache corrupto, no un tema.
 */

import { ContrastModeName, RoleName, STATUS_NAMES } from "./matuAuthoring";
import { MatuResolved, ResolvedMode } from "./matuSnapshot";

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export const CONTRAST_MODES: ContrastModeName[] = [
  "Canvas High",
  "Canvas Low",
  "Mantle High",
  "Mantle Low",
  "Solid",
  "Highest",
];

export const ROLES: RoleName[] = [
  "Canvas",
  "Content",
  "Main",
  "On_Main",
  "Surface",
  "On_Surface",
  "Mantle",
  "Border",
  "Content_Low",
  "Focus",
];

const STATES = ["hover", "selected", "active", "disable"] as const;

const TYPE_ROLES = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "body1",
  "body2",
  "button",
] as const;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function checkMode(
  label: string,
  mode: ResolvedMode | undefined,
  errors: string[]
): void {
  if (!mode || !mode.contrast) {
    errors.push(`Falta el modo "${label}".`);
    return;
  }
  for (const cmode of CONTRAST_MODES) {
    const roles = mode.contrast[cmode];
    if (!roles) {
      errors.push(`${label}: falta la capa de contraste "${cmode}".`);
      continue;
    }
    for (const role of ROLES) {
      const hex = roles[role];
      if (hex === undefined) {
        errors.push(`${label}.${cmode}: falta el rol "${role}".`);
      } else if (!HEX6.test(hex)) {
        errors.push(
          `${label}.${cmode}.${role}: "${hex}" no es un hex opaco de 6 dígitos (¿alias sin resolver?).`
        );
      }
    }
  }
}

export function validateResolved(r: MatuResolved): ValidationResult {
  const errors: string[] = [];

  checkMode("light", r.light, errors);
  checkMode("dark", r.dark, errors);

  // Los estados pasan por la MISMA regla, sin excepciones: es lo que compra la
  // simetría del snapshot. Un estado a medio resolver es tan inaplicable como
  // una marca a medio resolver.
  for (const name of STATUS_NAMES) {
    const st = r.status?.[name];
    if (!st) {
      errors.push(`Falta el esquema de estado "${name}".`);
      continue;
    }
    checkMode(`${name}.light`, st.light, errors);
    checkMode(`${name}.dark`, st.dark, errors);
  }

  for (const role of TYPE_ROLES) {
    if (!r.typography || !r.typography[role])
      errors.push(`Falta el nivel tipográfico "${role}".`);
  }

  for (const st of STATES) {
    const v = r.states?.[st];
    if (v === undefined) errors.push(`Falta el estado de opacidad "${st}".`);
    else if (v < 0 || v > 1)
      errors.push(`El estado "${st}" (${v}) está fuera de 0..1.`);
  }

  if (!r.primitives || Object.keys(r.primitives.radius ?? {}).length === 0) {
    errors.push("Faltan los primitivos de radio.");
  }
  if (!Array.isArray(r.shadows) || r.shadows.length < 25) {
    errors.push(
      "La escalera de sombras no tiene las 25 entradas que MUI espera."
    );
  }

  return { ok: errors.length === 0, errors };
}
