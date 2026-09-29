/**
 * Texto plano de un valor que puede venir con HTML (descripciones guardadas
 * por el editor enriquecido del catálogo). Nunca se pinta como HTML: se
 * quitan etiquetas, bloques `script`/`style` y las entidades comunes.
 *
 * Módulo hoja: sin imports, para navegador, servidor y pruebas.
 */
export function textoSinHtml(valor: string | null | undefined, maximo = 400): string {
  if (!valor) return '';
  const texto = valor
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h\d)>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return texto.length > maximo ? `${texto.slice(0, maximo - 1).trimEnd()}…` : texto;
}
