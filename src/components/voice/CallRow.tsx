'use client';

/**
 * CallRow — una fila del historial de llamadas (FASE-03 §5.2).
 *
 * Extraído de `CallsTable.tsx` en la ronda 3 de F3: al añadir `CallButton`, los
 * `data-*` y el manejo de teclado (M8), la tabla pasó de 289 a 330 líneas y
 * rompió la regla de ≤300. Aquí vive la fila (celdas, atajos de teclado y el
 * detalle expandible); la tabla se queda con carga, filtros y cabecera.
 *
 * `data-phone`/`data-customer-id`/`data-opportunity-id` + `tabIndex` son lo que
 * permite que Ctrl+Shift+C vuelva a llamar al contacto de la fila enfocada.
 */

import { Fragment } from 'react';
import { PhoneIncoming, PhoneOutgoing, ChevronDown, ChevronRight, Monitor, Smartphone, Bot, PenLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { CallPlayer } from './CallPlayer';
import { CallRowDetail } from './CallRowDetail';
import { CallButton } from './CallButton';
import type { CallListRow, CallStatus } from '@/lib/services/crm/callManagementService';
import { DISPOSITION_LABELS } from '@/lib/services/crm/callDispositionService';

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

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

const STATUS_VARIANTS: Record<CallStatus, 'secondary' | 'success' | 'destructive' | 'warning' | 'info'> = {
  dialing: 'secondary',
  ringing: 'warning',
  in_progress: 'info',
  completed: 'success',
  failed: 'destructive',
  busy: 'destructive',
  no_answer: 'secondary',
  canceled: 'secondary',
  voicemail: 'info',
};

const OUTCOME_LABELS: Record<string, string> = { ...DISPOSITION_LABELS, canceled: 'Cancelada', failed: 'Fallida' };

export const MODE_ICONS: Record<string, { icon: typeof Monitor; label: string }> = {
  browser: { icon: Monitor, label: 'Navegador' },
  bridge: { icon: Smartphone, label: 'Mi celular' },
  ai_agent: { icon: Bot, label: 'Agente IA' },
  manual: { icon: PenLine, label: 'Manual' },
  inbound: { icon: PhoneIncoming, label: 'Entrante' },
};

interface CallRowProps {
  call: CallListRow;
  isOpen: boolean;
  onToggle: () => void;
}

export function CallRow({ call, isOpen, onToggle }: CallRowProps) {
  const mode = MODE_ICONS[call.mode] ?? MODE_ICONS.browser;
  const ModeIcon = mode.icon;
  const contactName = call.customer?.full_name || [call.customer?.first_name, call.customer?.last_name].filter(Boolean).join(' ') || null;
  const userName = call.user ? [call.user.first_name, call.user.last_name].filter(Boolean).join(' ') || call.user.email : '—';
  const outcome = call.disposition_outcome ? OUTCOME_LABELS[call.disposition_outcome] ?? call.disposition_outcome : '—';
  const ready = call.recordings.some((r) => r.status === 'ready');
  const processing = !ready && call.recordings.some((r) => r.status === 'processing');
  const counterpart = call.direction === 'inbound' ? call.from_number : call.to_number;

  return (
    <Fragment>
      <TableRow
        className="cursor-pointer border-gray-200 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-700 dark:hover:bg-gray-700/40"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        aria-expanded={isOpen}
        aria-label={`Llamada con ${contactName ?? counterpart}`}
        data-phone={counterpart || undefined}
        data-customer-id={call.customer?.id ?? undefined}
        data-opportunity-id={call.opportunity_id ?? undefined}
        data-display-name={contactName ?? undefined}
      >
        <TableCell className="pr-0 text-gray-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</TableCell>
        <TableCell className="text-sm text-gray-600 dark:text-gray-300">{formatDate(call.started_at ?? call.created_at)}</TableCell>
        <TableCell>
          <span className={`inline-flex items-center gap-1 text-xs ${call.direction === 'inbound' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`} title={mode.label}>
            {call.direction === 'inbound' ? <PhoneIncoming size={14} aria-hidden="true" /> : <PhoneOutgoing size={14} aria-hidden="true" />}
            <ModeIcon size={13} aria-hidden="true" />
            <span className="sr-only">{call.direction === 'inbound' ? 'Entrante' : 'Saliente'} · {mode.label}</span>
          </span>
        </TableCell>
        <TableCell className="text-sm">
          <div className="flex items-center gap-1">
            <div className="text-gray-900 dark:text-gray-100">{contactName ?? <span className="font-mono">{counterpart}</span>}</div>
            <CallButton
              phoneNumber={counterpart}
              customerId={call.customer?.id ?? null}
              opportunityId={call.opportunity_id ?? null}
              displayName={contactName}
              size="icon"
              className="h-6 w-6"
            />
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {contactName && <span className="font-mono">{counterpart}</span>}
            {call.opportunity?.name && <span> › {call.opportunity.name}</span>}
          </div>
        </TableCell>
        <TableCell className="text-sm text-gray-600 dark:text-gray-300">{userName}</TableCell>
        <TableCell className="text-sm tabular-nums text-gray-600 dark:text-gray-300">{formatDuration(call.duration_seconds)}</TableCell>
        <TableCell className="text-sm text-gray-600 dark:text-gray-300">{outcome}</TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANTS[call.status] ?? 'secondary'} className="text-[10px]">
            {STATUS_LABELS[call.status] ?? call.status}
          </Badge>
        </TableCell>
        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
          {ready ? (
            <CallPlayer callId={call.id} recordingEnabled={call.recording_enabled} />
          ) : processing ? (
            <span className="text-[10px] text-gray-500 dark:text-gray-400" title="Procesando grabación…">…</span>
          ) : (
            <span className="text-gray-300 dark:text-gray-600">—</span>
          )}
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow className="border-gray-200 dark:border-gray-700">
          <TableCell colSpan={9} className="p-0">
            <CallRowDetail callId={call.id} recordingEnabled={call.recording_enabled} opportunityId={call.opportunity_id} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
