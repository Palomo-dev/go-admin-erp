'use client';

import { Badge } from '@/components/ui/badge';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import type { TimelineEntry } from '@/lib/services/crm/timelineService';
import { formatDuration } from '../utils';

/** Entrada genérica: actividades manuales (visit, sms, whatsapp registrado a mano, task…). */
const LABELS: Record<string, string> = {
  visit: 'Visita', sms: 'SMS', whatsapp: 'WhatsApp', task: 'Tarea', call: 'Llamada', email: 'Email',
};

export function GenericEntry({ entry }: { entry: TimelineEntry }) {
  if (entry.kind !== 'activity' && entry.kind !== 'sms') return null;
  const a = entry.activity;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-[11px]">{LABELS[a.activity_type] ?? a.activity_type}</Badge>
        {a.channel && a.channel !== a.activity_type && <Badge variant="outline" className="text-[11px]">{a.channel}</Badge>}
        {a.outcome && <Badge variant="outline" className="text-[11px]">{a.outcome}</Badge>}
        {a.duration_seconds != null && a.duration_seconds > 0 && (
          <span className="text-[11px] text-gray-500 dark:text-gray-400">{formatDuration(a.duration_seconds)}</span>
        )}
      </div>
      {a.notes && <HtmlContentRenderer html={a.notes} collapsible className="text-sm text-gray-700 dark:text-gray-300" />}
    </div>
  );
}
