// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

import {
  BUILTIN_FORMAT_FILTERS,
  TemplateCatalog,
} from "../../../src/common/utils/templateFields/types";
import { createEnvironment } from "../../../src/common/utils/templateFields/environment";

const catalog: TemplateCatalog = {
  filters: {
    porcentaje: (v: unknown) =>
      `${Number(v || 0)
        .toFixed(2)
        .replace(".", ",")}%`,
  },
  functions: {
    doble: { fn: (n: number) => n * 2 },
    tieneNombre: {
      fn: (p: { name?: string }) => Boolean(p && p.name && p.name.trim()),
    },
  },
};

describe("createEnvironment", () => {
  it("escapa por defecto y no falla con variables indefinidas", () => {
    const env = createEnvironment();
    expect(env.renderString("[{{ a }}][{{ nada.x }}]", { a: '<b>&"' })).toBe(
      "[&lt;b&gt;&amp;&quot;][]"
    );
  });

  it("registra aLetras y formatDate", () => {
    const env = createEnvironment();
    expect(
      env.renderString("{{ 15 | aLetras }} {{ f | formatDate('yyyy') }}", {
        f: "2026-09-30T00:00:00Z",
      })
    ).toBe("quince 2026");
  });

  it("todos los filtros de formato predefinidos existen en el entorno", () => {
    const env = createEnvironment();
    for (const name of BUILTIN_FORMAT_FILTERS) {
      expect(() => env.getFilter(name)).not.toThrow();
    }
  });

  it("registra los filtros del catálogo y sus funciones como globales", () => {
    const env = createEnvironment(catalog);
    const tpl =
      "{{ 15 | porcentaje }} {{ doble(4) }}{% if tieneNombre(p) %} con nombre{% endif %}" +
      "{% set d = doble(10) %} {{ d }}";
    expect(env.renderString(tpl, { p: { name: " Ana " } })).toBe(
      "15,00% 8 con nombre 20"
    );
  });

  it("cada entorno es independiente: sin catálogo, sus funciones no existen", () => {
    createEnvironment(catalog);
    const plain = createEnvironment();
    expect(() => plain.renderString("{{ doble(1) }}", {})).toThrow(/doble/);
    expect(() => plain.renderString("{{ 1 | porcentaje }}", {})).toThrow(
      /porcentaje/
    );
  });
});
