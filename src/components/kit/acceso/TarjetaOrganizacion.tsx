'use client';

/**
 * Fila del selector de organización (Figma `OrgSelectCard` 351:137970):
 * avatar o inicial, nombre, detalle (tipo), distintivos de plan y estado, y la
 * estrella de favorita. La fila entera es un botón (teclado y lector de
 * pantalla); la estrella es un botón hermano, no anidado.
 *
 * El nombre y el detalle truncan con puntos suspensivos (en móvil sí truncan).
 *
 * La usa también el paso de sucursal al entrar (Figma 2728:69155): ahí no hay
 * favoritas sino una estrella fija en la última usada, un distintivo junto al
 * nombre («Última usada»), insignias de rol y horario y el atajo 1–9. Todo eso
 * son props opcionales: sin ellas la fila es la de siempre.
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
  /** Distintivo junto al nombre (p. ej. «Última usada»); también en móvil. */
  distintivo?: string;
  /** Insignias de la columna derecha (rol, abierta/cerrada…); se ocultan en móvil como el plan. */
  insignias?: InsigniaTarjeta[];
  /** Tecla que elige la fila (1–9); se pinta como tecla desde `sm`. */
  atajo?: string;
  /** Estrella fija, sin botón (no se marca ni desmarca). */
  estrellaFija?: boolean;
  /** Fondo de marca: la opción activa del teclado. */
  destacada?: boolean;
  /** Nombre accesible del botón; por defecto «Entrar a {nombre}». */
  etiqueta?: string;
  /** Posición en la lista (`data-indice`), para mover el foco con ↑ ↓. */
  indice?: number;
  /** Al recibir el foco (teclado o ratón). */
  onEnfocar?: () => void;
}

export interface InsigniaTarjeta {
  texto: string;
  tono: 'info' | 'exito' | 'neutro' | 'marca';
}

const TONO_INSIGNIA: Record<InsigniaTarjeta['tono'], string> = {
  info: 'bg-info-subtle text-info-text',
  exito: 'bg-success-subtle text-success-text',
  neutro: 'bg-subtle text-fg-secondary',
  marca: 'bg-brand-tint text-brand-deep',
};

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
  distintivo,
  insignias,
  atajo,
  estrellaFija,
  destacada,
  etiqueta,
  indice,
  onEnfocar,
}: TarjetaOrganizacionProps) {
  const t = useTranslations('acceso.seleccion');
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-xl border transition-colors',
        destacada ? 'border-line-brand bg-brand-tint' : 'bg-surface',
        !destacada && (favorita || principal ? 'border-line-brand' : 'border-line'),
        'hover:border-brand hover:bg-hover',
        deshabilitada && 'opacity-60',
      )}
    >
      {!onFavorita && estrellaFija && (
        <span aria-hidden="true" className="ml-2 inline-flex size-8 shrink-0 items-center justify-center">
          <Star className="size-4 fill-warning text-warning" />
        </span>
      )}
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
        onFocus={onEnfocar}
        disabled={deshabilitada}
        data-indice={indice}
        aria-label={etiqueta ?? t('entrarA', { nombre })}
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
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-fg">{nombre}</span>
            {distintivo && (
              <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[11px] font-medium text-on-brand">{distintivo}</span>
            )}
          </span>
          {detalle && <span className="block truncate text-xs text-fg-secondary">{detalle}</span>}
        </span>
        <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
          {principal && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand-deep">{t('principal')}</span>}
          {plan && <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-fg-secondary">{plan}</span>}
          {estado !== 'active' && (
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TONO_ESTADO[estado])}>{t(`estado.${estado}`)}</span>
          )}
          {insignias?.map((i) => (
            <span key={i.texto} className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TONO_INSIGNIA[i.tono])}>
              {i.texto}
            </span>
          ))}
        </span>
        {atajo ? (
          <kbd aria-hidden="true" className="hidden shrink-0 rounded-md border border-line bg-subtle px-1.5 py-0.5 font-sans text-xs font-medium text-fg-secondary sm:inline-flex">
            {atajo}
          </kbd>
        ) : (
          <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
