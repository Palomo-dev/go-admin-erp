/** Lógica pura del inspector de encabezado (sin React ni servicios). */

/**
 * ENCABE-80: un solo interruptor «Sobre la portada». Encender pone la composición transparente y
 * `header_transparent_over_hero`; apagar suelta la clave y, si era transparente, vuelve a la composición base.
 * Configs viejas con `header_transparent_over_hero: true` sobre otra composición se ven encendidas.
 */
export function cambioSobrePortada(a: Record<string, unknown>, v: boolean, composicionBase: string): Record<string, unknown> {
  if (v) return { header_style: 'transparent', header_transparent_over_hero: true };
  const cambio: Record<string, unknown> = { header_transparent_over_hero: null };
  if (a.header_style === 'transparent') cambio.header_style = composicionBase === 'transparent' ? 'default' : composicionBase;
  return cambio;
}

/** ENCABE-76: «Al bajar» une `header_sticky` (fijo sí/no) y `header_scroll` (ocultar/encoger) en una opción. */
export const MODOS_AL_BAJAR = ['normal', 'fijo', 'ocultar_al_bajar', 'encoger', 'ocultar_y_encoger'] as const;
export function modoAlBajar(a: Record<string, unknown>): string {
  if (a.header_sticky === false) return 'normal';
  const s = a.header_scroll;
  return typeof s === 'string' && (MODOS_AL_BAJAR as readonly string[]).includes(s) && s !== 'normal' ? s : 'fijo';
}
export function cambioAlBajar(v: string): Record<string, unknown> {
  if (v === 'normal') return { header_sticky: false, header_scroll: null };
  if (v === 'fijo') return { header_sticky: true, header_scroll: null };
  return { header_sticky: true, header_scroll: v };
}

