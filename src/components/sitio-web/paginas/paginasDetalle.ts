/**
 * «Crear ficha editable» y «Crear página editable» (Figma 16 Sitio web › 15 · Tienda,
 * 2700:57498; aprobado por el dueño el 2026-11-21).
 *
 * Un sitio sin `plantillas/product-detail` muestra cada producto con el diseño por defecto de la
 * tienda y el editor no tiene dónde abrir la ficha (pasaba en 16 de 19 sitios). Esta operación
 * agrega al borrador la ficha —o la página de categoría— con los MISMOS bloques que la tienda pinta
 * por defecto, en su orden, y nada más del sitio cambia. Pura: no muta la entrada; la aplica
 * `aplicarAlBorrador` (permiso, versión y guardado con historial).
 */
import { LIMITES_DOCUMENTO, type DocumentoSitio, type PaginaSitio, type SeccionSitio } from '@/lib/website/contrato/documentoSitio';
import { DEFAULT_PRODUCT_DETAIL_SECTIONS } from '@/lib/services/website/defaultProductDetailSections';
import type { GenerarId } from './operacionesMenu';
import type { ResultadoPagina } from './operacionesPagina';

export const TIPOS_PAGINA_DETALLE = ['product_detail', 'category_detail'] as const;
export type TipoPaginaDetalle = (typeof TIPOS_PAGINA_DETALLE)[number];

export function esTipoPaginaDetalle(valor: unknown): valor is TipoPaginaDetalle {
  return typeof valor === 'string' && (TIPOS_PAGINA_DETALLE as readonly string[]).includes(valor);
}

/** Dirección canónica que la tienda busca para cada tipo (`getPlantillaPublica`). */
export const SLUG_PAGINA_DETALLE: Readonly<Record<TipoPaginaDetalle, string>> = {
  product_detail: 'plantillas/product-detail',
  category_detail: 'plantillas/category-detail',
};

const TITULO_PAGINA_DETALLE: Readonly<Record<TipoPaginaDetalle, string>> = {
  product_detail: 'Ficha de producto',
  category_detail: 'Página de categoría',
};

type Bloque = readonly [tipo: string, variante: string, contenido?: Record<string, unknown>];

/**
 * Bloques por defecto. Ficha: los de `DEFAULT_PRODUCT_DETAIL_SECTIONS` (el diseño que la tienda
 * pinta sin plantilla). Categoría: encabezado, filtros y cuadrícula, como las plantillas de tienda.
 */
export const BLOQUES_PAGINA_DETALLE: Readonly<Record<TipoPaginaDetalle, readonly Bloque[]>> = {
  product_detail: DEFAULT_PRODUCT_DETAIL_SECTIONS.map((s) => [s.section_type, s.section_variant] as const),
  category_detail: [
    ['category_header', 'default', { show_image: false, show_breadcrumb: true, show_count: true }],
    ['category_filters', 'default', { show_sort: true, show_view_toggle: true, subcategory_style: 'chips' }],
    ['category_products', 'default', { columns: 4 }],
  ],
};

/** La página de ese tipo que ya tiene el borrador (la de la dirección canónica primero). */
export function paginaDetalleExistente(documento: DocumentoSitio, tipo: TipoPaginaDetalle): PaginaSitio | null {
  const candidatas = documento.paginas.filter((p) => p.tipo === tipo);
  return candidatas.find((p) => p.slug === SLUG_PAGINA_DETALLE[tipo]) ?? candidatas[0] ?? null;
}

/** Tipos de detalle que el borrador todavía no tiene. */
export function tiposDetalleFaltantes(documento: DocumentoSitio): TipoPaginaDetalle[] {
  return TIPOS_PAGINA_DETALLE.filter((t) => !paginaDetalleExistente(documento, t));
}

/**
 * Crea la página de detalle. Si ya existe no la duplica: devuelve la que hay (el botón se pudo
 * pulsar en dos pestañas). Si la dirección canónica la ocupa una página de otro tipo, error.
 */
export function crearPaginaDetalle(documento: DocumentoSitio, tipo: TipoPaginaDetalle, generarId: GenerarId): ResultadoPagina {
  const existente = paginaDetalleExistente(documento, tipo);
  if (existente) return { ok: true, documento, paginaId: existente.id, creadas: 0 };
  if (documento.paginas.length >= LIMITES_DOCUMENTO.paginasMaximas) return { ok: false, error: 'limite_paginas' };
  const slug = SLUG_PAGINA_DETALLE[tipo];
  if (documento.paginas.some((p) => p.slug === slug)) return { ok: false, error: 'slug_repetido' };
  const secciones: SeccionSitio[] = BLOQUES_PAGINA_DETALLE[tipo].map(([t, variante, contenido]) => ({
    id: generarId(),
    tipo: t,
    variante,
    version: 1,
    contenido: { ...(contenido ?? {}) },
    diseno: {},
    visibilidad: { movil: true, escritorio: true },
  }));
  const pagina: PaginaSitio = { id: generarId(), slug, tipo, titulo: TITULO_PAGINA_DETALLE[tipo], publicada: true, secciones };
  return { ok: true, documento: { ...documento, paginas: [...documento.paginas, pagina] }, paginaId: pagina.id, creadas: 1 };
}
