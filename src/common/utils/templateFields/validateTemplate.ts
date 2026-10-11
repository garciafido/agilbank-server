import * as nunjucks from "nunjucks";
import { createEnvironment } from "./environment";
import {
  BUILTIN_FORMAT_FILTERS,
  type TemplateCatalog,
  type TemplateWarning,
} from "./types";

/*
 * Partes internas de nunjucks 3.2.4 (parser, nodos, compilador, runtime). No
 * tienen tipos publicados y cambian entre versiones: por eso el package.json
 * fija la versión exacta. Estas interfaces describen solo lo que se usa.
 */
export interface NjkNode {
  readonly typename: string;
  readonly fields: readonly string[];
  lineno: number;
  colno: number;
}
export interface NjkNodeList extends NjkNode {
  children: NjkNode[];
}
export interface NjkValue extends NjkNode {
  value: unknown;
}
export interface NjkLookupVal extends NjkNode {
  target: NjkNode;
  val: NjkNode;
}
export interface NjkFunCall extends NjkNode {
  name: NjkNode;
  args: NjkNodeList;
}
export interface NjkPair extends NjkNode {
  key: NjkNode;
  value: NjkNode;
}
export interface NjkIf extends NjkNode {
  cond: NjkNode;
  body: NjkNode;
  else_: NjkNode | null;
}
export interface NjkFor extends NjkNode {
  arr: NjkNode;
  name: NjkNode;
  body: NjkNodeList;
  else_: NjkNode | null;
}
export interface NjkSet extends NjkNode {
  targets: NjkNode[];
  value: NjkNode | null;
  body?: NjkNode | null;
}

type NjkNodeConstructor = new (
  lineno: number,
  colno: number,
  ...fields: unknown[]
) => NjkNode;

export interface NjkEnvironment {
  opts: { autoescape: boolean; throwOnUndefined: boolean };
  extensionsList: unknown[];
  asyncFilters: string[];
  addGlobal(name: string, value: unknown): unknown;
}

export interface NunjucksInternals {
  parser: {
    parse(src: string, extensions: unknown[], opts: object): NjkNodeList;
  };
  nodes: Record<
    | "Symbol"
    | "Literal"
    | "LookupVal"
    | "FunCall"
    | "NodeList"
    | "Array"
    | "Output",
    NjkNodeConstructor
  >;
  compiler: {
    Compiler: new (
      templateName: string | undefined,
      throwOnUndefined: boolean
    ) => { compile(ast: NjkNode): void; getCode(): string };
  };
  runtime: {
    suppressValue(value: unknown, autoescape: boolean): unknown;
    markSafe(value: string): unknown;
  };
  Template: new (
    src: { type: "code"; obj: unknown },
    env: unknown,
    path: string | undefined
  ) => { render(context: object): string };
}

export const njk = nunjucks as unknown as NunjucksInternals;

/** Parsea el contenido de una plantilla con las opciones de su entorno. */
export function parseTemplate(
  content: string,
  env: NjkEnvironment
): NjkNodeList {
  return njk.parser.parse(content, env.extensionsList, env.opts);
}

/** Filtros que no cambian la clave: los predefinidos y los del catálogo. */
export function formatFilterNames(catalog?: TemplateCatalog): Set<string> {
  return new Set([
    ...BUILTIN_FORMAT_FILTERS,
    ...Object.keys(catalog?.filters ?? {}),
  ]);
}

export function catalogFunctionNames(catalog?: TemplateCatalog): Set<string> {
  return new Set(Object.keys(catalog?.functions ?? {}));
}

/** Qué forma tiene una salida `{{ }}`. */
export type OutputForm =
  | { kind: "path"; base: NjkNode }
  | { kind: "function"; name: string; call: NjkFunCall }
  | { kind: "literal" }
  | { kind: "violation"; reason: string };

const ARITHMETIC = new Set([
  "Add",
  "Sub",
  "Mul",
  "Div",
  "FloorDiv",
  "Mod",
  "Pow",
  "Neg",
  "Pos",
]);

/** Literal, o camino (`a.b[0]`, `a[i]`): lo único que va como argumento. */
function isOperand(node: NjkNode): boolean {
  if (node.typename === "Literal") return true;
  if (node.typename === "KeywordArgs") {
    return (node as NjkNodeList).children.every((pair) =>
      isOperand((pair as NjkPair).value)
    );
  }
  return isPath(node);
}

/**
 * `nombre` o una cadena de accesos (`a.b`, `a[0]`, `a[i]`) que empieza en un nombre.
 *
 * Límite conocido: un `.length` al final también pasa (`{{ works.length }}`
 * da la clave `works.length`), aunque las cuentas deberían ir por una función
 * del catálogo; arreglarlo es rechazar un acceso final a `length`.
 */
function isPath(node: NjkNode): boolean {
  if (node.typename === "Symbol") return true;
  if (node.typename !== "LookupVal") return false;
  const lookup = node as NjkLookupVal;
  return isOperand(lookup.val) && isPath(lookup.target);
}

function forbiddenExpression(node: NjkNode): string {
  if (ARITHMETIC.has(node.typename)) return "aritmética en {{ }}";
  if (node.typename === "Concat") return "operador ~ en {{ }}";
  if (node.typename === "InlineIf") return "if en línea en {{ }}";
  if (node.typename === "FunCall") {
    const callee = (node as NjkFunCall).name;
    if (callee.typename === "LookupVal") {
      const method = (callee as NjkLookupVal).val;
      const name =
        method.typename === "Literal"
          ? String((method as NjkValue).value)
          : "?";
      return `método JS en {{ }}: .${name}()`;
    }
    if (callee.typename === "Symbol") {
      return `llamada fuera del catálogo en {{ }}: ${String((callee as NjkValue).value)}()`;
    }
  }
  return `expresión no permitida en {{ }}: ${node.typename}`;
}

/**
 * Clasifica una salida: camino de datos, función del catálogo o literal, cada
 * uno con filtros de formato encima. Cualquier otra cosa es una violación.
 */
export function classifyOutput(
  expr: NjkNode,
  formatFilters: ReadonlySet<string>,
  functions: ReadonlySet<string>
): OutputForm {
  let node = expr;
  while (node.typename === "Filter") {
    const filter = node as NjkFunCall;
    const name = String((filter.name as NjkValue).value);
    if (!formatFilters.has(name)) {
      return {
        kind: "violation",
        reason: `filtro no permitido en {{ }}: ${name}`,
      };
    }
    const [input, ...args] = filter.args.children;
    if (!args.every(isOperand)) {
      return {
        kind: "violation",
        reason: `argumento no permitido en | ${name}`,
      };
    }
    node = input;
  }
  if (node.typename === "Literal") return { kind: "literal" };
  if (isPath(node)) return { kind: "path", base: node };
  if (node.typename === "FunCall") {
    const call = node as NjkFunCall;
    const name =
      call.name.typename === "Symbol"
        ? String((call.name as NjkValue).value)
        : "";
    if (functions.has(name)) {
      return call.args.children.every(isOperand)
        ? { kind: "function", name, call }
        : { kind: "violation", reason: `argumento no permitido en ${name}()` };
    }
  }
  return { kind: "violation", reason: forbiddenExpression(node) };
}

const FORBIDDEN_TAGS: Record<string, string> = {
  Macro: "macro",
  Import: "import",
  FromImport: "from",
  Include: "include",
  Extends: "extends",
  Block: "block",
  Switch: "switch",
  IfAsync: "ifAsync",
  AsyncEach: "asyncEach",
  AsyncAll: "asyncAll",
  CallExtension: "extensión",
  CallExtensionAsync: "extensión",
};

/** `{% call %}` se parsea como una salida con un `caller` en los argumentos. */
function isCallBlock(node: NjkNode): boolean {
  if (node.typename !== "FunCall") return false;
  const args = (node as NjkFunCall).args.children;
  const last = args[args.length - 1];
  return (
    last !== undefined &&
    last.typename === "KeywordArgs" &&
    (last as NjkNodeList).children.some(
      (pair) => (pair as NjkPair).value.typename === "Caller"
    )
  );
}

/** `{% filter %}` se parsea como una salida con un filtro sobre un bloque capturado. */
function isFilterBlock(node: NjkNode): boolean {
  return (
    node.typename === "Filter" &&
    (node as NjkFunCall).args.children[0]?.typename === "Capture"
  );
}

/**
 * Violaciones de forma de una plantilla (sin front-matter), con su línea.
 *
 * - En `{{ }}`: camino de datos, función del catálogo o literal, con filtros de
 *   formato encima. Se valida en cualquier posición, también en atributos.
 * - Etiquetas: `for`, `if/elif/else`, `set` en línea, `raw` y comentarios.
 * - Lo que va en condiciones, en `set` y en la lista de un `for` es libre.
 * - Un error de sintaxis vuelve como una violación.
 */
export function validateTemplate(
  template: string,
  catalog?: TemplateCatalog
): TemplateWarning[] {
  const env = createEnvironment(catalog) as unknown as NjkEnvironment;
  let ast: NjkNodeList;
  try {
    ast = parseTemplate(template, env);
  } catch (error) {
    const lineno = (error as { lineno?: number }).lineno;
    const message = error instanceof Error ? error.message : String(error);
    return [{ line: lineno ?? 1, reason: `error de sintaxis: ${message}` }];
  }

  const formatFilters = formatFilterNames(catalog);
  const functions = catalogFunctionNames(catalog);
  const warnings: TemplateWarning[] = [];
  const report = (node: NjkNode, reason: string) =>
    warnings.push({ line: node.lineno + 1, reason });

  const visit = (node: NjkNode): void => {
    switch (node.typename) {
      case "Root":
      case "NodeList":
        (node as NjkNodeList).children.forEach(visit);
        return;
      case "Output":
        for (const child of (node as NjkNodeList).children) {
          if (child.typename === "TemplateData") continue;
          if (isCallBlock(child)) {
            report(child, "etiqueta no permitida: {% call %}");
          } else if (isFilterBlock(child)) {
            report(child, "etiqueta no permitida: {% filter %}");
          } else {
            const form = classifyOutput(child, formatFilters, functions);
            if (form.kind === "violation") report(child, form.reason);
          }
        }
        return;
      case "If": {
        const branch = node as NjkIf;
        visit(branch.body);
        if (branch.else_) visit(branch.else_);
        return;
      }
      case "For": {
        const loop = node as NjkFor;
        visit(loop.body);
        if (loop.else_) visit(loop.else_);
        return;
      }
      case "Set":
        if ((node as NjkSet).body)
          report(node, "etiqueta no permitida: {% set %} de bloque");
        return;
      default:
        report(
          node,
          `etiqueta no permitida: {% ${FORBIDDEN_TAGS[node.typename] ?? node.typename} %}`
        );
    }
  };

  visit(ast);
  return warnings;
}
