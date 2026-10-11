// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

import type { TemplateCatalog } from "../../../src/common/utils/templateFields/types";
import { validateTemplate } from "../../../src/common/utils/templateFields/validateTemplate";

const catalog: TemplateCatalog = {
  filters: {
    porcentaje: (v: unknown) =>
      `${Number(v || 0)
        .toFixed(2)
        .replace(".", ",")}%`,
  },
  functions: {
    nombreEditorial: { fn: (p: { name: string }) => p.name },
    tieneSeudonimo: {
      fn: (p: { pseudonym?: string }) => Boolean(p.pseudonym?.trim()),
    },
    participacion: { fn: () => 50 },
    cantidad: { fn: (lista: unknown[]) => lista.length },
  },
};

describe("validateTemplate", () => {
  it("acepta las tres formas: camino, función del catálogo y literal, con filtros de formato", () => {
    const tpl = [
      "{{ obra.title | upper }} {{ author.musicPercentage | porcentaje }}",
      "{{ author.ipi | default('No posee', true) }} {{ x | replace('-', '') | trim }}",
      "{{ participacion(editorial, publishers) | porcentaje }} {{ cantidad(works) | aLetras | upper }}",
      "{{ nombreEditorial(p) | lower | capitalize | title }}",
      "{{ 'N/A' }} {{ 3 }} {{ works[0].alternativeTitles[1] }} {{ works[i].title }}",
      "{{ fecha | formatDate('dd/MM/yyyy') }} {{ obs | safe }} {{ nombre | escape }}",
      "{{ a | default(b.c) }}",
    ].join("\n");
    expect(validateTemplate(tpl, catalog)).toEqual([]);
  });

  it("acepta for, if/elif/else, set en línea, raw y comentarios; condiciones y set son libres", () => {
    const tpl = [
      "{# comentario #}",
      "{% raw %}{{ esto no se evalúa | length }}{% endraw %}",
      "{% set total = 0 %}{% set total = total + a.b * 2 %}{% set lista = (lista.push(x), lista) %}",
      "{% for w in works | sort(false, false, 'title') %}",
      "{% if loop.first and w.title ~ 'x' != 'y' %}{{ w.title }}{% elif w.isrc | length > 1 %}-{% else %}+{% endif %}",
      "{% else %}vacío{% endfor %}",
      "{% for k, v in obj %}{{ v }}{% endfor %}",
      "{% if tieneSeudonimo(p) %}{{ p.name }}{% endif %}",
    ].join("\n");
    expect(validateTemplate(tpl, catalog)).toEqual([]);
  });

  it.each([
    [
      "{% macro m(x) %}{{ x }}{% endmacro %}",
      /etiqueta no permitida: \{% macro %\}/,
    ],
    ["{% call m() %}x{% endcall %}", /etiqueta no permitida: \{% call %\}/],
    ['{% import "x.njk" as x %}', /etiqueta no permitida: \{% import %\}/],
    ['{% from "x.njk" import y %}', /etiqueta no permitida: \{% from %\}/],
    ['{% include "x.njk" %}', /etiqueta no permitida: \{% include %\}/],
    ['{% extends "x.njk" %}', /etiqueta no permitida: \{% extends %\}/],
    ["{% block b %}x{% endblock %}", /etiqueta no permitida: \{% block %\}/],
    [
      "{% filter upper %}x{% endfilter %}",
      /etiqueta no permitida: \{% filter %\}/,
    ],
    ["{% set x %}{{ a }}{% endset %}", /\{% set %\} de bloque/],
    [
      "{% switch x %}{% case 1 %}a{% endswitch %}",
      /etiqueta no permitida: \{% switch %\}/,
    ],
    [
      "{% asyncEach x in xs %}{{ x }}{% endeach %}",
      /etiqueta no permitida: \{% asyncEach %\}/,
    ],
    ["{{ a.b * 100 }}", /aritmética/],
    ["{{ -a }}", /aritmética/],
    ["{{ a ~ b }}", /operador ~/],
    ["{{ a if a else 'N/A' }}", /if en línea/],
    ["{{ lista.join(' & ') }}", /método JS en \{\{ \}\}: \.join\(\)/],
    ["{{ (v | float).toFixed(2) }}", /método JS en \{\{ \}\}: \.toFixed\(\)/],
    [
      "{{ formatPercentage(v) }}",
      /fuera del catálogo en \{\{ \}\}: formatPercentage\(\)/,
    ],
    ["{{ works | length }}", /filtro no permitido en \{\{ \}\}: length/],
    [
      "{{ cantidad(works) | length }}",
      /filtro no permitido en \{\{ \}\}: length/,
    ],
    ["{{ a | default(b ~ 'x') }}", /argumento no permitido en \| default/],
    [
      "{{ participacion(p, lista | sort) }}",
      /argumento no permitido en participacion\(\)/,
    ],
    ["{{ a == b }}", /expresión no permitida en \{\{ \}\}: Compare/],
    ["{{ (a) }}", /expresión no permitida en \{\{ \}\}: Group/],
  ])("%s es una violación", (tpl, reason) => {
    const warnings = validateTemplate(tpl, catalog);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toBe(1);
    expect(warnings[0].reason).toMatch(reason);
  });

  it("informa la línea de cada violación y sigue revisando", () => {
    const tpl =
      "<p>\n{{ a | length }}\n</p>\n{% for x in xs %}\n  {{ x.total * 2 }}\n{% endfor %}";
    expect(validateTemplate(tpl, catalog).map((w) => w.line)).toEqual([2, 5]);
  });

  it("la forma se valida en cualquier posición, también dentro de un atributo", () => {
    const warnings = validateTemplate(
      "<div class=\"{{ 'a' if x else 'b' }}\"></div>",
      catalog
    );
    expect(warnings.map((w) => w.reason)).toEqual(["if en línea en {{ }}"]);
  });

  it("sin catálogo, llamar a una función es una violación", () => {
    expect(validateTemplate("{{ cantidad(works) }}")).toHaveLength(1);
    expect(validateTemplate("{{ cantidad(works) }}", catalog)).toEqual([]);
  });

  it("un error de sintaxis vuelve como violación con su línea", () => {
    const warnings = validateTemplate("<p>\n{{ b }\n</p>", catalog);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toBe(2);
    expect(warnings[0].reason).toMatch(/^error de sintaxis: /);
  });
});
