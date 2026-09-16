/**
 * GO Assistant — utilidades de voz (F5).
 */

/** Tope de caracteres por lectura: más es caro y nadie lo escucha entero. */
export const MAX_TTS_CHARS = 2000;

/**
 * Markdown → texto decible. Los asteriscos, las almohadillas y los enlaces se
 * leen fatal en voz alta.
 */
export function textoDecible(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TTS_CHARS);
}

