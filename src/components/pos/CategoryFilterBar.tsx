'use client';

import { useMemo } from 'react';
import { CategoryBar } from '@/components/kit/CategoryBar';
import type { PosCategoryDisplayMode, PosCategoryOrderBy } from '@/components/pos/configuracion/configuracionService';
import { categoriasParaBarra, modoBarraCategorias } from '@/lib/pos/venta/catalogoGrilla';

/**
 * Barra de categorías con la API de siempre (la usa mesas «Agregar productos»,
 * `mesas/id/AddProductDialog.tsx`), dibujada con `CategoryBar` del kit (paso 5
 * de POS-PLAN; patrón `inventario/BranchBadge` → `kit/BranchBadgeActiva`).
 *
 * El orden configurado (`pos_categories_display.orderBy`), el color de
 * respaldo y el «Top» salen de src/lib/pos/venta/categorias.ts (L21, L23) vía
 * `categoriasParaBarra`; los tres modos (botones, imágenes, buscador) de
 * `modoBarraCategorias`. La estrella de favorita y su escritura optimista las
 * decide quien pasa `onToggleFavorite`.
 */
export interface CategoryFilterItem {
  id: number;
  name: string;
  icon?: string | null;
  color?: string | null;
  image_url?: string | null;
  display_order?: number;
  rank?: number;
  /** Marcada como favorita de la organización (category_favorites). */
  is_favorite?: boolean;
  /** Unidades vendidas en los últimos 90 días (pos_category_ranking). */
  sales_count_90d?: number;
}

interface CategoryFilterBarProps {
  categories: CategoryFilterItem[];
  selectedCategory: string; // 'all' o id como string
  onSelectCategory: (value: string) => void;
  mode: PosCategoryDisplayMode;
  orderBy?: PosCategoryOrderBy;
  productCounts?: Record<number, number>;
  /** Si se pasa, cada chip muestra una estrella para marcar/desmarcar favorita. */
  onToggleFavorite?: (categoryId: number) => void;
  className?: string;
}

export function CategoryFilterBar({
  categories,
  selectedCategory,
  onSelectCategory,
  mode,
  orderBy = 'display_order',
  onToggleFavorite,
  productCounts,
  className,
}: CategoryFilterBarProps) {
  const categorias = useMemo(() => categoriasParaBarra(categories, orderBy, productCounts), [categories, orderBy, productCounts]);
  const valor = selectedCategory === 'all' || !selectedCategory ? null : Number(selectedCategory);
  return (
    <CategoryBar
      categorias={categorias}
      valor={Number.isFinite(valor) ? valor : null}
      onValorChange={(v) => onSelectCategory(v === null || v === 'favoritas' ? 'all' : String(v))}
      modo={modoBarraCategorias(mode)}
      onFavorita={onToggleFavorite ? (id) => onToggleFavorite(Number(id)) : undefined}
      className={className}
    />
  );
}
