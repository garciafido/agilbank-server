// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

import { renderHtmlFromTemplate } from "../../../src/common/utils/htmlFromTemplate";
import type { TemplateCatalog } from "../../../src/common/utils/templateFields/types";
import { renderHtmlFromTemplateWithFields } from "../../../src/common/utils/templateFields/renderWithFields";

interface Publisher {
  name: string;
  pseudonym?: string;
  percentage: number;
}

const catalog: TemplateCatalog = {
  filters: {
    porcentaje: (v: unknown) =>
      `${Number(v || 0)
        .toFixed(2)
        .replace(".", ",")}%`,
  },
  functions: {
    nombreEditorial: {
      fn: (p: Publisher) => p.pseudonym?.trim() || p.name,
      key: ([p], pathOf) => {
        const base = pathOf(p);
        if (base === undefined) return undefined;
        return `${base}.${p.pseudonym?.trim() ? "pseudonym" : "name"}`;
      },
    },
    tieneSeudonimo: { fn: (p: Publisher) => Boolean(p.pseudonym?.trim()) },
    participacion: {
      fn: (p: Publisher, lista: Publisher[]) =>
        (p.percentage / lista.reduce((s, x) => s + x.percentage, 0)) * 100,
      key: ([p], pathOf) => {
        const base = pathOf(p);
        return base === undefined ? undefined : `@${base}.participacion`;
      },
    },
    cantidad: {
      fn: (lista: unknown[]) => lista.length,
      key: ([lista], pathOf) => {
        const base = pathOf(lista);
        return base === undefined ? undefined : `@${base}.cantidad`;
      },
    },
  },
};

const data = {
  titulo: "Contrato",
  contractMetadata: null,
  publishers: [
    { name: "Pérez & Hijos", pseudonym: "  ", percentage: 15, country: null },
    {
      name: "Ediciones Sur",
      pseudonym: "Sur",
      percentage: 5,
      country: { name_es: "Chile" },
    },
  ],
  authors: [{ firstName: "Ana", taxId: '20-1<2>&"3"' }],
  works: [
    {
      title: "Zamba",
      isrc: "AR-AB1-26-00001",
      alternativeTitles: ["La zamba", "Zambita"],
    },
    { title: "Aire", isrc: null, alternativeTitles: [] },
    {
      title: "Milonga",
      isrc: "AR-AB1-26-00003",
      alternativeTitles: ["Milonguita"],
    },
  ],
  observations: ["<p>Nota <!-- interna --> con <b>negrita</b></p>"],
  logoDataUri: "data:image/png;base64,AAAA",
};

const MARKER = /<!--f:(\d+) ([^>]*?)-->([\s\S]*?)<!--\/f:\1-->/g;

function fields(html: string): { n: number; key: string; text: string }[] {
  return [...html.matchAll(MARKER)].map((m) => ({
    n: Number(m[1]),
    key: m[2],
    text: m[3],
  }));
}

function keys(html: string): string[] {
  return fields(html).map((f) => f.key);
}

function strip(html: string): string {
  return html.replace(/<!--\/?f:\d+(?: [^>]*?)?-->/g, "");
}

const render = (tpl: string) =>
  renderHtmlFromTemplateWithFields(tpl, data, catalog);

describe("renderHtmlFromTemplateWithFields", () => {
  it("marca cada camino con su clave y numera las apariciones desde 1", async () => {
    const result = await render(
      "<p>{{ titulo }}</p><p>{{ authors[0].firstName | upper }}</p>"
    );
    expect(result.marked).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(fields(result.html)).toEqual([
      { n: 1, key: "titulo", text: "Contrato" },
      { n: 2, key: "authors[0].firstName", text: "ANA" },
    ]);
  });

  it("escapa el valor dentro de la marca igual que sin marcas", async () => {
    const result = await render("<p>{{ authors[0].taxId }}</p>");
    expect(fields(result.html)[0].text).toBe("20-1&lt;2&gt;&amp;&quot;3&quot;");
  });

  it("loop ordenado: la clave sale de la identidad del objeto, no del índice", async () => {
    const result = await render(
      "{% for obra in works | sort(false, false, 'title') %}[{{ obra.title | upper }}]{% endfor %}"
    );
    expect(fields(result.html).map((f) => [f.key, f.text])).toEqual([
      ["works[1].title", "AIRE"],
      ["works[2].title", "MILONGA"],
      ["works[0].title", "ZAMBA"],
    ]);
  });

  it("lista armada en la plantilla con objetos de los datos (ISRC)", async () => {
    const result = await render(
      "{%- set isrcWorks = [] -%}{%- for work in works -%}{%- if work.isrc -%}" +
        "{%- set _ = isrcWorks.push(work) -%}{%- endif -%}{%- endfor -%}" +
        "<p>{{ isrcWorks[0].title }}</p>" +
        "{% for work in isrcWorks %}<li>{{ work.title }}: {{ work.isrc | replace('-', '') }}</li>{% endfor %}"
    );
    expect(fields(result.html).map((f) => [f.key, f.text])).toEqual([
      ["works[0].title", "Zamba"],
      ["works[0].title", "Zamba"],
      ["works[0].isrc", "ARAB12600001"],
      ["works[2].title", "Milonga"],
      ["works[2].isrc", "ARAB12600003"],
    ]);
  });

  it("alias con set: la clave es la del objeto de los datos", async () => {
    const result = await render(
      "{% set ed = publishers[1] %}{{ ed.name }} / {{ ed.country.name_es }}"
    );
    expect(keys(result.html)).toEqual([
      "publishers[1].name",
      "publishers[1].country.name_es",
    ]);
  });

  it("intermedio nulo: clave del ancestro más cercano; el respaldo conserva la clave", async () => {
    const result = await render(
      "{% for editorial in publishers %}<b>{{ editorial.country.name_es | default('N/A', true) }}</b>{% endfor %}" +
        "<i>{{ contractMetadata.editionInfo.name | default('-', true) }}</i>"
    );
    expect(fields(result.html).map((f) => [f.key, f.text])).toEqual([
      ["publishers[0].country.name_es", "N/A"],
      ["publishers[1].country.name_es", "Chile"],
      ["contractMetadata.editionInfo.name", "-"],
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("valores simples de una lista de los datos: camino de la lista más el índice", async () => {
    const result = await render(
      "{% for obra in works %}{% for alt in obra.alternativeTitles %}({{ alt }}){% endfor %}{% endfor %}|" +
        "{% for t in works[0].alternativeTitles %}{% for w in works %}{{ t }}{% endfor %}{% endfor %}"
    );
    expect(keys(result.html)).toEqual([
      "works[0].alternativeTitles[0]",
      "works[0].alternativeTitles[1]",
      "works[2].alternativeTitles[0]",
      "works[0].alternativeTitles[0]",
      "works[0].alternativeTitles[0]",
      "works[0].alternativeTitles[0]",
      "works[0].alternativeTitles[1]",
      "works[0].alternativeTitles[1]",
      "works[0].alternativeTitles[1]",
    ]);
  });

  it("lista transformada o armada con set: no se inventa un índice, se avisa", async () => {
    const result = await render(
      "{% for alt in works[0].alternativeTitles | sort %}{{ alt }}{% endfor %}\n" +
        "{% set nombres = ['a', 'b'] %}{% for n in nombres %}{{ n }}{% endfor %}"
    );
    expect(fields(result.html)).toEqual([]);
    expect(result.warnings).toEqual([
      { line: 1, reason: "sin clave: {{ alt }} no sale de los datos" },
      { line: 2, reason: "sin clave: {{ n }} no sale de los datos" },
    ]);
  });

  it("lo que no sale de los datos se imprime sin marca y se avisa una vez por línea", async () => {
    const tpl = [
      "{% set totalPercentage = 20 %}",
      "<p>{{ totalPercentage }}</p>",
      "<p>{{ nada.x }}</p>{% for p in publishers %}{{ loop.index }}{% endfor %}",
      "<p>{{ tieneSeudonimo(publishers[1]) }}</p>",
    ].join("\n");
    const result = await render(tpl);
    expect(fields(result.html)).toEqual([]);
    expect(result.html).toBe(await renderHtmlFromTemplate(tpl, data, catalog));
    expect(result.warnings).toEqual([
      {
        line: 2,
        reason: "sin clave: {{ totalPercentage }} no sale de los datos",
      },
      { line: 3, reason: "sin clave: {{ nada.x }} no sale de los datos" },
      { line: 3, reason: "sin clave: {{ loop.index }} no sale de los datos" },
      { line: 4, reason: "sin clave: tieneSeudonimo() no dio una clave" },
    ]);
  });

  it("funciones del catálogo: la clave la declara la función; las calculadas empiezan con @", async () => {
    const result = await render(
      "{% for editorial in publishers %}{{ nombreEditorial(editorial) | upper }} " +
        "{{ participacion(editorial, publishers) | porcentaje }};{% endfor %} {{ cantidad(works) | aLetras }}"
    );
    expect(fields(result.html).map((f) => [f.key, f.text])).toEqual([
      ["publishers[0].name", "PÉREZ &amp; HIJOS"],
      ["@publishers[0].participacion", "75,00%"],
      ["publishers[1].pseudonym", "SUR"],
      ["@publishers[1].participacion", "25,00%"],
      ["@works.cantidad", "tres"],
    ]);
  });

  it("un valor | safe con su propio comentario HTML queda entero dentro de la marca", async () => {
    const result = await render(
      "{% for obs in observations %}<div>{{ obs | safe }}</div>{% endfor %}"
    );
    expect(result.html).toBe(
      "<div><!--f:1 observations[0]--><p>Nota <!-- interna --> con <b>negrita</b></p><!--/f:1--></div>"
    );
  });

  it("las funciones devuelven valores planos: nunca hay marcas dentro de un set", async () => {
    const result = await render(
      "{% set etiqueta = nombreEditorial(publishers[1]) | upper %}" +
        "{% set largo = (nombreEditorial(publishers[0]) | length) %}" +
        '<span data-x="{{ etiqueta }}">{{ largo }}</span>'
    );
    expect(result.html).toBe('<span data-x="SUR">13</span>');
    expect(result.warnings).toEqual([
      { line: 1, reason: "sin clave: {{ largo }} no sale de los datos" },
    ]);
  });

  it("no marca dentro de etiquetas, atributos, <style>, <script>, <title>, <textarea> ni comentarios, y no avisa", async () => {
    const tpl = [
      "<html><head><title>{{ titulo }}</title>",
      '<style>.a::after { content: "{{ titulo }}"; }</style>',
      '<script>var t = "{{ titulo }}";</script></head><body>',
      '<img src="{{ logoDataUri }}" alt=\'{{ titulo }}\'><div class="x {{ sizeClass }}">',
      "<!-- {{ titulo }} --><textarea>{{ titulo }}</textarea>",
      "<p>{{ titulo }}</p></div></body></html>",
    ].join("\n");
    const result = await render(tpl);
    expect(fields(result.html)).toEqual([
      { n: 1, key: "titulo", text: "Contrato" },
    ]);
    expect(result.warnings).toEqual([]);
    expect(strip(result.html)).toBe(
      await renderHtmlFromTemplate(tpl, data, catalog)
    );
  });

  it("tampoco marca dentro de <xmp>, <iframe>, <noembed>, <noframes>, <noscript> ni después de <plaintext>, que no cierra", async () => {
    const tpl = [
      "<p>{{ titulo }}</p><xmp>{{ titulo }}</xmp><iframe>{{ titulo }}</iframe>",
      "<noembed>{{ titulo }}</noembed><noframes>{{ titulo }}</noframes><noscript>{{ titulo }}</noscript>",
      "<p>{{ titulo }}</p><plaintext>{{ titulo }}</plaintext><p>{{ titulo }}</p>",
    ].join("\n");
    const result = await render(tpl);
    expect(fields(result.html)).toEqual([
      { n: 1, key: "titulo", text: "Contrato" },
      { n: 2, key: "titulo", text: "Contrato" },
    ]);
    expect(result.warnings).toEqual([]);
    expect(strip(result.html)).toBe(
      await renderHtmlFromTemplate(tpl, data, catalog)
    );
  });

  it("un valor | safe con comentarios con forma de marca: sale entera sin marcas, con aviso", async () => {
    const tpl =
      "{% for obs in falsas %}<div>{{ obs | safe }}</div>{% endfor %}\n<p>{{ authors[0].taxId }}</p>";
    const datos = {
      ...data,
      falsas: ["<!--f:2 authors[0].taxId-->FALSO<!--/f:2-->"],
    };
    const result = await renderHtmlFromTemplateWithFields(tpl, datos, catalog);
    expect(result.marked).toBe(false);
    expect(result.html).toBe(await renderHtmlFromTemplate(tpl, datos, catalog));
    expect(result.warnings).toEqual([
      {
        line: 1,
        reason:
          "sin marcas: el valor de {{ obs }} trae comentarios con forma de marca",
      },
    ]);
  });

  it.each([
    ["un comentario", "nota <!-- borrador"],
    ["una etiqueta", 'nota <b title="x'],
    ["un elemento de texto crudo", "nota <textarea>"],
  ])(
    "un valor | safe que deja abierto %s: sale entera sin marcas, con aviso",
    async (_, nota) => {
      const tpl =
        "<p>{{ extra.nota | safe }}</p>\n<p>Firma: {{ authors[0].taxId }}</p> resto";
      const datos = { ...data, extra: { nota } };
      const result = await renderHtmlFromTemplateWithFields(
        tpl,
        datos,
        catalog
      );
      expect(result.marked).toBe(false);
      expect(result.html).toBe(
        await renderHtmlFromTemplate(tpl, datos, catalog)
      );
      expect(result.warnings).toEqual([
        {
          line: 1,
          reason:
            "sin marcas: el valor de {{ extra.nota }} deja abierto un comentario, una etiqueta o un elemento de texto crudo",
        },
      ]);
    }
  );

  it("el valor se revisa aunque la salida no lleve marca, y también el de una función del catálogo", async () => {
    const conNota: TemplateCatalog = {
      functions: {
        nota: { fn: () => "nota <!-- borrador", key: () => "extra.nota" },
      },
    };
    const datos = { titulo: "T", extra: { nota: "nota <!-- borrador" } };
    const sinClave = await renderHtmlFromTemplateWithFields(
      "{% set n = extra.nota %}<p>{{ n | safe }}</p><p>{{ titulo }}</p>",
      datos,
      conNota
    );
    expect(sinClave.marked).toBe(false);
    expect(sinClave.warnings).toEqual([
      {
        line: 1,
        reason:
          "sin marcas: el valor de {{ n }} deja abierto un comentario, una etiqueta o un elemento de texto crudo",
      },
    ]);
    const funcion = await renderHtmlFromTemplateWithFields(
      "<p>{{ nota() | safe }}</p><p>{{ titulo }}</p>",
      datos,
      conNota
    );
    expect(funcion.marked).toBe(false);
    expect(funcion.html).toBe("<p>nota <!-- borrador</p><p>T</p>");
    expect(funcion.warnings).toEqual([
      {
        line: 1,
        reason:
          "sin marcas: el valor de nota() deja abierto un comentario, una etiqueta o un elemento de texto crudo",
      },
    ]);
  });

  it("un comentario cerrado, una etiqueta completa o un < suelto en un valor | safe no molestan", async () => {
    const tpl =
      "<p>{{ extra.a | safe }}</p><p>{{ extra.b | safe }}</p><p>{{ extra.c | safe }}</p>";
    const datos = {
      extra: {
        a: "<!--[if mso]><x><![endif]-->visible",
        b: '<br/><td colspan=2>x</td><img alt="a>b">',
        c: "3 < 4",
      },
    };
    const result = await renderHtmlFromTemplateWithFields(tpl, datos, catalog);
    expect(result.marked).toBe(true);
    expect(keys(result.html)).toEqual(["extra.a", "extra.b", "extra.c"]);
    expect(result.warnings).toEqual([]);
  });

  it("una clave vacía no va en una marca: se imprime sin marca y se avisa", async () => {
    const vacia: TemplateCatalog = {
      functions: { vacia: { fn: () => "x", key: () => "" } },
    };
    const result = await renderHtmlFromTemplateWithFields(
      "<p>{{ vacia() }}</p>",
      {},
      vacia
    );
    expect(result.marked).toBe(true);
    expect(result.html).toBe("<p>x</p>");
    expect(result.warnings).toEqual([
      { line: 1, reason: 'sin clave: "" no puede ir en una marca' },
    ]);
  });

  it("sacando las marcas, el HTML es idéntico al render sin marcas", async () => {
    const tpl = [
      "<style>p { margin: 0 }</style>",
      "<h1>{% for e in publishers %}{{ nombreEditorial(e) | upper }}{% if not loop.last %} & {% endif %}{% endfor %}</h1>",
      "{% for obra in works | sort(false, false, 'title') %}<li>{{ obra.title | upper }}",
      "{%- if obra.alternativeTitles -%} {% for alt in obra.alternativeTitles %} ({{ alt }}){% endfor %}{% endif %}</li>",
      "{% endfor %}",
      "{% for e in publishers %}{{ e.country.name_es | default('N/A', true) }}: {{ participacion(e, publishers) | porcentaje }}{% endfor %}",
      "<p>{{ cantidad(works) }} ({{ cantidad(works) | aLetras }})</p>",
      "{% for obs in observations %}<p>{{ obs | safe }}</p>{% endfor %}",
      "{% set total = 0 %}{% for e in publishers %}{% set total = total + e.percentage %}{% endfor %}",
      "<p>{{ total }}</p><p>{{ authors[0].taxId }}</p>",
    ].join("\n");
    const result = await render(tpl);
    expect(result.marked).toBe(true);
    expect(fields(result.html).length).toBeGreaterThan(10);
    expect(strip(result.html)).toBe(
      await renderHtmlFromTemplate(tpl, data, catalog)
    );
  });

  it("con violaciones se renderiza entera sin marcas y devuelve las violaciones", async () => {
    const tpl = [
      "{% macro nombre(p) %}{% if p.pseudonym %}{{ p.pseudonym }}{% else %}{{ p.name }}{% endif %}{% endmacro %}",
      "<h1>{{ nombre(publishers[0]) | upper }}</h1><p>{{ works | length }}</p><p>{{ titulo }}</p>",
    ].join("\n");
    const result = await render(tpl);
    expect(result.marked).toBe(false);
    expect(result.html).not.toContain("<!--f:");
    expect(result.html).toBe(await renderHtmlFromTemplate(tpl, data, catalog));
    expect(result.warnings).toEqual([
      { line: 1, reason: "etiqueta no permitida: {% macro %}" },
      { line: 2, reason: "llamada fuera del catálogo en {{ }}: nombre()" },
      { line: 2, reason: "filtro no permitido en {{ }}: length" },
    ]);
  });

  it("saca el front-matter como renderHtmlFromTemplate y cuenta las líneas desde el principio", async () => {
    const tpl =
      "---\nlema: fijo\n---\n<p>{{ lema }}</p>\n<p>{{ titulo }}</p>\n<p>{{ total }}</p>";
    const result = await render(tpl);
    expect(strip(result.html)).toBe("<p>fijo</p>\n<p>Contrato</p>\n<p></p>");
    expect(keys(result.html)).toEqual(["titulo"]);
    expect(result.warnings.map((w) => w.line)).toEqual([4, 6]);
  });

  it("una clave que no puede ir dentro de un comentario, o una clave que falla, no cortan el render", async () => {
    const raro: TemplateCatalog = {
      functions: {
        rota: {
          fn: () => "x",
          key: () => {
            throw new Error("sin datos");
          },
        },
      },
    };
    const result = await renderHtmlFromTemplateWithFields(
      "{% set k = 'a b' %}<p>{{ extra[k] }}</p>\n<p>{{ rota() }}</p>",
      { extra: { "a b": "valor" } },
      raro
    );
    expect(result.html).toBe("<p>valor</p>\n<p>x</p>");
    expect(result.warnings).toEqual([
      { line: 1, reason: 'sin clave: "extra.a b" no puede ir en una marca' },
      { line: 2, reason: "sin clave: la clave de rota() falló (sin datos)" },
    ]);
  });
});
