import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';

/** Estilos de categorías que en la tienda leen `desktop_layout` con solo Grid o Carrusel. */
const CON_CARRUSEL = ['pill', 'circle'];
/** Estilos nuevos que la tienda pinta sin leer `desktop_layout`: la opción no se muestra. */
const SIN_LAYOUT = ['card_bottom', 'bento', 'minimal_icon'];

/**
 * «Layout en escritorio» de la rejilla de categorías según «Estilo de las categorías».
 * - Sin estilo o «Superpuesto»: el campo de siempre (Grid, Carrusel, Lista).
 * - «Pastilla» o «Círculo»: solo Grid y Carrusel (EstilosCategoria en la web).
 * - Tarjeta, Mosaico, Ícono suave: `null` (la tienda no lo lee).
 * Cualquier otro campo o sección se devuelve igual.
 */
export function campoLayoutCategorias(
  campo: ContentFieldDef,
  contenido: Record<string, unknown>,
  tipoSeccion: string,
): ContentFieldDef | null {
  if (tipoSeccion !== 'categories_grid' || campo.key !== 'desktop_layout') return campo;
  const estilo = contenido?.category_style;
  if (typeof estilo === 'string' && SIN_LAYOUT.includes(estilo)) return null;
  if (typeof estilo === 'string' && CON_CARRUSEL.includes(estilo)) {
    return { ...campo, options: (campo.options ?? []).filter((o) => o.value === 'grid' || o.value === 'carousel') };
  }
  return campo;
}
