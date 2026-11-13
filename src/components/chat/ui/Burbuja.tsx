'use client';

import * as React from 'react';
import { Check, CheckCheck, Lock, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';

/** Quién habla en la burbuja (Figma 91-chat-00). */
export type AutorBurbuja = 'cliente' | 'agente' | 'ia' | 'nota' | 'sistema';

export interface BurbujaProps {
  autor: AutorBurbuja;
  children: React.ReactNode;
  /** Hora ya formateada en la zona de la organización. */
  hora?: string;
  /** Solo salientes: ✓ enviado, ✓✓ leído. */
  entrega?: 'enviado' | 'leido' | null;
  /** Detalle tras el título de IA o nota («Laura la revisó», autor de la nota). */
  detalle?: string | null;
  className?: string;
  id?: string;
}

/** Autor de una fila de `messages` (`role` / `direction`). */
export function autorDeMensaje(m: { role?: string | null; direction?: string | null }): AutorBurbuja {
  if (m.role === 'system') return 'sistema';
  if (m.role === 'ai') return 'ia';
  if (m.role === 'agent' || m.direction === 'outbound') return 'agente';
  return 'cliente';
}

const CAJA: Record<Exclude<AutorBurbuja, 'sistema'>, string> = {
  cliente: 'border border-line bg-surface text-fg',
  agente: 'bg-brand text-fg-on-brand',
  ia: 'border border-line-brand bg-brand-tint text-fg',
  nota: 'border border-dashed border-line-warning bg-warning-subtle text-fg',
};

/**
 * Burbuja de mensaje del Chat: cliente (izquierda, blanca), agente (derecha,
 * Azul GO), respuesta de IA (derecha, tinte azul con encabezado), nota
 * interna (derecha, amarilla punteada, «solo la ve tu equipo») y evento del
 * sistema (centrado, gris).
 */
export function Burbuja({ autor, children, hora, entrega, detalle, className, id }: BurbujaProps) {
  const t = useTranslations('chatUi.burbuja');

  if (autor === 'sistema') {
    return (
      <div id={id} className={cn('flex justify-center py-1', className)}>
        <p className="max-w-[85%] rounded-full bg-subtle px-3 py-1 text-center text-xs text-fg-secondary">
          {children}
          {hora ? <span className="text-fg-muted"> · {hora}</span> : null}
        </p>
      </div>
    );
  }

  const derecha = autor !== 'cliente';
  const Entrega = entrega === 'leido' ? CheckCheck : Check;
  return (
    <div id={id} className={cn('flex min-w-0', derecha ? 'justify-end' : 'justify-start', className)}>
      <div className={cn('min-w-0 max-w-[85%] rounded-xl px-3 py-2 sm:max-w-[70%]', CAJA[autor])}>
        {autor === 'ia' && (
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-brand">
            <Sparkles aria-hidden="true" className="size-3.5" />
            {detalle ? t('iaCon', { detalle }) : t('ia')}
          </p>
        )}
        {autor === 'nota' && (
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-warning-text">
            <Lock aria-hidden="true" className="size-3.5" />
            {detalle ? t('notaCon', { detalle }) : t('nota')}
          </p>
        )}
        <div className="break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{children}</div>
        {(hora || entrega) && (
          <p className={cn('mt-1 flex items-center justify-end gap-1 text-[11px]', autor === 'agente' ? 'text-fg-on-brand/80' : 'text-fg-muted')}>
            {hora}
            {entrega && (derecha && autor !== 'nota') ? (
              <Entrega aria-label={entrega === 'leido' ? t('leido') : t('enviado')} className="size-3.5" />
            ) : null}
          </p>
        )}
      </div>
    </div>
  );
}
