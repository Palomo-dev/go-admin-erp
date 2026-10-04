'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar, Check, Loader2, MapPin, Pencil, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import type { TimelineEntry } from '@/lib/services/crm/timelineService';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { claveError, emitirCambioCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { EntryAction } from '../TimelineEntryCard';
import { EditarReunionDialog } from './EditarReunionDialog';

/** MeetingEntry — título, rango horario, ubicación, estado; "Realizada"/"Cancelar" → PATCH /api/crm/meetings/[id]. */
type MeetingLike = Extract<TimelineEntry, { kind: 'meeting' }>;

export function MeetingEntry({ entry, onAction }: { entry: MeetingLike; onAction?: (a: EntryAction, e: TimelineEntry) => void }) {
  const t = useTranslations('crm.historial.reunion');
  const errores = useTranslations('crm.accionesRapidas.errores');
  const { timezone } = useFormatDate(null);
  const locale = useLocaleIntl();
  const a = entry.activity;
  const [eventoGuardado, setEventoGuardado] = useState<{ actividad: typeof a; evento: NonNullable<typeof entry.event> } | null>(null);
  const [editando, setEditando] = useState(false);
  const ev = eventoGuardado?.actividad === a ? eventoGuardado.evento : entry.event;
  const md = a.metadata as { event_id?: string; end_at?: string; location?: string | null };
  const eventId = ev?.id ?? md.event_id;
  const [estadoGuardado, setEstadoGuardado] = useState<{ actividad: typeof a; estado: string } | null>(null);
  const outcome = estadoGuardado?.actividad === a ? estadoGuardado.estado : a.outcome ?? 'scheduled';
  const [busy, setBusy] = useState<string | null>(null);
  const start = ev?.start_at ?? entry.occurred_at;
  const end = ev?.end_at ?? md.end_at ?? null;
  const location = ev?.location ?? md.location ?? null;
  const title = ev?.title ?? ((a.notes ?? '').split('\n')[0] || t('titulo'));
  const upcoming = Date.parse(start) > Date.now();

  const patch = async (status: 'done' | 'canceled') => {
    if (!eventId) return;
    setBusy(status);
    try {
      await pedirCrm(`/api/crm/meetings/${eventId}`, { method: 'PATCH', cuerpo: { status } });
      setEstadoGuardado({ actividad: a, estado: status });
      toast({ title: t(status === 'done' ? 'guardadaRealizada' : 'guardadaCancelada') });
      emitirCambioCrm({ entidad: 'activity', id: a.id, accion: 'reunion' });
      onAction?.('changed', entry);
    } catch (e) {
      toast({ title: t('errorActualizar'), description: errores(claveError(e)), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
        <Badge variant={outcome === 'done' ? 'success' : outcome === 'canceled' ? 'secondary' : upcoming ? 'info' : 'warning'} className="text-[11px]">
          {t(outcome === 'done' ? 'realizada' : outcome === 'canceled' ? 'cancelada' : upcoming ? 'programada' : 'pendiente')}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600 dark:text-gray-400">
        <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDateInTz(start, timezone, { locale, dateStyle: 'short', timeStyle: 'short' })}{end ? ` – ${formatDateInTz(end, timezone, { locale, timeStyle: 'short' })}` : ''}</span>
        {location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{/^https?:\/\//.test(location) ? <a href={location} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{location}</a> : location}</span>}
      </div>
      {ev?.title !== undefined && ev.end_at && (
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditando(true)} disabled={busy !== null}>
          <Pencil aria-hidden="true" className="h-3 w-3 mr-1" />{t('editar')}
        </Button>
      )}
      {editando && ev && <EditarReunionDialog evento={ev} timezone={timezone} onCerrar={() => setEditando(false)} onGuardada={evento => {
        setEventoGuardado({ actividad: a, evento }); setEditando(false);
        toast({ title: t('guardada') });
        emitirCambioCrm({ entidad: 'activity', id: a.id, accion: 'reunion' });
        onAction?.('changed', entry);
      }} />}
      {eventId && outcome === 'scheduled' && (
        <div className="flex gap-1.5 pt-0.5">
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => patch('done')} disabled={busy !== null || upcoming} title={upcoming ? t('futura') : undefined}>
            {busy === 'done' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}{t('realizada')}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-red-600 dark:text-red-400" onClick={() => patch('canceled')} disabled={busy !== null}>
            {busy === 'canceled' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <X className="h-3 w-3 mr-1" />}{t('cancelar')}
          </Button>
        </div>
      )}
    </div>
  );
}
