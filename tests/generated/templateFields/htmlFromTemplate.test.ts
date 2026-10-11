// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

import { renderHtmlFromTemplate } from "../../../src/common/utils/htmlFromTemplate";
import type { TemplateCatalog } from "../../../src/common/utils/templateFields/types";

describe("renderHtmlFromTemplate", () => {
  it("escapa los valores y respeta | safe", async () => {
    const html = await renderHtmlFromTemplate(
      "<p>{{ nombre }}</p><div>{{ obs | safe }}</div>",
      { nombre: 'Pérez & "Hijos" <SA>', obs: "<b>ok</b>" }
    );
    expect(html).toBe(
      "<p>Pérez &amp; &quot;Hijos&quot; &lt;SA&gt;</p><div><b>ok</b></div>"
    );
  });

  it("registra aLetras y formatDate", async () => {
    const html = await renderHtmlFromTemplate(
      "{{ n | aLetras }} / {{ f | formatDate('dd/MM/yyyy') }}",
      { n: 25, f: "2026-09-30T12:00:00Z" }
    );
    expect(html).toBe("veinticinco / 30/09/2026");
  });

  it("combina el front-matter con los datos (los datos ganan)", async () => {
    const html = await renderHtmlFromTemplate(
      "---\ntitulo: Del front-matter\nlema: fijo\n---\n{{ titulo }} | {{ lema }}",
      { titulo: "De los datos" }
    );
    expect(html).toBe("De los datos | fijo");
  });

  it("con catálogo registra sus filtros y funciones; sin catálogo no existen", async () => {
    const catalog: TemplateCatalog = {
      filters: {
        porcentaje: (v: unknown) =>
          `${Number(v || 0)
            .toFixed(2)
            .replace(".", ",")}%`,
      },
      functions: {
        nombre: {
          fn: (p: { name: string; pseudonym?: string }) =>
            p.pseudonym?.trim() || p.name,
        },
      },
    };
    const tpl = "{{ nombre(p) }}: {{ p.pct | porcentaje }}";
    const data = { p: { name: "Ediciones Sur", pseudonym: "  ", pct: 15 } };
    await expect(renderHtmlFromTemplate(tpl, data, catalog)).resolves.toBe(
      "Ediciones Sur: 15,00%"
    );
    const errorLog = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(renderHtmlFromTemplate(tpl, data)).rejects.toThrow(/nombre/);
    errorLog.mockRestore();
  });
});
