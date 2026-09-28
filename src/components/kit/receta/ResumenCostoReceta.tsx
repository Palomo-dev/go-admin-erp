'use client';

import { Lock, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import type { CostoReceta } from '@/lib/services/recipeService';
import { cn } from '@/utils/Utils';
import { BranchBadge } from '../BranchBadge';
import { margenReceta } from './recetaLogica';

/**
 * Costo de la receta (Figma `ResumenCostoReceta` 957-583458): tanda, rinde,
 * costo por unidad, precio y margen, con la sucursal y la fuente del costo.
 * Estados: completo · incompleto (con las líneas que faltan) · sin permiso
 * (`inventory.costs.view`, resuelto en el servidor) · cargando · sin ingredientes.
 */
export interface ResumenCostoRecetaProps {
  costo: CostoReceta | null;
  cargando?: boolean;
  error?: boolean;
  sucursalNombre: string | null;
  unidadRinde: string;
  /** Precio de venta vigente (Precios y costos) para el margen. */
  precioVenta?: number | null;
  formatearMoneda: (n: number) => string;
  formatearCantidad: (n: number) => string;
  className?: string;
}

export function ResumenCostoReceta({
  costo,
  cargando,
  error,
  sucursalNombre,
  unidadRinde,
  precioVenta,
  formatearMoneda,
  formatearCantidad,
  className,
}: ResumenCostoRecetaProps) {
  const t = useTranslations('receta.costo');
  const margen = margenReceta(costo?.costo_unidad, precioVenta);
  const incompletas = costo ? costo.lineas_sin_costo + costo.lineas_con_error : 0;

  const fila = (etiqueta: string, valor: string, fuerte?: boolean, tono?: string) => (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-fg-secondary">{etiqueta}</dt>
      <dd className={cn('tabular-nums', fuerte ? 'font-semibold text-fg' : 'text-fg', tono)}>{valor}</dd>
    </div>
  );

  let cuerpo;
  if (cargando && !costo) {
    cuerpo = (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  } else if (error && !costo) {
    cuerpo = <p className="text-sm text-danger-text">{t('error')}</p>;
  } else if (!costo) {
    cuerpo = <p className="text-sm text-fg-muted">{t('sinIngredientes')}</p>;
  } else if (!costo.permitido) {
    cuerpo = (
      <p className="flex items-start gap-2 rounded-lg bg-subtle p-3 text-xs text-fg-secondary">
        <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
        {t('sinPermiso')}
      </p>
    );
  } else {
    cuerpo = (
      <>
        <dl className={cn('flex flex-col gap-2', cargando && 'opacity-60')}>
          {fila(t('tanda'), formatearMoneda(costo.costo_tanda ?? 0))}
          {fila(t('rinde'), `${formatearCantidad(costo.rinde)} ${unidadRinde}`)}
          {fila(t('porUnidad'), formatearMoneda(costo.costo_unidad ?? 0), true)}
          {precioVenta !== null && precioVenta !== undefined && precioVenta > 0 && fila(t('precio'), formatearMoneda(precioVenta))}
          {margen !== null &&
            fila(
              t('margen'),
              `${(margen * 100).toFixed(1)} %`,
              false,
              margen >= 0 ? 'text-success-text' : 'text-danger-text',
            )}
        </dl>
        {incompletas > 0 && (
          <p role="status" className="flex items-start gap-2 rounded-lg bg-warning-subtle p-2.5 text-xs text-warning-text">
            <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
            {t('incompleto', { count: incompletas })}
          </p>
        )}
        <p className="text-[11px] text-fg-muted">{t('fuente', { sucursal: sucursalNombre ?? t('sinSucursal') })}</p>
      </>
    );
  }

  return (
    <section
      aria-label={t('titulo')}
      aria-live="polite"
      className={cn('flex flex-col gap-3 rounded-xl border border-line bg-surface p-4', className)}
    >
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold text-fg">{t('titulo')}</h4>
        {sucursalNombre && <BranchBadge alcance="una" nombre={sucursalNombre} className="self-start" />}
      </div>
      {cuerpo}
    </section>
  );
}
