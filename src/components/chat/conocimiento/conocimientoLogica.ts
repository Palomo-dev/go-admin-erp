/**
 * Reglas puras de Conocimiento (sin React): `__tests__/conocimientoLogica.test.ts`.
 */
import type { KnowledgeFragment } from '@/lib/services/knowledgeService';

type FragmentoMin = Pick<KnowledgeFragment, 'title' | 'content' | 'tags' | 'is_active' | 'has_embedding' | 'usage_count'>;

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca en título, contenido y etiquetas (sin tildes ni mayúsculas) y filtra por etiqueta. */
export function filtrarFragmentos<T extends FragmentoMin>(fragmentos: readonly T[], busqueda: string, etiqueta: string | null): T[] {
  const q = sinTildes(busqueda.trim());
  return fragmentos.filter((f) => {
    if (etiqueta && !(f.tags ?? []).includes(etiqueta)) return false;
    if (!q) return true;
    return sinTildes(`${f.title} ${f.content} ${(f.tags ?? []).join(' ')}`).includes(q);
  });
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
