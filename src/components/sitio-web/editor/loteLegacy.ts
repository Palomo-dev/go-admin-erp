/**
 * Arma el lote de «Guardar y publicar» (sitios sin borrador V2) a partir de los cambios
 * pendientes del editor. Lógica pura: el envío y los permisos son del servidor
 * (`POST /api/sitio-web/editor/guardar`).
 */
import {
  AJUSTES_PROHIBIDOS,
  CAMPOS_MENU,
  CAMPOS_PAGINA,
  CAMPOS_SECCION,
  type LoteLegacy,
} from '@/lib/website/editorLegacy';

interface SeccionMinima {
  id: string;
  section_type: string;
  content?: Record<string, unknown> | null;
}

export interface PendientesLegacy {
  pagina: { id: string; sections: SeccionMinima[] };
  sedeId: number | null;
  secciones: Map<string, Record<string, unknown>>;
  paginaCambios: Record<string, unknown>;
  paginaAjustes: Record<string, unknown> | null;
  ajustes: Record<string, unknown>;
  menus: Map<string, Record<string, unknown>>;
}

function filtrar(o: Record<string, unknown>, permitidas: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([k, v]) => permitidas.includes(k) && v !== undefined));
}

/** Galería, testimonios y preguntas frecuentes se copian a `website_settings` (como siempre). */
export function sincronizacionContenido(secciones: SeccionMinima[]): Record<string, unknown> {
  const sync: Record<string, unknown> = {};
  for (const s of secciones) {
    const c = s.content ?? {};
    const items = s.section_type === 'gallery' ? c.images ?? c.items : c.items;
    if (!Array.isArray(items)) continue;
    if (s.section_type === 'gallery') sync.gallery_images = items;
    else if (s.section_type === 'testimonials') sync.testimonials = items;
    else if (s.section_type === 'faq') sync.faq_items = items;
  }
  return sync;
}

export function armarLoteLegacy(p: PendientesLegacy): LoteLegacy {
  const pagina = filtrar(p.paginaCambios, CAMPOS_PAGINA);
  if (p.paginaAjustes !== null) pagina.page_settings = p.paginaAjustes;
  const ajustes = Object.fromEntries(
    Object.entries({ ...p.ajustes, ...sincronizacionContenido(p.pagina.sections) }).filter(
      ([k, v]) => !(AJUSTES_PROHIBIDOS as readonly string[]).includes(k) && v !== undefined,
    ),
  );
  return {
    paginaId: p.pagina.id,
    sedeId: p.sedeId,
    secciones: Array.from(p.secciones.entries())
      .map(([id, cambios]) => ({ id, cambios: filtrar(cambios, CAMPOS_SECCION) }))
      .filter((s) => Object.keys(s.cambios).length > 0),
    orden: p.pagina.sections.map((s) => s.id),
    pagina,
    ajustes,
    menus: Array.from(p.menus.entries())
      .map(([id, cambios]) => ({ id, cambios: filtrar(cambios, CAMPOS_MENU) }))
      .filter((m) => Object.keys(m.cambios).length > 0),
  };
}
