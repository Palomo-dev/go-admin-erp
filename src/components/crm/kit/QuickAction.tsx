'use client';

import { useId, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar, ClipboardList, Loader2, Mail, MessageSquare, Phone, StickyNote, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { AccionRapidaCrm, MotivoAccionDeshabilitada } from './quickActionLogica';

/**
 * Acción rápida del CRM (Figma `QuickAction` 759:21219): 6 acciones × botón o
 * ícono × default o deshabilitada. Deshabilitada **siempre** con motivo:
 *
 * - botón: el motivo va visible a la derecha («Sin teléfono»);
 * - ícono: el motivo va en el `title` y en el nombre accesible.
 *
 * No es `disabled` nativo sino `aria-disabled`: así sigue en el orden de
 * tabulación y el lector de pantalla puede leer por qué no se puede.
 */
export const ICONO_ACCION: Record<AccionRapidaCrm, LucideIcon> = {
  llamar: Phone,
  email: Mail,
  whatsapp: MessageSquare,
  reunion: Calendar,
  tarea: ClipboardList,
  nota: StickyNote,
};

export interface QuickActionProps {
  accion: AccionRapidaCrm;
  formato?: 'boton' | 'icono';
  habilitada?: boolean;
  motivo?: MotivoAccionDeshabilitada;
  /** En curso (p. ej. marcando): spinner y ocupado. */
  cargando?: boolean;
  onClick?: (accion: AccionRapidaCrm) => void;
  /** Área táctil 44 × 40 (tarjeta móvil). */
  tactil?: boolean;
  tabIndex?: number;
  className?: string;
}

export function QuickAction({
  accion,
  formato = 'boton',
  habilitada = true,
  motivo,
  cargando,
  onClick,
  tactil,
  tabIndex,
  className,
}: QuickActionProps) {
  const t = useTranslations('crm.kit.acciones');
  const idMotivo = useId();
  const Icono = cargando ? Loader2 : ICONO_ACCION[accion];
  const etiqueta = t(`nombre.${accion}`);
  const textoMotivo = !habilitada && motivo ? t(`motivo.${motivo}`) : undefined;
  const inactiva = !habilitada || !!cargando;

  const pulsar = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (inactiva) {
      e.preventDefault();
      return;
    }
    onClick?.(accion);
  };

  if (formato === 'icono') {
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center', tactil && 'h-10 w-11', className)}>
        <button
          type="button"
          data-accion={accion}
          aria-label={textoMotivo ? `${etiqueta}: ${textoMotivo}` : etiqueta}
          aria-disabled={inactiva || undefined}
          aria-busy={cargando || undefined}
          title={textoMotivo ? `${etiqueta}: ${textoMotivo}` : etiqueta}
          tabIndex={tabIndex}
          onClick={pulsar}
          className={cn(
            'flex size-8 items-center justify-center rounded-lg text-fg transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            habilitada ? 'hover:bg-hover' : 'cursor-not-allowed opacity-40',
          )}
        >
          <Icono aria-hidden="true" className={cn('size-4', cargando && 'animate-spin')} strokeWidth={1.5} />
        </button>
      </span>
    );
  }

  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5', className)}>
      <button
        type="button"
        data-accion={accion}
        aria-disabled={inactiva || undefined}
        aria-busy={cargando || undefined}
        aria-describedby={textoMotivo ? idMotivo : undefined}
        tabIndex={tabIndex}
        onClick={pulsar}
        className={cn(
          'inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-xs font-medium leading-4 text-fg transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          habilitada ? 'hover:bg-hover' : 'cursor-not-allowed opacity-50',
        )}
      >
        <Icono aria-hidden="true" className={cn('size-4', cargando && 'animate-spin')} strokeWidth={1.5} />
        {etiqueta}
      </button>
      {textoMotivo && (
        <span id={idMotivo} className="whitespace-nowrap text-xs text-fg-muted">
          {textoMotivo}
        </span>
      )}
    </span>
  );
}
