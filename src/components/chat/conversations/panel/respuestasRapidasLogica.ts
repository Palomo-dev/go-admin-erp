/**
 * Búsqueda del panel de respuestas rápidas de la conversación: título,
 * contenido, atajo y etiquetas, sin distinguir tildes ni mayúsculas. Puro.
 */
export interface RespuestaRapidaPanel {
  id: string;
  title: string;
  content: string;
  shortcut?: string | null;
  tags?: string[] | null;
  usage_count?: number | null;
}

function normalizar(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filtrarRespuestasRapidas<R extends RespuestaRapidaPanel>(respuestas: readonly R[], termino: string): R[] {
  const q = normalizar(termino).trim().replace(/^\//, '');
  if (!q) return [...respuestas];
  return respuestas.filter((r) => [r.title, r.content, r.shortcut, ...(r.tags ?? [])].some((v) => normalizar(v).includes(q)));
}
