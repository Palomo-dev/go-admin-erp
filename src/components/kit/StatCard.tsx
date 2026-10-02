import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';

/**
 * Tarjeta de cifra (Figma `StatCard` 109:4684): etiqueta Caption 12 en
 * pizarra, valor Display 28/36 semibold con números tabulares y un detalle
 * opcional de 12 px. `tono` colorea solo el detalle.
 */
export type TonoStat = 'neutro' | 'exito' | 'advertencia' | 'peligro' | 'informacion' | 'marca';

const COLOR_DETALLE: Record<TonoStat, string> = {
  neutro: 'text-fg-secondary',
  exito: 'text-success-text',
  advertencia: 'text-warning-text',
  peligro: 'text-danger-text',
  informacion: 'text-info-text',
  marca: 'text-brand-deep',
};

const BORDE_RESALTADO: Record<TonoStat, string> = {
  neutro: 'border-line-strong',
  exito: 'border-line-success',
  advertencia: 'border-line-warning',
  peligro: 'border-line-danger',
  informacion: 'border-line-info',
  marca: 'border-line-brand',
};

export interface StatCardProps {
  etiqueta: string;
  valor: ReactNode;
  detalle?: ReactNode;
  tono?: TonoStat;
  /** Flecha delante del detalle. */
  tendencia?: 'sube' | 'baja';
  /** Icono delante del detalle en lugar de la flecha («⚠ 18 con saldo»). */
  iconoDetalle?: LucideIcon;
  /**
   * Borde del color del `tono`: la tarjeta que pide atención y filtra al
   * tocarla («Vencido» en facturas de venta, Figma 421:167503).
   */
  resaltada?: boolean;
  icono?: LucideIcon;
  cargando?: boolean;
  /** `sm`: KPI móvil de Equipo, padding12, Caption12/16 y valor16/22. */
  tamano?: 'sm' | 'md';
  /** Esqueleto horizontal de 72 px de Objeciones; no cambia la tarjeta lista. */
  varianteCarga?: 'normal' | 'compacta';
  /** La tarjeta entera navega (p. ej. al listado filtrado). */
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function StatCard({
  etiqueta,
  valor,
  detalle,
  tono = 'neutro',
  tendencia,
  iconoDetalle,
  resaltada,
  icono: Icono,
  cargando,
  tamano = 'md',
  varianteCarga = 'normal',
  href,
  onClick,
  className,
}: StatCardProps) {
  const t = useTranslations('kit.comun');
  const Flecha = iconoDetalle ?? (tendencia === 'sube' ? ArrowUp : tendencia === 'baja' ? ArrowDown : null);
  const interactiva = !!href || !!onClick;
  const cargaCompacta = cargando && varianteCarga === 'compacta';
  const clases = cn(
    'flex min-w-0 rounded-xl border bg-surface text-left',
    cargaCompacta ? 'h-[72px] items-center gap-3 p-3' : tamano === 'sm' ? 'flex-col gap-0.5 p-3' : 'flex-col gap-2 p-4',
    resaltada ? BORDE_RESALTADO[tono] : 'border-line',
    interactiva &&
      cn(
        'transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        !resaltada && 'hover:border-line-strong',
      ),
    className,
  );

  const contenido = cargaCompacta ? (
    <>
      <Skeleton className="size-12 shrink-0 rounded-lg bg-pressed" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-full rounded bg-pressed" />
        <Skeleton className="h-2.5 w-2/3 rounded bg-pressed" />
      </div>
      <span className="sr-only">{t('cargandoDe', { etiqueta })}</span>
    </>
  ) : (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium leading-4 text-fg-secondary">{etiqueta}</span>
        {Icono && <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />}
      </div>
      {cargando ? (
        <>
          <Skeleton className={cn('w-24', tamano === 'sm' ? 'h-[22px]' : 'h-9')} />
          <span className="sr-only">{t('cargandoDe', { etiqueta })}</span>
        </>
      ) : (
        <span className={cn('truncate font-semibold text-fg tabular-nums', tamano === 'sm' ? 'text-base leading-[22px]' : 'text-[28px] leading-9 tracking-[-0.4px]')}>{valor}</span>
      )}
      {detalle !== undefined &&
        (cargando ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          <span className={cn('flex min-w-0 items-center gap-1 text-xs font-medium leading-4', COLOR_DETALLE[tono])}>
            {Flecha && <Flecha aria-hidden="true" className="size-3 shrink-0" />}
            <span className="truncate">{detalle}</span>
          </span>
        ))}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={clases}>
        {contenido}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={clases}>
        {contenido}
      </button>
    );
  }
  return <div className={clases}>{contenido}</div>;
}
