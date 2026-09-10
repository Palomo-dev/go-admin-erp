'use client';

import { useState } from 'react';
import { Calendar, Check, Loader2, MapPin, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import type { TimelineEntry } from '@/lib/services/crm/timelineService';
import { formatDateTime, formatTime } from '../utils';
import type { EntryAction } from '../TimelineEntryCard';

/** MeetingEntry — título, rango horario, ubicación, estado; "Realizada"/"Cancelar" → PATCH /api/crm/meetings/[id]. */
type MeetingLike = Extract<TimelineEntry, { kind: 'meeting' }>;

export function MeetingEntry({ entry, onAction }: { entry: MeetingLike; onAction?: (a: EntryAction, e: TimelineEntry) => void }) {
  const a = entry.activity;
  const ev = entry.event;
  const md = a.metadata as { event_id?: string; end_at?: string; location?: string | null };
  const eventId = ev?.id ?? md.event_id;
  const [outcome, setOutcome] = useState(a.outcome ?? 'scheduled');
  const [busy, setBusy] = useState<string | null>(null);
  const start = ev?.start_at ?? entry.occurred_at;
  const end = ev?.end_at ?? md.end_at ?? null;
  const location = ev?.location ?? md.location ?? null;
  const title = (a.notes ?? '').split('\n')[0] || 'Reunión';
  const upcoming = Date.parse(start) > Date.now();

  const patch = async (status: 'done' | 'canceled') => {
    if (!eventId) return;
    setBusy(status);
    try {
      const r = await fetch(`/api/crm/meetings/${eventId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || `Error ${r.status}`);
      setOutcome(status);
      toast({ title: status === 'done' ? 'Reunión marcada como realizada' : 'Reunión cancelada' });
      onAction?.('changed', entry);
    } catch (e) {
      toast({ title: 'No se pudo actualizar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
        <Badge variant={outcome === 'done' ? 'success' : outcome === 'canceled' ? 'secondary' : upcoming ? 'info' : 'warning'} className="text-[11px]">
          {outcome === 'done' ? 'realizada' : outcome === 'canceled' ? 'cancelada' : upcoming ? 'programada' : 'pendiente de confirmar'}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600 dark:text-gray-400">
        <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDateTime(start)}{end ? ` – ${formatTime(end)}` : ''}</span>
        {location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{/^https?:\/\//.test(location) ? <a href={location} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{location}</a> : location}</span>}
      </div>
      {eventId && outcome === 'scheduled' && (
        <div className="flex gap-1.5 pt-0.5">
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => patch('done')} disabled={busy !== null}>
            {busy === 'done' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}Realizada
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-red-600 dark:text-red-400" onClick={() => patch('canceled')} disabled={busy !== null}>
            {busy === 'canceled' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <X className="h-3 w-3 mr-1" />}Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
