'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AvatarIniciales, Skeleton, StatusBadge } from '@/components/kit';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';
import { CanalIcono } from '@/components/chat/ui/CanalIcono';
import { canalDeTipo } from '@/components/chat/ui/canal';
import { TONO_PRIORIDAD, type PrioridadChat } from '@/components/chat/ui/ConversacionFila';
import { cn } from '@/utils/Utils';
import { SelectorAgente } from './panel/SelectorAgente';
import { MenuMasAcciones } from './MenuMasAcciones';
import { TONO_ESTADO, nombreClienteConversacion } from './CabeceraHilo';
import type { ConversacionControl } from './useConversacion';

export type SeccionConversacion = 'conversacion' | 'actividad' | 'archivos';

/** Ruta de cada pestaña de la vista completa. */
export function rutaSeccion(id: string, s: SeccionConversacion): string {
  const base = `/app/chat/conversaciones/${id}`;
  return s === 'conversacion' ? base : `${base}/${s}`;
}

/**
 * Cabecera de la vista completa (Figma 91-chat-10/11/12): volver, migas,
 * cliente, canal y teléfono, estado, prioridad, modo IA, «Asignado a», «⋯» y
 * las pestañas Conversación · Actividad · Archivos, que son páginas.
 * En el celular publica título y «←» en el MobileHeader del shell.
 */
export function CabeceraConversacion({
  c,
  seccion,
  conversationId,
  contadores,
}: {
  c: ConversacionControl;
  seccion: SeccionConversacion;
  conversationId: string;
  contadores?: Partial<Record<SeccionConversacion, number | null>>;
}) {
  const t = useTranslations('chatBandeja.vista');
  const te = useTranslations('chatUi.estado');
  const ti = useTranslations('chatBandeja.ia.modo');
  const tc = useTranslations('chatUi.canales');
  const d = c.detalle;
  const nombre = d ? nombreClienteConversacion(d, t('cliente')) : '';
  const canal = canalDeTipo(d?.channel?.type);

  useCabeceraMovil({
    modo: 'page',
    titulo: nombre || t('titulo'),
    subtitulo: seccion === 'conversacion' ? [d?.channel?.name || (d ? tc(canal) : ''), d?.customer?.phone].filter(Boolean).join(' · ') : t(`pestanas.${seccion}`),
    volverA: seccion === 'conversacion' ? `/app/chat/bandeja?c=${conversationId}` : rutaSeccion(conversationId, 'conversacion'),
    ocultarBarra: seccion === 'conversacion',
  });

  const estado = (d?.status ?? 'open') as keyof typeof TONO_ESTADO;
  const prioridad = (d?.priority ?? 'normal') as PrioridadChat;
  const modoIa = (d?.channel?.ai_mode ?? 'manual') as 'auto' | 'hybrid' | 'manual';
  const secciones: SeccionConversacion[] = ['conversacion', 'actividad', 'archivos'];

  return (
    <header className="shrink-0 border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-3 lg:px-6">
        <Link
          href={`/app/chat/bandeja?c=${conversationId}`}
          aria-label={t('volver')}
          className="hidden size-10 shrink-0 items-center justify-center rounded-lg border border-line text-fg-secondary hover:bg-hover lg:flex"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
        </Link>
        {d ? (
          <>
            <AvatarIniciales nombre={nombre} tamano="md" className="hidden lg:inline-flex" />
            <div className="hidden min-w-0 flex-1 lg:block">
              <nav aria-label={t('migas')} className="text-xs text-fg-muted">
                <Link href="/app/chat/bandeja" className="hover:text-fg">
                  {t('migaChat')}
                </Link>
                {' › '}
                <Link href="/app/chat/bandeja" className="hover:text-fg">
                  {t('migaBandeja')}
                </Link>
              </nav>
              <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold text-fg">
                <span className="truncate">{nombre}</span>
                <CanalIcono canal={canal} size={18} />
                {d.customer?.phone ? <span className="truncate text-sm font-normal text-fg-muted">{d.customer.phone}</span> : null}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 max-lg:w-full">
              <StatusBadge estado={estado} etiqueta={te(estado)} tono={TONO_ESTADO[estado] ?? 'neutro'} apariencia="contorno" />
              <StatusBadge estado={prioridad} etiqueta={t(`prioridad.${prioridad}`)} tono={TONO_PRIORIDAD[prioridad]} apariencia="contorno" />
              <StatusBadge estado={modoIa} etiqueta={ti(modoIa)} tono={modoIa === 'manual' ? 'neutro' : 'informacion'} apariencia="contorno" className="hidden sm:inline-flex" />
              <SelectorAgente agentes={c.agentes} asignado={d.assigned_member_id} onAsignar={c.asignar} variante="cabecera" className="max-lg:ml-auto" />
              <MenuMasAcciones c={c} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center gap-3 py-1">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-5 w-48" />
          </div>
        )}
      </div>
      <nav aria-label={t('secciones')} className="mt-2 flex gap-1 overflow-x-auto px-4 lg:px-6">
        {secciones.map((s) => {
          const activa = s === seccion;
          const n = contadores?.[s];
          return (
            <Link
              key={s}
              href={rutaSeccion(conversationId, s)}
              aria-current={activa ? 'page' : undefined}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors',
                activa ? 'border-brand text-brand' : 'border-transparent text-fg-secondary hover:text-fg',
              )}
            >
              {t(`pestanas.${s}`)}
              {n != null ? <span className="rounded-full bg-subtle px-1.5 text-xs text-fg-secondary">{n}</span> : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
