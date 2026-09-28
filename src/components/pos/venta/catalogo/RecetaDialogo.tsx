'use client';

import { ChefHat } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PanelAdaptable } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProductRecipe } from '@/lib/services/recipeService';

/**
 * Receta de producción de un producto del grid (L24, solo lectura): datos
 * generales, notas e ingredientes. No agrega nada al carrito. Diálogo en
 * escritorio y hoja en el celular (`PanelAdaptable`, pie con solo «Cerrar»).
 */
export interface RecetaDialogoProps {
  receta: ProductRecipe | null;
  cargando: boolean;
  onCerrar: () => void;
}

export function RecetaDialogo({ receta, cargando, onCerrar }: RecetaDialogoProps) {
  const t = useTranslations('posVenta.catalogo.receta');
  const abierto = !!receta || cargando;
  const nd = t('noDisponible');

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={(v) => {
        if (!v) onCerrar();
      }}
      titulo={t('titulo')}
      descripcion={receta?.product?.name ?? receta?.name ?? undefined}
      icono={ChefHat}
      ancho={672}
      pie={
        <button
          type="button"
          onClick={onCerrar}
          className="flex h-10 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {t('cerrar')}
        </button>
      }
    >
      {cargando ? (
        <div role="status" className="flex flex-col gap-2 py-4">
          <span className="sr-only">{t('cargando')}</span>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : receta ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-4 rounded-lg bg-subtle p-4 text-sm">
            <div>
              <dt className="text-xs text-fg-secondary">{t('producto')}</dt>
              <dd className="font-medium text-fg">{receta.product?.name ?? `#${receta.product_id}`}</dd>
              <dd className="font-mono text-xs text-fg-secondary">{t('sku', { sku: receta.product?.sku ?? nd })}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-secondary">{t('rendimiento')}</dt>
              <dd className="font-mono font-medium text-fg">
                {receta.yield_qty} {receta.yield_unit_code ?? ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-secondary">{t('estado')}</dt>
              <dd>
                <span
                  className={
                    receta.is_active
                      ? 'inline-flex h-5 items-center rounded-full bg-success-subtle px-2 text-xs font-medium text-success-text'
                      : 'inline-flex h-5 items-center rounded-full bg-subtle px-2 text-xs font-medium text-fg-secondary'
                  }
                >
                  {receta.is_active ? t('activa') : t('inactiva')}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-secondary">{t('version')}</dt>
              <dd className="font-mono font-medium text-fg">v{receta.version}</dd>
            </div>
          </dl>

          {receta.notes && (
            <div>
              <p className="mb-1 text-xs text-fg-secondary">{t('notas')}</p>
              <p className="whitespace-pre-wrap rounded-lg bg-subtle p-3 text-sm text-fg">{receta.notes}</p>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-fg">{t('ingredientes', { n: receta.ingredients?.length ?? 0 })}</p>
            {receta.ingredients?.length ? (
              <ul className="flex flex-col gap-2">
                {receta.ingredients.map((ing, i) => (
                  <li key={ing.id} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-6 font-mono text-xs text-fg-muted">#{i + 1}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-fg">{ing.ingredient_product?.name ?? `#${ing.ingredient_product_id}`}</p>
                        <p className="font-mono text-xs text-fg-secondary">{ing.ingredient_product?.sku ?? nd}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-sm text-fg">
                        {ing.quantity} {ing.unit_code}
                      </span>
                      {ing.is_optional && (
                        <span className="inline-flex h-5 items-center rounded-full bg-subtle px-2 text-[11px] font-medium text-fg-secondary">{t('opcional')}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-secondary">{t('sinIngredientes')}</p>
            )}
          </div>
        </div>
      ) : null}
    </PanelAdaptable>
  );
}
