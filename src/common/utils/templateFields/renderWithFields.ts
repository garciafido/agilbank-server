import matter from "gray-matter";
import { createEnvironment } from "./environment";
import { buildPathIndex } from "./pathIndex";
import type { TemplateCatalog, TemplateWarning } from "./types";
import {
  catalogFunctionNames,
  classifyOutput,
  formatFilterNames,
  njk,
  parseTemplate,
  validateTemplate,
  type NjkEnvironment,
  type NjkFor,
  type NjkIf,
  type NjkLookupVal,
  type NjkNode,
  type NjkNodeList,
  type NjkValue,
  type OutputForm,
} from "./validateTemplate";

// Parte interna de nunjucks 3.2.4 (versión fijada): sin async no cambia el árbol.
const transformer: {
  transform(ast: NjkNode, asyncFilters: string[]): NjkNode;
} = require("nunjucks/src/transformer");

/** Funciones internas que la reescritura inserta en la plantilla. */
const FIELD = "__tplField";
const FIELD_CALL = "__tplFieldCall";
const LOOP = "__tplLoop";
const LOOP_INDEX = "__tplLoopIndex";

/**
 * Elementos cuyo contenido es texto crudo para Chromium (con scripts
 * habilitados, como en la conversión): un comentario ahí no es un comentario y
 * una marca se imprimiría como texto. `textarea` y `title` no los nombra la
 * spec, pero es el mismo caso. `plaintext` no cierra nunca: todo lo que sigue
 * es texto.
 */
const RAW_TEXT_ELEMENTS = new Set([
  "style",
  "script",
  "title",
  "textarea",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "plaintext",
]);

type ScanState =
  | "data"
  | "tagOpen"
  | "endTagOpen"
  | "tagName"
  | "inTag"
  | "doubleQuoted"
  | "singleQuoted"
  | "markup"
  | "comment"
  | "bogus"
  | "rawText";

/**
 * Sigue el texto literal de la plantilla, en orden, para saber si una salida
 * cae en texto del documento (se marca) o dentro de una etiqueta, un atributo,
 * un comentario o un elemento de texto crudo (no se marca). También revisa el
 * HTML de un valor impreso (`unsafeValueReason`).
 *
 * Límite conocido: no ramifica. `FieldRewriter` le pasa el cuerpo de un `if` y
 * su `else` uno detrás del otro, desde el mismo estado, y el cuerpo de un
 * `for` una sola vez. Una plantilla que abre un comentario en una rama y lo
 * cierra en otra (`{% if a %}<!-- {% else %}-->{% endif %}{{ v }}`) lo
 * confunde y puede marcar una salida que queda dentro de un comentario.
 * Arreglarlo es guardar el estado antes de cada rama y dejar de marcar si las
 * ramas terminan distinto.
 */
class HtmlPosition {
  private state: ScanState = "data";
  private tagName = "";
  private closing = false;
  private rawElement = "";
  private recent = "";

  feed(text: string): void {
    for (const ch of text) this.step(ch);
  }

  isMarkable(): boolean {
    return this.state === "data";
  }

  private step(ch: string): void {
    switch (this.state) {
      case "data":
        if (ch === "<") this.state = "tagOpen";
        return;
      case "tagOpen":
        if (/[a-z]/i.test(ch)) this.startTag(ch, false);
        else if (ch === "/") this.state = "endTagOpen";
        else if (ch === "!") {
          this.state = "markup";
          this.recent = "";
        } else if (ch === "?") this.state = "bogus";
        else if (ch !== "<") this.state = "data";
        return;
      case "endTagOpen":
        if (/[a-z]/i.test(ch)) this.startTag(ch, true);
        else this.state = ch === ">" ? "data" : "bogus";
        return;
      case "tagName":
        if (ch === ">") this.finishTag();
        else if (/[\s/]/.test(ch)) this.state = "inTag";
        else this.tagName += ch.toLowerCase();
        return;
      case "inTag":
        if (ch === '"') this.state = "doubleQuoted";
        else if (ch === "'") this.state = "singleQuoted";
        else if (ch === ">") this.finishTag();
        return;
      case "doubleQuoted":
        if (ch === '"') this.state = "inTag";
        return;
      case "singleQuoted":
        if (ch === "'") this.state = "inTag";
        return;
      case "markup":
        this.recent += ch;
        if (this.recent === "--") {
          this.state = "comment";
          this.recent = "";
        } else if (this.recent !== "-") {
          this.state = ch === ">" ? "data" : "bogus";
        }
        return;
      case "comment":
        this.recent = (this.recent + ch).slice(-3);
        if (this.recent === "-->") this.state = "data";
        return;
      case "bogus":
        if (ch === ">") this.state = "data";
        return;
      case "rawText":
        if (this.rawElement === "plaintext") return;
        this.recent = (this.recent + ch.toLowerCase()).slice(
          -(this.rawElement.length + 2)
        );
        if (this.recent === `</${this.rawElement}`) {
          this.tagName = this.rawElement;
          this.closing = true;
          this.state = "tagName";
        }
        return;
    }
  }

  private startTag(ch: string, closing: boolean): void {
    this.tagName = ch.toLowerCase();
    this.closing = closing;
    this.state = "tagName";
  }

  private finishTag(): void {
    if (!this.closing && RAW_TEXT_ELEMENTS.has(this.tagName)) {
      this.state = "rawText";
      this.rawElement = this.tagName;
      this.recent = "";
    } else {
      this.state = "data";
    }
  }
}

/** Texto legible de un camino para los avisos: `works[i].title`. */
function describePath(node: NjkNode): string {
  if (node.typename !== "LookupVal") return String((node as NjkValue).value);
  const { target, val } = node as NjkLookupVal;
  if (val.typename === "Literal") {
    const prop = (val as NjkValue).value;
    return typeof prop === "number"
      ? `${describePath(target)}[${prop}]`
      : `${describePath(target)}.${String(prop)}`;
  }
  return `${describePath(target)}[${describePath(val)}]`;
}

/**
 * Reescribe el árbol: cada salida marcable queda envuelta en una llamada a
 * `__tplField` (camino) o `__tplFieldCall` (función del catálogo), y cada
 * `for` registra su lista y su índice para resolver los valores simples.
 */
class FieldRewriter {
  private readonly position = new HtmlPosition();
  /** Nombres ligados por cada `for`: id del loop, o `null` si no se sigue. */
  private readonly scopes: Map<string, number | null>[] = [];
  private nextLoopId = 1;

  constructor(
    private readonly formatFilters: ReadonlySet<string>,
    private readonly functions: ReadonlySet<string>
  ) {}

  rewrite(node: NjkNode): void {
    switch (node.typename) {
      case "Root":
      case "NodeList":
        (node as NjkNodeList).children.forEach((child) => this.rewrite(child));
        return;
      case "Output":
        this.rewriteOutput(node as NjkNodeList);
        return;
      case "If": {
        const branch = node as NjkIf;
        this.rewrite(branch.body);
        if (branch.else_) this.rewrite(branch.else_);
        return;
      }
      case "For":
        this.rewriteFor(node as NjkFor);
        return;
      default:
        // `set` en línea no imprime nada; lo demás no pasa la validación.
        return;
    }
  }

  private rewriteOutput(node: NjkNodeList): void {
    node.children = node.children.map((child) => {
      if (child.typename === "TemplateData") {
        this.position.feed(String((child as NjkValue).value ?? ""));
        return child;
      }
      if (!this.position.isMarkable()) return child;
      const form: OutputForm = classifyOutput(
        child,
        this.formatFilters,
        this.functions
      );
      if (form.kind === "path") return this.wrapPath(child, form.base);
      if (form.kind === "function") {
        return this.call(child, FIELD_CALL, [
          child,
          this.literal(child, child.lineno + 1),
          this.literal(child, form.name),
          this.list(child, form.call.args.children),
        ]);
      }
      return child;
    });
  }

  /**
   * Candidatos, del más cercano al más lejano: cada objeto intermedio del
   * camino con el resto de las propiedades, y al final el nombre de la raíz,
   * que es un valor de un `for` (lista + índice) o una clave de los datos.
   *
   * Límite conocido: un objeto intermedio compartido por dos caminos de los
   * datos (la misma nacionalidad en dos autores) tiene en `buildPathIndex` un
   * solo camino, el primero; como es el candidato más cercano, las dos
   * apariciones salen con la clave del primero. El test de claves correctas
   * no lo ve, porque el valor en las dos claves es el mismo. Los datos que
   * arma Prisma no comparten objetos entre filas. Arreglarlo es probar primero
   * el candidato más lejano que resuelva, o que el índice rechace como base
   * los objetos alcanzables por más de un camino.
   */
  private wrapPath(expr: NjkNode, base: NjkNode): NjkNode {
    const candidates: NjkNode[] = [];
    const props: NjkNode[] = [];
    let cursor = base;
    while (cursor.typename === "LookupVal") {
      const lookup = cursor as NjkLookupVal;
      props.unshift(lookup.val);
      candidates.push(
        this.list(expr, [this.literal(expr, "obj"), lookup.target, ...props])
      );
      cursor = lookup.target;
    }
    const name = String((cursor as NjkValue).value);
    if (props.length === 0) {
      candidates.push(
        this.list(expr, [this.literal(expr, "obj"), this.symbol(expr, name)])
      );
    }
    const binding = this.binding(name);
    if (typeof binding === "number") {
      candidates.push(
        this.list(expr, [
          this.literal(expr, "loop"),
          this.literal(expr, binding),
          this.symbol(expr, name),
          ...props,
        ])
      );
    } else if (binding === undefined) {
      candidates.push(
        this.list(expr, [
          this.literal(expr, "root"),
          this.literal(expr, name),
          this.symbol(expr, name),
          ...props,
        ])
      );
    }
    return this.call(expr, FIELD, [
      expr,
      this.literal(expr, expr.lineno + 1),
      this.literal(expr, describePath(base)),
      this.list(expr, candidates),
    ]);
  }

  private rewriteFor(node: NjkFor): void {
    const loopId = this.nextLoopId++;
    const scope = new Map<string, number | null>([["loop", null]]);
    if (node.name.typename === "Symbol") {
      scope.set(String((node.name as NjkValue).value), loopId);
    } else {
      for (const alias of (node.name as NjkNodeList).children) {
        scope.set(String((alias as NjkValue).value), null);
      }
    }
    this.scopes.push(scope);
    this.rewrite(node.body);
    this.scopes.pop();
    if (node.else_) this.rewrite(node.else_);

    node.arr = this.call(node, LOOP, [this.literal(node, loopId), node.arr]);
    const index0 = new njk.nodes.LookupVal(
      node.lineno,
      node.colno,
      this.symbol(node, "loop"),
      this.literal(node, "index0")
    );
    node.body.children.unshift(
      new njk.nodes.Output(node.lineno, node.colno, [
        this.call(node, LOOP_INDEX, [this.literal(node, loopId), index0]),
      ])
    );
  }

  private binding(name: string): number | null | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return this.scopes[i].get(name);
    }
    return undefined;
  }

  private literal(at: NjkNode, value: unknown): NjkNode {
    return new njk.nodes.Literal(at.lineno, at.colno, value);
  }

  private symbol(at: NjkNode, name: string): NjkNode {
    return new njk.nodes.Symbol(at.lineno, at.colno, name);
  }

  private list(at: NjkNode, items: NjkNode[]): NjkNode {
    return new njk.nodes.Array(at.lineno, at.colno, items);
  }

  private call(at: NjkNode, fn: string, args: NjkNode[]): NjkNode {
    return new njk.nodes.FunCall(
      at.lineno,
      at.colno,
      this.symbol(at, fn),
      new njk.nodes.NodeList(at.lineno, at.colno, args)
    );
  }
}

interface RenderState {
  index: WeakMap<object, string>;
  data: Record<string, any>;
  loops: Map<number, { list: unknown; index: number }>;
  occurrence: number;
  warnings: Map<string, TemplateWarning>;
  /** Valores que no dejan marcar el documento: si hay alguno, sale sin marcas. */
  unmarkable: Map<string, TemplateWarning>;
}

function pathOf(state: RenderState, value: unknown): string | undefined {
  return typeof value === "object" && value !== null
    ? state.index.get(value)
    : undefined;
}

function appendProps(base: string, props: unknown[]): string | undefined {
  let key = base;
  for (const prop of props) {
    if (typeof prop === "number" && Number.isInteger(prop) && prop >= 0) {
      key = `${key}[${prop}]`;
    } else if (typeof prop === "string" && prop !== "") {
      key = key === "" ? prop : `${key}.${prop}`;
    } else {
      return undefined;
    }
  }
  return key === "" ? undefined : key;
}

function resolveCandidate(
  candidate: unknown[],
  state: RenderState
): string | undefined {
  const [kind, first, value, ...rest] = candidate;
  if (kind === "obj") {
    const base = pathOf(state, first);
    return base === undefined
      ? undefined
      : appendProps(base, candidate.slice(2));
  }
  if (kind === "loop") {
    const loop = state.loops.get(first as number);
    if (!loop || !Array.isArray(loop.list)) return undefined;
    if (
      loop.index < 0 ||
      loop.index >= loop.list.length ||
      loop.list[loop.index] !== value
    ) {
      return undefined;
    }
    const listPath = pathOf(state, loop.list);
    return listPath === undefined
      ? undefined
      : appendProps(`${listPath}[${loop.index}]`, rest);
  }
  if (kind === "root") {
    const name = first as string;
    if (
      !Object.prototype.hasOwnProperty.call(state.data, name) ||
      state.data[name] !== value
    ) {
      return undefined;
    }
    return appendProps("", [name, ...rest]);
  }
  return undefined;
}

/**
 * Una clave va dentro de un comentario HTML: no vacía (la página no leería la
 * marca), sin espacios, `<`, `>` ni `--`.
 */
function isRepresentableKey(key: string): boolean {
  return key !== "" && !/--|[<>\s]|-$/.test(key);
}

/**
 * Por qué el HTML de un valor impreso en el texto del documento cambiaría lo
 * que el navegador lee como marca, o `undefined`. Solo pasa con un valor
 * `| safe` (lo demás sale escapado):
 * - con comentarios con forma de marca (`<!--f:N`, `<!--/f:N`) falsificaría
 *   un campo o partiría uno de verdad;
 * - si deja abierto un comentario, una etiqueta o un elemento de texto crudo,
 *   la marca siguiente queda adentro o lo cierra: el `-->` de una marca
 *   cerraría el comentario del valor e imprimiría lo que sin marcas no se ve.
 * Ante la duda (`<!-->`, `--!>`) se toma como abierto: sale sin marcas.
 */
function unsafeValueReason(html: string): string | undefined {
  if (!html.includes("<")) return undefined;
  if (/<!--\/?f:\d/.test(html)) return "trae comentarios con forma de marca";
  const position = new HtmlPosition();
  position.feed(html);
  return position.isMarkable()
    ? undefined
    : "deja abierto un comentario, una etiqueta o un elemento de texto crudo";
}

function warn(state: RenderState, line: number, reason: string): void {
  const id = `${line}\u0000${reason}`;
  if (!state.warnings.has(id)) state.warnings.set(id, { line, reason });
}

function installFieldGlobals(
  env: NjkEnvironment,
  state: RenderState,
  catalog: TemplateCatalog
): void {
  /**
   * El HTML que imprime una salida en el texto del documento, lleve marca o
   * no: un valor que no deja marcar se anota y el render sale sin marcas.
   */
  const printed = (value: unknown, line: number, label: string): string => {
    const html = String(njk.runtime.suppressValue(value, env.opts.autoescape));
    const reason = unsafeValueReason(html);
    if (reason !== undefined) {
      const id = `${line}\u0000${label}\u0000${reason}`;
      if (!state.unmarkable.has(id)) {
        state.unmarkable.set(id, {
          line,
          reason: `sin marcas: el valor de ${label} ${reason}`,
        });
      }
    }
    return html;
  };

  const mark = (
    value: unknown,
    html: string,
    key: string,
    line: number
  ): unknown => {
    if (!isRepresentableKey(key)) {
      warn(state, line, `sin clave: "${key}" no puede ir en una marca`);
      return value;
    }
    const n = ++state.occurrence;
    return njk.runtime.markSafe(`<!--f:${n} ${key}-->${html}<!--/f:${n}-->`);
  };

  env.addGlobal(
    FIELD,
    (value: unknown, line: number, text: string, candidates: unknown[][]) => {
      const html = printed(value, line, `{{ ${text} }}`);
      for (const candidate of candidates) {
        const key = resolveCandidate(candidate, state);
        if (key !== undefined) return mark(value, html, key, line);
      }
      warn(state, line, `sin clave: {{ ${text} }} no sale de los datos`);
      return value;
    }
  );

  env.addGlobal(
    FIELD_CALL,
    (value: unknown, line: number, name: string, args: unknown[]) => {
      const html = printed(value, line, `${name}()`);
      let key: string | undefined;
      try {
        key = catalog.functions?.[name]?.key?.(args, (v) => pathOf(state, v));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warn(
          state,
          line,
          `sin clave: la clave de ${name}() falló (${message})`
        );
        return value;
      }
      if (key === undefined) {
        warn(state, line, `sin clave: ${name}() no dio una clave`);
        return value;
      }
      return mark(value, html, key, line);
    }
  );

  env.addGlobal(LOOP, (loopId: number, list: unknown) => {
    state.loops.set(loopId, { list, index: -1 });
    return list;
  });

  env.addGlobal(LOOP_INDEX, (loopId: number, index: number) => {
    const loop = state.loops.get(loopId);
    if (loop) loop.index = index;
    return "";
  });
}

function compileTemplate(ast: NjkNode, env: NjkEnvironment) {
  const compiler = new njk.compiler.Compiler(
    undefined,
    env.opts.throwOnUndefined
  );
  compiler.compile(transformer.transform(ast, env.asyncFilters));
  const props: unknown = new Function(compiler.getCode())();
  return new njk.Template({ type: "code", obj: props }, env, undefined);
}

/**
 * Renderiza como `renderHtmlFromTemplate`, pero con cada dato impreso entre
 * marcas invisibles: `<!--f:N clave-->valor<!--/f:N-->`. N numera las
 * apariciones desde 1; las claves calculadas empiezan con `@`.
 *
 * - Si la plantilla tiene violaciones de forma, se renderiza entera sin
 *   marcas (`marked: false`) y las violaciones vuelven en `warnings`.
 * - Una salida marcable cuyo camino no sale de los datos se imprime sin marca
 *   y va a `warnings` con su línea (una vez por línea y motivo).
 * - Si un valor impreso en el texto (en la práctica, uno `| safe`) trae
 *   comentarios con forma de marca, o deja abierto un comentario, una
 *   etiqueta o un elemento de texto crudo, también se renderiza entera sin
 *   marcas (`marked: false`), con el motivo en `warnings`: con marcas se
 *   imprimiría otra cosa.
 * - Las líneas cuentan desde el principio de la plantilla, front-matter incluido.
 */
export async function renderHtmlFromTemplateWithFields(
  template: string,
  data: Record<string, any>,
  catalog: TemplateCatalog
): Promise<{ html: string; marked: boolean; warnings: TemplateWarning[] }> {
  const { content, data: frontMatterData } = matter(template);
  const context = { ...frontMatterData, ...data };
  const prefix = template.endsWith(content)
    ? template.slice(0, template.length - content.length)
    : "";
  const lineOffset = (prefix.match(/\n/g) ?? []).length;
  const shift = (warnings: TemplateWarning[]) =>
    warnings.map((w) => ({ line: w.line + lineOffset, reason: w.reason }));

  const env = createEnvironment(catalog);
  const violations = validateTemplate(content, catalog);
  if (violations.length > 0) {
    return {
      html: env.renderString(content, context),
      marked: false,
      warnings: shift(violations),
    };
  }

  const internals = env as unknown as NjkEnvironment;
  const ast = parseTemplate(content, internals);
  new FieldRewriter(
    formatFilterNames(catalog),
    catalogFunctionNames(catalog)
  ).rewrite(ast);
  const state: RenderState = {
    index: buildPathIndex(data),
    data,
    loops: new Map(),
    occurrence: 0,
    warnings: new Map(),
    unmarkable: new Map(),
  };
  installFieldGlobals(internals, state, catalog);
  const html = compileTemplate(ast, internals).render(context);
  if (state.unmarkable.size > 0) {
    return {
      html: env.renderString(content, context),
      marked: false,
      warnings: shift([...state.unmarkable.values()]),
    };
  }
  return { html, marked: true, warnings: shift([...state.warnings.values()]) };
}
