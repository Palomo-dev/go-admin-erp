/**
 * Escape de HTML del motor de documentos.
 *
 * Todo texto que venga de la base (nombres, direcciones, descripciones,
 * notas, números de documento) o de los mensajes traducidos pasa por
 * `escaparHtml` antes de entrar en la plantilla. Las plantillas viejas
 * interpolaban crudo (1 de 14 escapaba): una descripción de producto con
 * `<img onerror=…>` se ejecutaba en la ventana de impresión.
 */

const ENTIDADES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/** Escapa texto para contenido y atributos HTML. `null`/`undefined` → ''. */
export function escaparHtml(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/[&<>"'`]/g, (c) => ENTIDADES[c] ?? c);
}

/** Color hex de 6 dígitos (`#1a2b3c`) o null. Nada más entra en el CSS. */
export function colorHexSeguro(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return /^#[0-9a-fA-F]{6}$/.test(limpio) ? limpio.toLowerCase() : null;
}

/** `data:` URI de imagen rasterizada (png/jpeg/webp/gif, base64). Nada de SVG ni URLs remotas. */
export function dataUriImagenSeguro(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(valor) ? valor : null;
}

/**
 * Nombre de archivo seguro para `Content-Disposition`: ASCII sin separadores
 * ni comillas. Los acentos se quitan (`Cotización` → `Cotizacion`).
 */
export function nombreArchivoSeguro(valor: string, respaldo = 'documento'): string {
  const limpio = valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 80);
  return limpio || respaldo;
}
