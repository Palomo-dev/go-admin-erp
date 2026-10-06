/**
 * Diferencias entre el borrador V2 y la revisión publicada (Figma A/02a «Cambios
 * en borrador · 3 · Inicio, Carta y estilo del sitio»; «Revisar cambios»;
 * DialogoPublicar del editor). Puro: sin React, Next ni Supabase.
 *
 * Cuenta cambios por ÁREA, no por campo: cada página (por id) añadida, quitada
 * o editada es un cambio; el tema («estilo del sitio»), la identidad (logo y
 * nombre), el SEO, el contenido del negocio, los menús y el encabezado/pie son
 * un cambio cada uno. Es la granularidad que la persona reconoce («Inicio»,
 * «Carta», «estilo del sitio»), no la del JSON.
 */
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { esVacio, igualesEstructural } from './mapeoAjustes';

export type AreaCambio =
  | { tipo: 'pagina'; id: string; titulo: string; accion: 'nueva' | 'editada' | 'quitada' }
  | { tipo: 'tema' | 'identidad' | 'seo' | 'contenido' | 'menus' | 'shell' };

export interface DiferenciasDocumento {
  cantidad: number;
  areas: AreaCambio[];
}

const AREAS_GLOBALES = ['tema', 'identidad', 'seo', 'contenido', 'menus', 'shell'] as const;

/**
 * `publicado = null` (nunca se publicó): todo el borrador es nuevo; se cuenta
 * cada página y cada área global con contenido.
 */
export function diferenciasDocumento(borrador: DocumentoSitio | null, publicado: DocumentoSitio | null): DiferenciasDocumento {
  if (!borrador) return { cantidad: 0, areas: [] };
  const areas: AreaCambio[] = [];
  const paginasPublicadas = new Map((publicado?.paginas ?? []).map((p) => [p.id, p]));
  const idsBorrador = new Set<string>();

  for (const pagina of borrador.paginas) {
    idsBorrador.add(pagina.id);
    const anterior = paginasPublicadas.get(pagina.id);
    if (!anterior) areas.push({ tipo: 'pagina', id: pagina.id, titulo: pagina.titulo, accion: 'nueva' });
    else if (!igualesEstructural(anterior, pagina)) areas.push({ tipo: 'pagina', id: pagina.id, titulo: pagina.titulo, accion: 'editada' });
  }
  for (const [id, pagina] of Array.from(paginasPublicadas.entries())) {
    if (!idsBorrador.has(id)) areas.push({ tipo: 'pagina', id, titulo: pagina.titulo, accion: 'quitada' });
  }

  for (const area of AREAS_GLOBALES) {
    const antes = publicado ? publicado[area] : undefined;
    const ahora = borrador[area];
    if (!publicado) {
      if (!esVacio(ahora)) areas.push({ tipo: area });
    } else if (!igualesEstructural(antes, ahora)) {
      areas.push({ tipo: area });
    }
  }
  return { cantidad: areas.length, areas };
}

