// El contrato de los jueces de cuentas: qué recibe un juez y qué devuelve. Lo comparten AgilPost y
// AgilBank; cada producto arma su Lectura y declara sus jueces. Ver la spec del juez común.

export type Verdict = "verified" | "grounded" | "weak" | "abstained" | "unavailable";

export interface Origen {
  camino: string;
  pagina?: number;
  caja?: { x: number; y: number; w: number; h: number };
}

export type Valor =
  | { tipo: "centavos"; valor: number; moneda: string }
  | { tipo: "texto"; valor: string }
  | { tipo: "fecha"; valor: string };

export interface Candidato { valor: Valor; veredicto: Verdict; confianza?: number; origen: Origen }

export interface Campo {
  id: string;
  valor: Valor | null;
  veredicto: Verdict;
  confianza?: number;
  origen?: Origen;
  candidatos?: Candidato[];
  derivadaDe?: string[];
}

export interface ListaAlternativa { elementos: Campo[]; veredicto: Verdict; origen: Origen }

export interface CampoDeLista {
  id: string;
  elementos: Campo[];
  alternativas?: ListaAlternativa[];
}

export interface Lectura { campos: Campo[]; listas: CampoDeLista[] }

export type Informado<T> = { informa: true; valor: T } | { informa: false };

export type Faltante = { campo: string } | { elementoDe: string };

export type Estado = "cierra" | "cierra-por-construccion" | "no-cierra" | "no-se-puede-juzgar";

/** Lo que devuelve un juez. El coordinador le agrega `juez` y `parteMasDebil`. */
export interface ControlDelJuez {
  id: string;
  estado: Estado;
  residuo: number | null;
  partes: string[];
  faltan: Faltante[];
  sospechosos: Informado<string[]>;
  posicion: Informado<{ pagina?: number; renglon?: string }>;
  veredicto: Verdict;
  motivo: string;
}

export interface Control extends ControlDelJuez {
  juez: string;
  parteMasDebil: Verdict;
}

export interface Propuesta {
  campo: string;
  valor: Valor;
  controles: string[];
  derivadaDe: string[];
  origen?: Origen;
  veredicto: Verdict;
  motivo: string;
}

export interface TopeDeBusqueda { candidatosPorCampo: number; camposConCandidatos: number; combinaciones: number; alternativasDeLista: number }

export interface ResultadoDePropuesta { propuestas: Propuesta[]; ambiguas: Propuesta[]; truncada: boolean }

export interface Juez {
  id: string;
  version: string;
  juzgar(lectura: Lectura): ControlDelJuez[];
  proponer?(lectura: Lectura, tope: TopeDeBusqueda): ResultadoDePropuesta;
}

export interface Declaracion {
  jueces: Juez[];
  despeja: ReadonlySet<string>;
  tope: TopeDeBusqueda;
  estricto?: boolean;
}

export interface Dictamen {
  version: { modulo: string; jueces: Record<string, string> };
  controles: Control[];
  sospechososPorInterseccion: string[];
  /** `alternativa` es el índice en la entrada (`CampoDeLista.alternativas`). */
  porAlternativa: Array<{ lista: string; alternativa: number; controles: Control[] }>;
  propuestas: Propuesta[];
  ambiguas: Propuesta[];
  truncada: boolean;
}

/**
 * El dictamen como se guarda junto a cada lectura: completos los controles que no son `cierra`, y de los que
 * cierran solo cuántos hay por juez. Lo que cierra no dice dónde mirar; guardarlo entero multiplica la fila.
 */
export interface DictamenResumido {
  version: Dictamen["version"];
  controles: Control[];
  cierran: Record<string, number>;
  sospechososPorInterseccion: string[];
  porAlternativa: Array<{ lista: string; alternativa: number; controles: Control[]; cierran: Record<string, number> }>;
  propuestas: Propuesta[];
  ambiguas: Propuesta[];
  truncada: boolean;
}

/** Los topes por defecto. Se ajustan con la medición del sub-proyecto 3. */
export const TOPE_POR_DEFECTO: TopeDeBusqueda = { candidatosPorCampo: 5, camposConCandidatos: 3, combinaciones: 125, alternativasDeLista: 4 };
