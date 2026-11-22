/**
 * Páginas del selector de la barra del editor («Sitio principal / [Inicio ▾]»).
 *
 * Dos grupos, cada uno en el orden del documento:
 * - las páginas del sitio (Inicio primero, como las lista Páginas);
 * - las plantillas de la tienda (ficha de producto, página de categoría, carrito…), que Páginas no
 *   lista (`esPlantillaTienda`). La ficha de producto viene en todo sitio principal
 *   (`asegurarFichaProducto`), así que aquí se abre junto a Inicio y las demás.
 * Cada una con el icono de su tipo (`iconoPaginaEditor`). Puro: lo prueban los tests.
 */
import type { LucideIcon } from 'lucide-react';
import { esInicio, esPlantillaTienda } from '@/components/sitio-web/paginas/tipoPagina';
import { iconoPaginaEditor } from '@/components/sitio-web/paginas/iconosPagina';

export interface PaginaSelector {
  id: string;
  title: string;
  /** `page_type` de la página (V2: `pagina.tipo`). Sin él se trata como página del sitio. */
  tipo?: string | null;
  slug?: string | null;
}

export interface OpcionPaginaSelector {
  id: string;
  title: string;
  icono: LucideIcon;
}

export interface GruposPaginasSelector {
  sitio: OpcionPaginaSelector[];
  tienda: OpcionPaginaSelector[];
}

export function gruposPaginasSelector(paginas: readonly PaginaSelector[]): GruposPaginasSelector {
  const sitio: (OpcionPaginaSelector & { inicio: boolean })[] = [];
  const tienda: OpcionPaginaSelector[] = [];
  for (const p of paginas) {
    const tipificable = { tipo: p.tipo ?? '', slug: p.slug ?? '' };
    const opcion = { id: p.id, title: p.title, icono: iconoPaginaEditor(tipificable) };
    if (p.tipo && esPlantillaTienda(tipificable)) tienda.push(opcion);
    else sitio.push({ ...opcion, inicio: esInicio(tipificable) });
  }
  // Inicio primero; las demás, en su orden (sort estable).
  sitio.sort((a, b) => Number(b.inicio) - Number(a.inicio));
  return { sitio: sitio.map((o) => ({ id: o.id, title: o.title, icono: o.icono })), tienda };
}
