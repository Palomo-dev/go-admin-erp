/**
 * Reglas puras de Conocimiento (sin React): `__tests__/conocimientoLogica.test.ts`.
 */
import type { KnowledgeFragment } from '@/lib/services/knowledgeService';

type FragmentoMin = Pick<KnowledgeFragment, 'title' | 'content' | 'tags' | 'is_active' | 'has_embedding' | 'usage_count'>;

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Busca en título, contenido y etiquetas (sin tildes ni mayúsculas) y filtra
 * por etiquetas: con varias, el fragmento debe tenerlas TODAS (como en el
 * respaldo del 2026-11-13).
 */
export function filtrarFragmentos<T extends FragmentoMin>(fragmentos: readonly T[], busqueda: string, etiquetas: string | readonly string[] | null): T[] {
  const q = sinTildes(busqueda.trim());
  const pedidas = etiquetas == null ? [] : typeof etiquetas === 'string' ? [etiquetas] : etiquetas;
  return fragmentos.filter((f) => {
    if (pedidas.length && !pedidas.every((e) => (f.tags ?? []).includes(e))) return false;
    if (!q) return true;
    return sinTildes(`${f.title} ${f.content} ${(f.tags ?? []).join(' ')}`).includes(q);
  });
}

/** Todas las etiquetas usadas, sin repetir y en orden alfabético. */
export function etiquetasDeFragmentos(fragmentos: readonly Pick<KnowledgeFragment, 'tags'>[]): string[] {
  return Array.from(new Set(fragmentos.flatMap((f) => f.tags ?? []))).sort((a, b) => a.localeCompare(b));
}

export function resumenFragmentos(fragmentos: readonly FragmentoMin[]) {
  const total = fragmentos.length;
  const activos = fragmentos.filter((f) => f.is_active).length;
  const listos = fragmentos.filter((f) => f.has_embedding).length;
  const usos = fragmentos.reduce((a, f) => a + (f.usage_count ?? 0), 0);
  return { total, activos, listos, usos, pctListos: total ? Math.round((listos / total) * 100) : 0 };
}

/** Límite del contenido de un fragmento (la IA lo usa tal cual; más largo pierde precisión). */
export const MAX_CONTENIDO_FRAGMENTO = 2000;

/** Prioridad 1–10 → tramo para mostrarla («8 · Alta»). */
export function tramoPrioridad(p: number): 'baja' | 'media' | 'alta' {
  if (p >= 7) return 'alta';
  if (p >= 4) return 'media';
  return 'baja';
}

export interface FilaImportacion {
  /** Número de fila (desde 1) en el orden del archivo. */
  fila: number;
  fragmento: { title: string; content: string; tags?: string[]; priority?: number };
  estado: 'lista' | 'faltaTitulo' | 'faltaContenido';
}

/** Estado de cada fila de una importación: las que tienen error no se cargan. */
export function revisarFilasImportacion(fragmentos: readonly FilaImportacion['fragmento'][]): FilaImportacion[] {
  return fragmentos.map((f, i) => ({
    fila: i + 1,
    fragmento: f,
    estado: !f.title?.trim() ? 'faltaTitulo' : !f.content?.trim() ? 'faltaContenido' : 'lista',
  }));
}

export interface FilaNoCargada {
  /** Fila del archivo (desde 1); 0 = error general (la base de datos rechazó el lote). */
  fila: number;
  motivo: 'faltaTitulo' | 'faltaContenido' | 'servidor' | 'general';
  /** Texto del servidor, solo para `servidor`. */
  mensaje?: string;
}

/**
 * Filas que no entraron en una importación: las que la vista previa ya marcó
 * con error (no se envían) y las que rechazó el servidor. El servidor numera
 * sobre lo enviado (solo las válidas): aquí se traduce a la fila del archivo.
 */
export function filasNoCargadas(
  revisadas: readonly FilaImportacion[],
  erroresServidor: readonly { row: number; message: string }[],
): FilaNoCargada[] {
  const enviadas = revisadas.filter((r) => r.estado === 'lista');
  const locales: FilaNoCargada[] = revisadas
    .filter((r): r is FilaImportacion & { estado: 'faltaTitulo' | 'faltaContenido' } => r.estado !== 'lista')
    .map((r) => ({ fila: r.fila, motivo: r.estado }));
  const servidor: FilaNoCargada[] = erroresServidor.map((e) =>
    e.row > 0 ? { fila: enviadas[e.row - 1]?.fila ?? e.row, motivo: 'servidor', mensaje: e.message } : { fila: 0, motivo: 'general' },
  );
  return [...locales, ...servidor].sort((a, b) => a.fila - b.fila);
}
