'use client';

/**
 * «Eventos recientes» de un canal de Meta (Figma 91-chat-22): estado de los
 * últimos mensajes (enviado, entregado, leído, fallido) con su hora relativa
 * y, al pasar el mouse (o al enfocar la fila), la fecha y hora exactas en la
 * zona de la organización en un tooltip oscuro (aprobados
 * 94-chat-recuperado-canales 12 y 13; la pantalla anterior las mostraba como
 * «dd/MM HH:mm»).
 */
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Tarjeta } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { tiempoRelativo } from '../canalesLogica';

export interface EventoCanal {
  id: string;
  event_type: string;
  error_message: string | null;
  message_id: string | null;
  created_at: string;
}

const TONO: Record<string, 'informacion' | 'exito' | 'marca' | 'peligro' | 'neutro'> = {
  sent: 'informacion',
  delivered: 'exito',
  read: 'marca',
  failed: 'peligro',
};

export function EventosRecientesCanal({ eventos, id }: { eventos: readonly EventoCanal[]; id?: string }) {
  const t = useTranslations('chatModulo.canales.detalleCanal.eventos');
  const locale = useLocale();
  const { formatDateTime } = useFormatDate();
  const ahora = useMemo(() => new Date(), [eventos]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Tarjeta id={id} titulo={t('titulo')}>
      {eventos.length === 0 ? (
        <p className="py-2 text-[13px] text-fg-muted">{t('vacio')}</p>
      ) : (
        <TooltipProvider delayDuration={150}>
          <ul className="-mx-2 flex max-h-[360px] flex-col gap-1 overflow-y-auto">
            {eventos.map((e) => {
              const conocido = e.event_type in TONO;
              const exacta = formatDateTime(e.created_at);
              return (
                <Tooltip key={e.id}>
                  <TooltipTrigger asChild>
                    <li tabIndex={0} className="flex min-w-0 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none">
                      <Badge tono={TONO[e.event_type] ?? 'neutro'} tamano="sm">
                        {conocido ? t(`tipos.${e.event_type as 'sent'}`) : e.event_type}
                      </Badge>
                      <span className="min-w-0 truncate text-fg-muted">
                        {e.error_message ?? (e.message_id ? `#${e.message_id.slice(0, 8)}` : '')}
                        {' · '}
                        <time dateTime={e.created_at}>{tiempoRelativo(e.created_at, ahora, locale)}</time>
                        <span className="sr-only"> ({exacta})</span>
                      </span>
                    </li>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="end" className="rounded-md border-0 bg-solid-neutral px-2.5 py-1.5 text-xs font-medium text-on-solid shadow-md">
                    {exacta}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </ul>
        </TooltipProvider>
      )}
    </Tarjeta>
  );
}
