/**
 * Helpers PUROS para componer filtros `or` de PostgREST con texto libre del
 * usuario (F12-misc; hallazgo del tester de F12).
 *
 * En `.or('a.ilike.%x%,b.ilike.%x%')` la coma separa condiciones y los
 * paréntesis agrupan, así que un término con «,», «(» o «)» rompía la petición
 * (PGRST100). PostgREST admite el valor entre comillas dobles, con `\"` y `\\`
 * como únicos escapes: aquí se construye SIEMPRE así, y el término no se
 * mutila (buscar «Pérez, Juan» encuentra a «Pérez, Juan»).
 *
 * Los `.ilike(col, patrón)` / `.eq(...)` de supabase-js NO necesitan esto:
 * viajan como parámetro propio y solo hace falta `likePattern`.
 *
 * Módulo hoja: sin imports, utilizable desde navegador y servidor.
 */

/** Bytes de control (NUL, saltos de línea, etc.): nunca deben viajar en un filtro. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Valor de filtro entre comillas dobles, escapando `\` y `"` (en ese orden).
 * Dentro de las comillas la coma, el punto y los paréntesis son texto normal.
 */
export function quoteFilterValue(value: string): string {
  const clean = value.replace(CONTROL_CHARS, '');
  return `"${clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Patrón `%…%` con los comodines de `like` (`%`, `_`) y la barra escapados, para que la búsqueda sea literal.
 * PostgREST convierte todo `*` en `%` (incluso entrecomillado y aunque vaya como `\*`; verificado
 * contra PostgREST real el 2026-09-16), así que un `*` literal no puede viajar: se sustituye por `_`
 * (un carácter cualquiera, que incluye al propio `*`), la aproximación más estrecha posible.
 */
export function likePattern(query: string): string {
  return `%${query.replace(/[%_\\]/g, (m) => `\\${m}`).replace(/\*/g, '_')}%`;
}

/**
 * `col1.ilike."%q%",col2.ilike."%q%"` listo para `.or(...)`. Cadena vacía si no
 * hay columnas o el término queda vacío tras recortar: el llamador no aplica
 * el filtro en ese caso.
 */
export function ilikeAnyOf(columns: readonly string[], query: string): string {
  const term = query.trim();
  if (!term || columns.length === 0) return '';
  const value = quoteFilterValue(likePattern(term));
  return columns.map((col) => `${col}.ilike.${value}`).join(',');
}
