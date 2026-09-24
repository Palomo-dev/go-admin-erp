/**
 * Barra de categorías del POS (`src/components/pos/CategoryFilterBar.tsx`),
 * L21 y L23 del plan. Extracción literal del orden, el color de respaldo y la
 * marca «Top» de cada categoría.
 */
import type { PosCategoryOrderBy } from '@/components/pos/configuracion/configuracionService';

export interface CategoriaOrdenable {
  id: number;
  name: string;
  color?: string | null;
  display_order?: number;
  rank?: number;
  /** Marcada como favorita de la organización (category_favorites). */
  is_favorite?: boolean;
  /** Unidades vendidas en los últimos 90 días (pos_category_ranking). */
  sales_count_90d?: number;
}

// Paleta usada como respaldo únicamente cuando la categoría no tiene color asignado,
// para que se distingan visualmente entre sí sin inventar un significado.
const FALLBACK_COLORS = ['#3B82F6', '#F97316', '#10B981', '#EC4899', '#8B5CF6', '#EAB308', '#EF4444', '#06B6D4', '#84CC16', '#F43F5E'];

function hashId(id: number): number {
  return Math.abs(id * 2654435761) % 2147483647;
}

/**
 * Respeta siempre el color real configurado en la categoría (Inventario →
 * Categorías). Solo se usa un color de respaldo determinístico si la categoría
 * no tiene color asignado.
 */
export function colorDeCategoria(cat: Pick<CategoriaOrdenable, 'id' | 'color'>): string {
  if (cat.color) return cat.color;
  return FALLBACK_COLORS[hashId(cat.id) % FALLBACK_COLORS.length];
}

/** «Top»: vendió algo en los últimos 90 días (el tooltip dice cuántas unidades). */
export function esCategoriaTop(cat: Pick<CategoriaOrdenable, 'sales_count_90d'>): boolean {
  return (cat.sales_count_90d ?? 0) > 0;
}

export function ordenarCategorias<T extends CategoriaOrdenable>(categories: T[], orderBy: PosCategoryOrderBy = 'display_order'): T[] {
  const sorted = [...categories];
  if (orderBy === 'favorites') {
    // Favoritas primero, luego las más vendidas (90 días), luego el orden manual.
    // Mismo criterio que el ranking de productos del POS.
    sorted.sort((a, b) =>
      Number(b.is_favorite ?? false) - Number(a.is_favorite ?? false) ||
      (b.sales_count_90d ?? 0) - (a.sales_count_90d ?? 0) ||
      (a.display_order ?? 0) - (b.display_order ?? 0)
    );
  } else if (orderBy === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (orderBy === 'rank') {
    sorted.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  } else {
    sorted.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || (a.rank ?? 0) - (b.rank ?? 0));
  }
  return sorted;
}
