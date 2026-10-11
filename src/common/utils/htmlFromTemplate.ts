import matter from "gray-matter";
import { createEnvironment } from "./templateFields/environment";
import type { TemplateCatalog } from "./templateFields/types";

export { renderHtmlFromTemplateWithFields } from "./templateFields";
export type {
  TemplateCatalog,
  CatalogFunction,
  TemplateWarning,
} from "./templateFields";

interface TemplateData {
  [key: string]: any;
}

/**
 * Renderiza un template HTML de Nunjucks con datos JSON.
 *
 * @param templateString El string del template HTML con sintaxis Nunjucks.
 * @param jsonData El objeto JSON con los datos para el template.
 * @param catalog Filtros y funciones extra del proyecto. Sin catálogo, el
 *   render es el de siempre.
 * @returns Una promesa que se resuelve con el string HTML renderizado.
 */
export async function renderHtmlFromTemplate(
  templateString: string,
  jsonData: TemplateData,
  catalog?: TemplateCatalog
): Promise<string> {
  try {
    const { content: templateContent, data: frontMatterData } =
      matter(templateString);
    const combinedData: TemplateData = { ...frontMatterData, ...jsonData };

    const env = createEnvironment(catalog);
    return env.renderString(templateContent, combinedData);
  } catch (error) {
    // Log the error with more details if possible
    if (error instanceof Error) {
      console.error(`Error during Nunjucks rendering: ${error.message}`);
      console.error(error.stack);
    } else {
      console.error(
        "An unknown error occurred during Nunjucks rendering:",
        error
      );
    }
    throw error; // Re-throw the error so the caller can handle it
  }
}
