'use client';

import * as LucideIcons from 'lucide-react';
import { Package, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SearchSelect } from '@/components/ui/search-select';
import { cn } from '@/utils/Utils';
import type { PosCategoryDisplayMode, PosCategoryOrderBy } from '@/components/pos/configuracion/configuracionService';
import { useDragScroll } from '@/hooks/useDragScroll';

// Paleta usada como respaldo únicamente cuando la categoría no tiene color asignado,
// para que se distingan visualmente entre sí sin inventar un significado.
const FALLBACK_COLORS = ['#3B82F6', '#F97316', '#10B981', '#EC4899', '#8B5CF6', '#EAB308', '#EF4444', '#06B6D4', '#84CC16', '#F43F5E'];

function hashId(id: number): number {
  return Math.abs(id * 2654435761) % 2147483647;
}

function getCategoryColor(cat: CategoryFilterItem): string {
  // Respeta siempre el color real configurado en la categoría (Inventario → Categorías).
  // Solo se usa un color de respaldo determinístico si la categoría no tiene color asignado.
  if (cat.color) return cat.color;
  return FALLBACK_COLORS[hashId(cat.id) % FALLBACK_COLORS.length];
}

function getCategoryIcon(cat: CategoryFilterItem) {
  // Solo se usa el icono configurado en la categoría. Sin icono configurado,
  // se muestra un icono genérico neutro (Package) en vez de uno temático que
  // podría no tener relación con el rubro del negocio.
  if (cat.icon && (LucideIcons as any)[cat.icon]) return (LucideIcons as any)[cat.icon];
  return Package;
}

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

function sortCategories(categories: CategoryFilterItem[], orderBy: PosCategoryOrderBy = 'display_order') {
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
  const sortedCategories = sortCategories(categories, orderBy);
  const dragScroll = useDragScroll<HTMLDivElement>();

  if (mode === 'searchselect') {
    return (
      <SearchSelect
        options={sortedCategories.map((cat) => ({ value: cat.id.toString(), label: cat.name }))}
        value={selectedCategory}
        onValueChange={onSelectCategory}
        placeholder="Categorías"
        searchPlaceholder="Buscar categoría..."
        emptyText="No se encontraron categorías"
        noneLabel="Todas las categorías"
        noneValue="all"
        className={className}
      />
    );
  }

  if (mode === 'images') {
    return (
      <div
        ref={dragScroll.ref}
        onPointerDown={dragScroll.onPointerDown}
        onPointerMove={dragScroll.onPointerMove}
        onPointerUp={dragScroll.onPointerUp}
        onPointerLeave={dragScroll.onPointerLeave}
        onClickCapture={dragScroll.onClickCapture}
        className={cn('flex gap-2 overflow-x-auto pb-2 scrollbar-hide cursor-grab active:cursor-grabbing select-none', className)}
      >
        <button
          type="button"
          onClick={() => onSelectCategory('all')}
          className={cn(
            'relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 flex items-center justify-center bg-gray-100 dark:bg-gray-800 transition-all',
            selectedCategory === 'all' ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-200 dark:border-gray-700'
          )}
        >
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Todas</span>
        </button>
        {sortedCategories.map((cat) => {
          const color = getCategoryColor(cat);
          return (
            <div key={cat.id} className="relative shrink-0">
            {onToggleFavorite && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(cat.id); }}
                aria-label={cat.is_favorite ? `Quitar ${cat.name} de favoritas` : `Marcar ${cat.name} como favorita`}
                title={cat.is_favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
                className="absolute top-1 right-1 z-10 p-0.5 rounded-full bg-white/80 dark:bg-gray-900/80"
              >
                <Star className={cn('h-3.5 w-3.5', cat.is_favorite ? 'fill-current text-amber-500' : 'text-gray-400')} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onSelectCategory(cat.id.toString())}
              className={cn(
                'relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition-all',
                selectedCategory === cat.id.toString() ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-200 dark:border-gray-700'
              )}
              style={!cat.image_url ? { backgroundColor: `${color}25` } : undefined}
            >
              {cat.image_url ? (
                <img src={cat.image_url} alt={cat.name} draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
              ) : null}
              <div className={cn(
                'absolute inset-0 flex items-end p-1',
                cat.image_url ? 'bg-gradient-to-t from-black/70 via-black/10 to-transparent' : ''
              )}>
                <span className={cn(
                  'text-[0.65rem] font-semibold leading-tight break-words whitespace-normal',
                  cat.image_url ? 'text-white' : 'text-gray-800 dark:text-gray-100'
                )} style={!cat.image_url ? { color } : undefined}>
                  {cat.name}
                </span>
              </div>
            </button>
            </div>
          );
        })}
      </div>
    );
  }

  // mode === 'buttons'
  return (
    <div
      ref={dragScroll.ref}
      onPointerDown={dragScroll.onPointerDown}
      onPointerMove={dragScroll.onPointerMove}
      onPointerUp={dragScroll.onPointerUp}
      onPointerLeave={dragScroll.onPointerLeave}
      onClickCapture={dragScroll.onClickCapture}
      className={cn('flex gap-2 overflow-x-auto pb-2 scrollbar-hide cursor-grab active:cursor-grabbing select-none', className)}
    >
      <button
        type="button"
        onClick={() => onSelectCategory('all')}
        className={cn(
          'shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border transition-colors',
          selectedCategory === 'all'
            ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400'
        )}
      >
        Todas
        {productCounts && (
          <Badge variant="outline" className="text-[0.6rem] px-1">
            {Object.values(productCounts).reduce((a, b) => a + b, 0)}
          </Badge>
        )}
      </button>
      {sortedCategories.map((cat) => {
        const IconComp = getCategoryIcon(cat);
        const isSelected = selectedCategory === cat.id.toString();
        const color = getCategoryColor(cat);
        const esTop = (cat.sales_count_90d ?? 0) > 0;
        return (
          // Envoltorio: un <button> no puede contener otro <button>, así que la
          // estrella de favorito va como hermano del chip, no dentro.
          <div key={cat.id} className="relative shrink-0">
            <button
              type="button"
              onClick={() => onSelectCategory(cat.id.toString())}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border transition-colors',
                onToggleFavorite && 'pr-8'
              )}
              style={isSelected
                ? { backgroundColor: color, borderColor: color, color: '#fff' }
                : { backgroundColor: `${color}15`, borderColor: `${color}40`, color }}
              title={esTop ? `${cat.sales_count_90d} unidades vendidas en los últimos 90 días` : undefined}
            >
              {IconComp && <IconComp className="h-3.5 w-3.5" />}
              {cat.name}
              {esTop && (
                <Badge variant="outline" className="text-[0.6rem] px-1 border-current">Top</Badge>
              )}
              {productCounts && productCounts[cat.id] !== undefined && (
                <Badge variant="outline" className="text-[0.6rem] px-1 border-current">
                  {productCounts[cat.id]}
                </Badge>
              )}
            </button>
            {onToggleFavorite && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(cat.id); }}
                aria-label={cat.is_favorite ? `Quitar ${cat.name} de favoritas` : `Marcar ${cat.name} como favorita`}
                title={cat.is_favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
              >
                <Star
                  className={cn('h-3.5 w-3.5', cat.is_favorite ? 'fill-current text-amber-500' : 'opacity-50')}
                  style={!cat.is_favorite ? { color: isSelected ? '#fff' : color } : undefined}
                />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
