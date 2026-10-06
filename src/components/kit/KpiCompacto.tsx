'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
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
  /** Icono de 14 px delante de la etiqueta (decorativo; el texto dice lo mismo). */
  icono?: LucideIcon;
}

export interface KpiCompactoProps {
  cifras: readonly CifraCompacta[];
  etiqueta?: string;
  cargando?: boolean;
  /**
   * Etiquetas con mayúscula inicial, en pizarra y a 13/18 (Resumen del sitio,
   * A/02f), en vez de la versalita de 11 px. Por defecto `false`: no cambia
   * las demás pantallas que usan el componente.
   */
  etiquetaNatural?: boolean;
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

export function KpiCompacto({ cifras, etiqueta, cargando, etiquetaNatural, className }: KpiCompactoProps) {
  const t = useKitT();
  return (
    <section
      aria-label={etiqueta ?? t('comun.resumen')}
      className={cn('flex overflow-x-auto rounded-xl border border-line bg-surface', className)}
    >
      {cifras.map((c, i) => {
        const interior = (
          <>
            <span
              className={cn(
                'flex min-w-0 items-center gap-1',
                etiquetaNatural
                  ? 'text-[13px] leading-[18px] text-fg-secondary'
                  : 'text-[11px] font-medium uppercase leading-4 tracking-wide text-fg-muted',
              )}
            >
              {c.icono && <c.icono aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.5} />}
              <span className="truncate">{c.etiqueta}</span>
            </span>
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
