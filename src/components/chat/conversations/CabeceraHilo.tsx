'use client';

import * as React from 'react';
import Link from 'next/link';
import { Maximize2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AvatarIniciales, StatusBadge, Skeleton } from '@/components/kit';
import { CanalIcono } from '@/components/chat/ui/CanalIcono';
import { canalDeTipo } from '@/components/chat/ui/canal';
import { SelectorAgente } from './panel/SelectorAgente';
import { MenuMasAcciones } from './MenuMasAcciones';
import type { ConversacionControl } from './useConversacion';

/** Tono del estado de la conversación. */
export const TONO_ESTADO = { open: 'exito', pending: 'advertencia', closed: 'neutro', archived: 'neutro' } as const;

/** Nombre del cliente de una conversación. */
export function nombreClienteConversacion(d: { customer?: { full_name?: string | null; first_name?: string | null; last_name?: string | null; phone?: string | null } | null } | null | undefined, porDefecto: string): string {
  const c = d?.customer;
  return c?.full_name || [c?.first_name, c?.last_name].filter(Boolean).join(' ') || c?.phone || porDefecto;
}

/**
 * Cabecera del hilo en la Bandeja (Figma 91-chat-01): cliente, canal y
 * teléfono, estado, «Asignado a», vista completa y «⋯ Más acciones». Solo en
 * escritorio: en el móvil la cabecera la pone el shell.
 */
export function CabeceraHilo({ c, onBuscar }: { c: ConversacionControl; onBuscar?: () => void }) {
  const t = useTranslations('chatBandeja.hilo');
  const te = useTranslations('chatUi.estado');
  const tc = useTranslations('chatUi.canales');
  const d = c.detalle;

  if (!d) {
    return (
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  const nombre = nombreClienteConversacion(d, t('cliente'));
  const canal = canalDeTipo(d.channel?.type);
  const estado = (d.status ?? 'open') as keyof typeof TONO_ESTADO;

  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <AvatarIniciales nombre={nombre} tamano="md" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-fg">{nombre}</h2>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-fg-secondary">
          <CanalIcono canal={canal} size={14} />
          <span className="truncate">{[d.channel?.name || tc(canal), d.customer?.phone].filter(Boolean).join(' · ')}</span>
        </p>
      </div>
      <StatusBadge estado={estado} etiqueta={te(estado)} tono={TONO_ESTADO[estado] ?? 'neutro'} apariencia="contorno" className="hidden md:inline-flex" />
      <SelectorAgente agentes={c.agentes} asignado={d.assigned_member_id} onAsignar={c.asignar} variante="cabecera" className="hidden md:flex" />
      <Link
        href={`/app/chat/conversaciones/${d.id}`}
        aria-label={t('vistaCompleta')}
        title={t('vistaCompleta')}
        className="flex size-10 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover"
      >
        <Maximize2 aria-hidden="true" className="size-4" />
      </Link>
      <MenuMasAcciones c={c} enBandeja onBuscar={onBuscar} />
    </div>
  );
}
