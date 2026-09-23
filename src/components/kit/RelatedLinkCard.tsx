'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';

/**
 * Bloque «Cómo se conecta» (Figma `RelatedLinkCard` 580:277907, Tono =
 * neutral / warning / danger): icono de la entidad destino, etiqueta, conteo
 * real y un enlace «Ver ›» (o la acción que toque: «Quitar», «Marcar»).
 *
 * Si no hay `href` ni `onAccion`, la tarjeta es solo informativa.
 */
export type TonoRelatedLink = 'neutral' | 'warning' | 'danger';

export interface RelatedLinkCardProps {
  icono: LucideIcon;
  etiqueta: string;
  /** El conteo o el valor («86», «Sí»). */
  valor: ReactNode;
  href?: string;
  onAccion?: () => void;
  /** Alias de `onAccion` (la usan pantallas que se escribieron con este nombre). */
  onClick?: () => void;
  /** Texto del enlace; por defecto «Ver». */
  textoAccion?: string;
  /** Alias de `textoAccion`. */
  accion?: string;
  tono?: TonoRelatedLink;
  cargando?: boolean;
  className?: string;
}

const TONO: Record<TonoRelatedLink, { caja: string; borde: string }> = {
  neutral: { caja: 'bg-brand-tint text-brand', borde: 'border-line' },
  warning: { caja: 'bg-warning-subtle text-warning-text', borde: 'border-line-warning' },
  danger: { caja: 'bg-danger-subtle text-danger-text', borde: 'border-line-danger' },
};

export function RelatedLinkCard({
  icono: Icono,
  etiqueta,
  valor,
  href,
  onAccion: onAccionProp,
  onClick,
  textoAccion: textoAccionProp,
  accion: textoAlias,
  tono = 'neutral',
  cargando,
  className,
}: RelatedLinkCardProps) {
  const onAccion = onAccionProp ?? onClick;
  const textoAccion = textoAccionProp ?? textoAlias ?? 'Ver';
  const t = TONO[tono];
  const accion = (
    <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-medium text-link">
      {textoAccion}
      <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
    </span>
  );
  const claseAccion =
    'rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand hover:underline';

  return (
    <div className={cn('flex min-h-[60px] items-center gap-3 rounded-xl border bg-surface px-3 py-2.5', t.borde, className)}>
      <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', t.caja)}>
        <Icono className="size-4" strokeWidth={1.5} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs leading-4 text-fg-secondary">{etiqueta}</span>
        <span className="text-base font-semibold leading-6 text-fg tabular-nums">
          {cargando ? <span className="inline-block h-4 w-8 animate-pulse rounded bg-subtle align-middle" /> : valor}
        </span>
      </span>
      {href ? (
        <Link href={href} aria-label={`${textoAccion}: ${etiqueta}`} className={claseAccion}>
          {accion}
        </Link>
      ) : onAccion ? (
        <button type="button" onClick={onAccion} aria-label={`${textoAccion}: ${etiqueta}`} className={claseAccion}>
          {accion}
        </button>
      ) : null}
    </div>
  );
}
