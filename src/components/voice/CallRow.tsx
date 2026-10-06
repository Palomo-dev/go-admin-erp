'use client';

/**
 * Celdas de una fila del listado de Llamadas (Figma 1351:18) y su tarjeta móvil.
 *
 * La tabla es el `DataTable` del kit (`CallsTable`); aquí vive lo que pinta
 * cada celda. La fecha sale en la zona de la ORGANIZACIÓN (`useFormatDate()`),
 * nunca en la del navegador. Textos en `crm.llamadas.*`.
 */

import { Bot, PhoneIncoming, PhoneMissed, PhoneOutgoing, Play, Smartphone, Voicemail, PenLine, Monitor } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { ListCard } from '@/components/kit/ListCard';
import { cn } from '@/utils/Utils';
import type { CallListRow, CallSentiment, CallStatus } from '@/lib/services/crm/callManagementService';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { UnverifiedConsentBadge } from './ConsentBadge';
import {
  estadoGrabacion,
  formatDuration,
  numeroContraparte,
  resultadoDeLlamada,
  tipoDeLlamada,
} from './callsListadoLogica';

export { formatDuration } from './callsListadoLogica';

/** Estado técnico de la llamada (lo usan el detalle y los filtros heredados). */
export const STATUS_LABELS: Record<CallStatus, string> = {
  dialing: 'Marcando',
  ringing: 'Timbrando',
  in_progress: 'En curso',
  completed: 'Completada',
  failed: 'Fallida',
  busy: 'Ocupado',
  no_answer: 'Sin respuesta',
  canceled: 'Cancelada',
  voicemail: 'Buzón',
};

/** Sentimiento del último análisis IA (columna «Sentimiento», Figma 1351:18). */
export const SENTIMENT_VIEW: Record<CallSentiment, { tono: 'exito' | 'neutro' | 'peligro' | 'advertencia'; punto: string }> = {
  positive: { tono: 'exito', punto: 'bg-success' },
  neutral: { tono: 'neutro', punto: 'bg-fg' },
  negative: { tono: 'peligro', punto: 'bg-danger' },
  mixed: { tono: 'advertencia', punto: 'bg-warning' },
};

export const MODE_ICONS: Record<string, { icon: typeof Monitor; label: string }> = {
  browser: { icon: Monitor, label: 'Navegador' },
  bridge: { icon: Smartphone, label: 'Mi celular' },
  ai_agent: { icon: Bot, label: 'Agente IA' },
  manual: { icon: PenLine, label: 'Manual' },
  inbound: { icon: PhoneIncoming, label: 'Entrante' },
};

const ICONO_TIPO: Record<string, typeof Monitor> = {
  agenteIa: Bot,
  entrante: PhoneIncoming,
  entrantePerdida: PhoneMissed,
  salienteBuzon: Voicemail,
  salienteCelular: Smartphone,
  salienteManual: PenLine,
  salienteWeb: PhoneOutgoing,
};

/** Nombre del contacto o `null` (número desconocido). */
export function nombreContacto(call: CallListRow): string | null {
  return call.customer?.full_name || [call.customer?.first_name, call.customer?.last_name].filter(Boolean).join(' ') || null;
}

export function nombreUsuario(call: CallListRow): string | null {
  if (!call.user) return null;
  return [call.user.first_name, call.user.last_name].filter(Boolean).join(' ') || call.user.email || null;
}

/** `data-*` de la fila: Ctrl+Shift+C del softphone llama al contacto enfocado. */
export function datosContactoLlamada(call: CallListRow): Record<`data-${string}`, string | undefined> {
  return {
    'data-phone': numeroContraparte(call) || undefined,
    'data-customer-id': call.customer?.id ?? undefined,
    'data-opportunity-id': call.opportunity_id ?? undefined,
    'data-display-name': nombreContacto(call) ?? undefined,
  };
}

export function FechaLlamada({ call }: { call: CallListRow }) {
  const { formatDateTime } = useFormatDate();
  return <span className="whitespace-nowrap tabular-nums">{formatDateTime(call.started_at ?? call.created_at) || '—'}</span>;
}

export function ClienteLlamada({ call }: { call: CallListRow }) {
  const t = useTranslations('crm.llamadas');
  const nombre = nombreContacto(call);
  const numero = numeroContraparte(call);
  return (
    <div className="min-w-0">
      <p className={cn('truncate text-sm font-medium text-fg', !nombre && 'tabular-nums')}>{nombre ?? numero}</p>
      <p className="truncate text-xs text-fg-secondary">
        {call.opportunity?.name ?? (nombre ? <span className="tabular-nums">{numero}</span> : t('numeroDesconocido'))}
      </p>
    </div>
  );
}

export function TipoLlamada({ call }: { call: CallListRow }) {
  const t = useTranslations('crm.llamadas');
  const tipo = tipoDeLlamada(call);
  const Icono = ICONO_TIPO[tipo] ?? PhoneOutgoing;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px]', tipo === 'entrantePerdida' ? 'text-danger-text' : 'text-fg-secondary')}>
      <Icono aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
      <span className="truncate">{t(`tipos.${tipo}`)}</span>
    </span>
  );
}

export function QuienLlamada({ call }: { call: CallListRow }) {
  const t = useTranslations('crm.llamadas');
  const nombre = nombreUsuario(call);
  if (nombre) return <span className="truncate text-[13px] text-fg">{nombre}</span>;
  if (call.mode === 'ai_agent') return <span className="text-[13px] text-fg">{t('tipos.agenteIa')}</span>;
  return <span className="text-[13px] text-fg-secondary">{call.direction === 'inbound' ? t('lineaPrincipal') : '—'}</span>;
}

export function ResultadoLlamada({ call }: { call: CallListRow }) {
  const t = useTranslations('crm.llamadas');
  const r = resultadoDeLlamada(call);
  if (!r) return <span className="text-fg-muted">—</span>;
  return (
    <Badge tono={r.tono} tamano="sm" className="max-w-full truncate">
      {t(`resultados.${r.clave}`)}
    </Badge>
  );
}

export function SentimientoLlamada({ call }: { call: CallListRow }) {
  const t = useTranslations('crm.llamadas');
  const s = call.sentiment ? SENTIMENT_VIEW[call.sentiment] : null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-fg">
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', s ? s.punto : 'bg-line-strong')} />
      {call.sentiment ? t(`sentimientos.${call.sentiment}`) : <span className="text-fg-muted">—<span className="sr-only">{t('sinAnalisis')}</span></span>}
    </span>
  );
}

export function GrabacionLlamada({ call, onOir }: { call: CallListRow; onOir: () => void }) {
  const t = useTranslations('crm.llamadas');
  const estado = estadoGrabacion(call);
  if (estado === 'ninguna') return <span className="text-fg-muted">—</span>;
  if (estado === 'procesando') return <span className="text-xs text-fg-secondary">{t('grabacionProcesando')}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOir();
      }}
      className="inline-flex items-center gap-1 rounded text-[13px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      aria-label={t('oirAria', { nombre: nombreContacto(call) ?? numeroContraparte(call) })}
    >
      <Play aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
      {t('oir')}
    </button>
    {/* Grabación sin aviso acreditado (Ley 1581): icono + texto, nunca solo color. */}
    <UnverifiedConsentBadge method={call.consent_method} />
    </span>
  );
}

/** Tarjeta móvil (< lg): una por llamada, sin scroll horizontal. */
export function TarjetaLlamada({ call, onAbrir }: { call: CallListRow; onAbrir: () => void }) {
  const t = useTranslations('crm.llamadas');
  const { formatDateTime } = useFormatDate();
  const tipo = tipoDeLlamada(call);
  const r = resultadoDeLlamada(call);
  return (
    <ListCard
      inicio="icono"
      icono={ICONO_TIPO[tipo] ?? PhoneOutgoing}
      titulo={nombreContacto(call) ?? numeroContraparte(call)}
      subtitulo={`${t(`tipos.${tipo}`)} · ${formatDateTime(call.started_at ?? call.created_at)}`}
      estado={r ? <Badge tono={r.tono} tamano="sm">{t(`resultados.${r.clave}`)}</Badge> : undefined}
      valor={<span className="tabular-nums">{formatDuration(call.duration_seconds)}</span>}
      onClick={onAbrir}
    />
  );
}
