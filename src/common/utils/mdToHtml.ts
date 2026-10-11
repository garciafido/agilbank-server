import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: true, // Permite etiquetas HTML dentro del Markdown
  linkify: true, // Autodetecta enlaces
  typographer: true, // Habilita sustituciones tipográficas inteligentes
  xhtmlOut: true,
  breaks: true,
});

/**
 * Convierte un string de Markdown a un string HTML usando markdown-it.
 * @param markdownString El string de Markdown a convertir.
 * @returns El string HTML resultante.
 */
export function convertMdToHtml(markdownString: string): string {
  return md.render(markdownString);
}
