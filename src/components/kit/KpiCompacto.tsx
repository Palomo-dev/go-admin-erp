'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { TonoStat } from './StatCard';
import { useKitT } from './useIdiomaKit';

/**
 * Franja de cifras para móvil (Figma `KpiCompacto` 680:406370): una sola
 * tarjeta con 2–4 cifras separadas por divisores, en lugar de cuatro
 * `StatCard` apiladas. Ventas, CxC, pedidos. Si no caben, desplaza en
 * horizontal. En escritorio la pantalla usa `KpiStrip`.
 */
export interface CifraCompacta {
  id?: string;
  etiqueta: string;
  valor: ReactNode;
  /** Colorea el valor (vencidas en peligro). */
  tono?: TonoStat;
  /** La cifra filtra el listado. */
  href?: string;
  onClick?: () => void;
}

export interface KpiCompactoProps {
  cifras: readonly CifraCompacta[];
  etiqueta?: string;
  cargando?: boolean;
  className?: string;
}

const COLOR_VALOR: Record<TonoStat, string> = {
  neutro: 'text-fg',
  exito: 'text-success-text',
  advertencia: 'text-warning-text',
  peligro: 'text-danger-text',
  informacion: 'text-info-text',
  marca: 'text-brand-deep',
};

export function KpiCompacto({ cifras, etiqueta, cargando, className }: KpiCompactoProps) {
  const t = useKitT();
  return (
    <section
      aria-label={etiqueta ?? t('comun.resumen')}
      className={cn('flex overflow-x-auto rounded-xl border border-line bg-surface', className)}
    >
      {cifras.map((c, i) => {
        const interior = (
          <>
            <span className="truncate text-[11px] font-medium uppercase leading-4 tracking-wide text-fg-muted">{c.etiqueta}</span>
            {cargando ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <span className={cn('truncate text-[15px] font-semibold leading-5 tabular-nums', COLOR_VALOR[c.tono ?? 'neutro'])}>{c.valor}</span>
            )}
          </>
        );
        const clases = cn(
          'flex min-w-[112px] flex-1 flex-col gap-0.5 px-3 py-2.5 text-left',
          i > 0 && 'border-l border-line',
          (c.href || c.onClick) && 'hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
        );
        const clave = c.id ?? `${c.etiqueta}-${i}`;
        if (c.href) {
          return (
            <Link key={clave} href={c.href} className={clases}>
              {interior}
            </Link>
          );
        }
        if (c.onClick) {
          return (
            <button key={clave} type="button" onClick={c.onClick} className={clases}>
              {interior}
            </button>
          );
        }
        return (
          <div key={clave} className={clases}>
            {interior}
          </div>
        );
      })}
    </section>
  );
}
