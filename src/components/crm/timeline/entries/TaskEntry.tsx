'use client';

import { useState } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { opportunitiesService } from '@/components/crm/oportunidades/opportunitiesService';
import type { TimelineEntry } from '@/lib/services/crm/timelineService';
import { formatDateTime } from '../utils';
import type { EntryAction } from '../TimelineEntryCard';

/** TaskEntry — título, checkbox de estado (open ↔ done), prioridad y vencimiento (rojo si vencida). */
type TaskLike = Extract<TimelineEntry, { kind: 'task' }>;

const PRIORITY: Record<string, { label: string; cls: string }> = {
  low: { label: 'Baja', cls: 'text-gray-500' },
  med: { label: 'Media', cls: 'text-blue-600 dark:text-blue-400' },
  high: { label: 'Alta', cls: 'text-amber-600 dark:text-amber-400' },
  critical: { label: 'Crítica', cls: 'text-red-600 dark:text-red-400' },
};

export function TaskEntry({ entry, onAction }: { entry: TaskLike; onAction?: (a: EntryAction, e: TimelineEntry) => void }) {
  const [status, setStatus] = useState(entry.task.status);
  const [saving, setSaving] = useState(false);
  const done = status === 'done';
  const overdue = !done && entry.task.due_date != null && Date.parse(entry.task.due_date) < Date.now();
  const pr = entry.task.priority ? PRIORITY[entry.task.priority] : null;

  const toggle = async () => {
    const next = done ? 'open' : 'done';
    setSaving(true);
    setStatus(next);
    try {
      await opportunitiesService.updateTask(entry.task.id, { status: next, completed_at: next === 'done' ? new Date().toISOString() : null });
      onAction?.('changed', entry);
    } catch (e) {
      setStatus(status);
      toast({ title: 'No se pudo actualizar la tarea', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-2">
      <div className="pt-0.5">
        {saving ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : <Checkbox checked={done} onCheckedChange={toggle} aria-label={done ? 'Reabrir tarea' : 'Marcar como hecha'} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium', done ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100')}>{entry.task.title}</p>
        {entry.task.description && <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">{entry.task.description}</p>}
        <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
          <Badge variant={done ? 'success' : status === 'in_progress' ? 'info' : status === 'canceled' ? 'secondary' : 'warning'} className="text-[11px]">{done ? 'hecha' : status === 'in_progress' ? 'en curso' : status === 'canceled' ? 'cancelada' : 'pendiente'}</Badge>
          {pr && <span className={pr.cls}>Prioridad {pr.label.toLowerCase()}</span>}
          {entry.task.due_date && (
            <span className={cn('inline-flex items-center gap-1', overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400')}>
              <Calendar className="h-3 w-3" />{overdue ? 'Vencida ' : 'Vence '}{formatDateTime(entry.task.due_date)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
