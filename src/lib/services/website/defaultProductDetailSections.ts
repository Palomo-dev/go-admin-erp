/**
 * Secciones por defecto del detalle de producto (F9.2 — Secciones por defecto).
 *
 * Cuando una plantilla `product_detail` no tiene secciones persistidas en la BD,
 * el editor muestra estas secciones como items virtuales (no editables in-place)
 * con un botón "Materializar" que las persiste como secciones reales.
 *
 * El storefront, mientras tanto, sigue renderizando el fallback monolítico
 * (cero regresión visual). Una vez materializadas, el storefront detecta las
 * secciones reales y las renderiza via SectionRenderer.
 *
 * Los IDs virtuales son estables y prefijados con `default_` para distinguirlos
 * de secciones reales persistidas en la BD.
 */

export interface DefaultSectionDef {
  /** ID virtual estable (no persistido). */
  id: string
  section_type: string
  section_variant: string
  /** Etiqueta legible para mostrar en el sidebar del editor. */
  label: string
  /** Descripción corta opcional. */
  description?: string
}

/**
 * Lista canónica de secciones por defecto del detalle de producto.
 * El orden refleja el layout clásico del fallback monolítico del storefront:
 * galería → info → acciones → beneficios → descripción → relacionados → reviews.
 */
export const DEFAULT_PRODUCT_DETAIL_SECTIONS: DefaultSectionDef[] = [
  {
    id: 'default_product_gallery',
    section_type: 'product_gallery',
    section_variant: 'default',
    label: 'Galería',
    description: 'Carrusel/grid de imágenes del producto',
  },
  {
    id: 'default_product_info',
    section_type: 'product_info',
    section_variant: 'default',
    label: 'Información',
    description: 'SKU, título, reseñas, precio y countdown',
  },
  {
    id: 'default_product_actions',
    section_type: 'product_actions',
    section_variant: 'default',
    label: 'Acciones',
    description: 'Selector de variantes y botón de agregar al carrito',
  },
  {
    id: 'default_product_benefits',
    section_type: 'product_benefits',
    section_variant: 'default',
    label: 'Beneficios',
    description: 'Envío, garantía, empaque y calidad',
  },
  {
    id: 'default_product_description',
    section_type: 'product_description',
    section_variant: 'default',
    label: 'Descripción',
    description: 'Descripción expandible del producto',
  },
  {
    id: 'default_related_products',
    section_type: 'related_products',
    section_variant: 'default',
    label: 'Productos relacionados',
    description: 'Carrusel/grid de productos relacionados',
  },
  {
    id: 'default_product_reviews',
    section_type: 'product_reviews',
    section_variant: 'default',
    label: 'Reseñas',
    description: 'Reseñas del producto',
  },
]

/**
 * Devuelve la lista de secciones por defecto para un page_type dado.
 * Por ahora solo soporta `product_detail`; otros tipos devuelven [].
 */
export function getDefaultSectionsForPageType(pageType: string): DefaultSectionDef[] {
  if (pageType === 'product_detail') {
    return DEFAULT_PRODUCT_DETAIL_SECTIONS
  }
  return []
}
