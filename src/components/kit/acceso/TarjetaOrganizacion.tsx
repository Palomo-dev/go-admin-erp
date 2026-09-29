'use client';

/**
 * Fila del selector de organización (Figma `OrgSelectCard` 351:137970):
 * avatar o inicial, nombre, detalle (tipo), distintivos de plan y estado, y la
 * estrella de favorita. La fila entera es un botón (teclado y lector de
 * pantalla); la estrella es un botón hermano, no anidado.
 *
 * El nombre y el detalle truncan con puntos suspensivos (en móvil sí truncan).
 */
import * as React from 'react';
import { Star, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';

export interface TarjetaOrganizacionProps {
  nombre: string;
  detalle?: string;
  logoUrl?: string | null;
  plan?: string;
  /** Clave de `acceso.seleccion.estado`. */
  estado?: 'active' | 'frozen' | 'deleted' | 'inactive';
  principal?: boolean;
  favorita?: boolean;
  onFavorita?: () => void;
  onElegir: () => void;
  deshabilitada?: boolean;
}

const TONO_ESTADO: Record<NonNullable<TarjetaOrganizacionProps['estado']>, string> = {
  active: 'bg-success-subtle text-success-text',
  frozen: 'bg-danger-subtle text-danger-text',
  deleted: 'bg-subtle text-fg-secondary',
  inactive: 'bg-warning-subtle text-warning-text',
};

export function TarjetaOrganizacion({
  nombre,
  detalle,
  logoUrl,
  plan,
  estado = 'active',
  principal,
  favorita,
  onFavorita,
  onElegir,
  deshabilitada,
}: TarjetaOrganizacionProps) {
  const t = useTranslations('acceso.seleccion');
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-xl border bg-surface transition-colors',
        favorita || principal ? 'border-line-brand' : 'border-line',
        'hover:border-brand hover:bg-hover',
        deshabilitada && 'opacity-60',
      )}
    >
      {onFavorita && (
        <button
          type="button"
          onClick={onFavorita}
          aria-pressed={!!favorita}
          aria-label={favorita ? t('quitarFavorita', { nombre }) : t('marcarFavorita', { nombre })}
          className="ml-2 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Star className={cn('size-4', favorita && 'fill-warning text-warning')} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={onElegir}
        disabled={deshabilitada}
        aria-label={t('entrarA', { nombre })}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed"
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo de la organización en Storage (URL externa)
          <img src={logoUrl} alt="" className="size-10 shrink-0 rounded-full border border-line object-cover" />
        ) : (
          <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-semibold text-brand-deep">
            {nombre.trim().charAt(0).toUpperCase() || '·'}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{nombre}</span>
          {detalle && <span className="block truncate text-xs text-fg-secondary">{detalle}</span>}
        </span>
        <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
          {principal && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand-deep">{t('principal')}</span>}
          {plan && <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-fg-secondary">{plan}</span>}
          {estado !== 'active' && (
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TONO_ESTADO[estado])}>{t(`estado.${estado}`)}</span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
      </button>
    </div>
  );
}
