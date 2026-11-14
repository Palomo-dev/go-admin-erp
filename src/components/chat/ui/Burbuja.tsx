'use client';

import * as React from 'react';
import { AlertCircle, Check, CheckCheck, Lock, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { AvatarIniciales } from '@/components/kit';
import { Pista } from './Pista';

/** Quién habla en la burbuja (Figma 91-chat-00). */
export type AutorBurbuja = 'cliente' | 'agente' | 'ia' | 'nota' | 'sistema';

export interface BurbujaProps {
  autor: AutorBurbuja;
  children: React.ReactNode;
  /** Hora ya formateada en la zona de la organización. */
  hora?: string;
  /** Solo salientes: ✓ enviado, ✓✓ entregado, ✓✓ azul leído, ⚠ fallido (`message_events`). */
  entrega?: 'enviado' | 'entregado' | 'leido' | 'fallido' | null;
  /** Nombre y avatar de quien escribe, cuando cambia el autor respecto al mensaje anterior. */
  remitente?: { nombre: string; avatarUrl?: string | null } | null;
  /** Detalle tras el título de IA o nota («Laura la revisó», autor de la nota); en el cliente, aviso al pie. */
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
 * Color del ✓ / ✓✓ (Figma 94-chat-recuperado-05). Sobre el Azul GO del
 * agente: enviado atenuado, entregado blanco y leído en azul claro (decisión
 * del dueño, 2026-11-14). Sobre el tinte de la IA: gris y leído en azul.
 */
export function claseEntrega(autor: AutorBurbuja, entrega: 'enviado' | 'entregado' | 'leido'): string {
  if (autor === 'agente') return entrega === 'leido' ? 'text-info' : entrega === 'entregado' ? 'text-fg-on-brand' : 'text-fg-on-brand/60';
  return entrega === 'leido' ? 'text-brand' : 'text-fg-muted';
}

/**
 * Burbuja de mensaje del Chat: cliente (izquierda, blanca), agente (derecha,
 * Azul GO), respuesta de IA (derecha, tinte azul con encabezado), nota
 * interna (derecha, amarilla punteada, «solo la ve tu equipo») y evento del
 * sistema (centrado, gris).
 */
export function Burbuja({ autor, children, hora, entrega, detalle, remitente, className, id }: BurbujaProps) {
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
  const Entrega = entrega === 'fallido' ? AlertCircle : entrega === 'leido' || entrega === 'entregado' ? CheckCheck : Check;
  return (
    <div id={id} className={cn('flex min-w-0 flex-col rounded-lg transition-colors', derecha ? 'items-end' : 'items-start', className)}>
      {remitente ? (
        <p className={cn('mb-1 flex max-w-[85%] items-center gap-1.5 text-[13px] text-fg-secondary', derecha && 'flex-row-reverse')}>
          <AvatarIniciales nombre={remitente.nombre} src={remitente.avatarUrl} tamano="sm" className="size-5 text-[10px]" />
          <span className="truncate">{remitente.nombre}</span>
        </p>
      ) : null}
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
        {(hora || entrega || (autor === 'cliente' && detalle)) && (
          <p className={cn('mt-1 flex items-center justify-end gap-1 text-[11px]', autor === 'agente' ? 'text-fg-on-brand/80' : 'text-fg-muted')}>
            {/* Cliente: aviso del sistema sobre el mensaje («llegó con el contacto bloqueado»). */}
            {autor === 'cliente' && detalle ? <span className="mr-auto pr-2">{detalle}</span> : null}
            {hora}
            {entrega && (derecha && autor !== 'nota') ? (
              entrega === 'fallido' ? (
                // Decisión del dueño (2026-11-14): «No se entregó» es una píldora roja, también sobre el azul.
                <span className="ml-0.5 inline-flex h-[18px] items-center gap-1 rounded-full bg-danger px-1.5 text-[11px] font-semibold text-fg-on-brand">
                  <Entrega aria-hidden="true" className="size-3" />
                  {t('fallido')}
                </span>
              ) : (
                <Pista texto={t(entrega)} alineacion="end">
                  <span role="img" aria-label={t(entrega)} className="inline-flex">
                    <Entrega aria-hidden="true" className={cn('size-3.5', claseEntrega(autor, entrega))} />
                  </span>
                </Pista>
              )
            ) : null}
          </p>
        )}
      </div>
    </div>
  );
}
