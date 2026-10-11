// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

import * as templateFields from "../../../src/common/utils/templateFields";
import * as htmlFromTemplate from "../../../src/common/utils/htmlFromTemplate";
import type {
  CatalogFunction,
  TemplateCatalog,
  TemplateWarning,
} from "../../../src/common/utils/htmlFromTemplate";

describe("templateFields: API pública", () => {
  it("el barrel exporta todo el módulo", () => {
    expect(typeof templateFields.createEnvironment).toBe("function");
    expect(typeof templateFields.buildPathIndex).toBe("function");
    expect(typeof templateFields.validateTemplate).toBe("function");
    expect(typeof templateFields.renderHtmlFromTemplateWithFields).toBe(
      "function"
    );
    expect(templateFields.BUILTIN_FORMAT_FILTERS).toContain("formatDate");
  });

  it("htmlFromTemplate reexporta el render con marcas y sus tipos", async () => {
    const doble: CatalogFunction = {
      fn: (n: number) => n * 2,
      key: () => "@doble",
    };
    const catalog: TemplateCatalog = { functions: { doble } };
    expect(htmlFromTemplate.renderHtmlFromTemplateWithFields).toBe(
      templateFields.renderHtmlFromTemplateWithFields
    );
    const result = await htmlFromTemplate.renderHtmlFromTemplateWithFields(
      "<p>{{ a.b }} {{ doble(2) }}</p>",
      { a: { b: "x" } },
      catalog
    );
    const warnings: TemplateWarning[] = result.warnings;
    expect(warnings).toEqual([]);
    expect(result.html).toBe(
      "<p><!--f:1 a.b-->x<!--/f:1--> <!--f:2 @doble-->4<!--/f:2--></p>"
    );
  });
});
