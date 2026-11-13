'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AvatarIniciales, StatusBadge } from '@/components/kit';
import type { TonoBadge } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { CanalIcono } from './CanalIcono';
import type { Canal } from './canal';

export type PrioridadChat = 'low' | 'normal' | 'high' | 'urgent';

/** Tono del distintivo de prioridad (Figma: «Alta» ámbar en contorno). */
export const TONO_PRIORIDAD: Record<PrioridadChat, TonoBadge> = {
  low: 'neutro',
  normal: 'informacion',
  high: 'advertencia',
  urgent: 'peligro',
};

/** En la fila solo se marcan las prioridades que piden atención. */
export function prioridadVisibleEnFila(p: string | null | undefined): p is 'high' | 'urgent' {
  return p === 'high' || p === 'urgent';
}

export interface ConversacionFilaProps {
  nombre: string;
  canal: Canal;
  avatarUrl?: string | null;
  /** Último mensaje (ya con el prefijo «IA:» si lo escribió la IA). */
  vistaPrevia: string;
  /** Hora o día del último mensaje, ya formateado en la zona de la organización. */
  cuando?: string;
  noLeidos?: number;
  prioridad?: string | null;
  /**
   * Línea de atención: nombre corto del agente («Laura R.»), `null` = sin
   * asignar, o `'ia'` cuando la IA responde sola.
   */
  atencion?: string | null | 'ia';
  activa?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Fila de la lista de chats (Figma 91-chat-00/01): avatar con el canal,
 * nombre, hora, último mensaje, no leídos, prioridad y quién la atiende.
 */
export function ConversacionFila({
  nombre,
  canal,
  avatarUrl,
  vistaPrevia,
  cuando,
  noLeidos = 0,
  prioridad,
  atencion,
  activa = false,
  onClick,
  className,
}: ConversacionFilaProps) {
  const t = useTranslations('chatUi.fila');
  const tp = useTranslations('chatUi.prioridad');
  const conNoLeidos = noLeidos > 0;
  const textoAtencion = atencion === 'ia' ? t('iaAutomatico') : atencion ? atencion : t('sinAsignar');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? 'true' : undefined}
      className={cn(
        'flex w-full min-w-0 items-start gap-3 border-b border-line px-4 py-3 text-left transition-colors',
        'hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
        activa && 'border-l-[3px] border-l-brand bg-brand-tint pl-[13px] hover:bg-brand-tint',
        className,
      )}
    >
      <span className="relative shrink-0">
        <AvatarIniciales nombre={nombre} src={avatarUrl} tamano="md" />
        <CanalIcono canal={canal} size={16} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-surface" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate text-sm text-fg', conNoLeidos ? 'font-semibold' : 'font-medium')}>{nombre}</span>
          {cuando ? <span className={cn('shrink-0 text-xs', conNoLeidos ? 'font-semibold text-brand' : 'text-fg-muted')}>{cuando}</span> : null}
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={cn('truncate text-sm', conNoLeidos ? 'font-medium text-fg' : 'text-fg-secondary')}>{vistaPrevia}</span>
          {conNoLeidos ? (
            <span
              aria-label={t('noLeidos', { n: noLeidos })}
              className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-fg-on-brand"
            >
              {noLeidos > 99 ? '99+' : noLeidos}
            </span>
          ) : null}
        </span>
        <span className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
          {prioridadVisibleEnFila(prioridad) ? (
            <StatusBadge estado={prioridad} etiqueta={tp(prioridad)} tono={TONO_PRIORIDAD[prioridad]} apariencia="contorno" />
          ) : null}
          <span className="truncate">{textoAtencion}</span>
        </span>
      </span>
    </button>
  );
}
