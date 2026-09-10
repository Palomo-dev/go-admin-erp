'use client';

import { Pin } from 'lucide-react';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import type { TimelineEntry } from '@/lib/services/crm/timelineService';

/** NoteEntry — nota (tabla notes, HTML del RichTextEditor) o activity 'note'. */
type NoteLike = Extract<TimelineEntry, { kind: 'note' }>;

export function NoteEntry({ entry, compact }: { entry: NoteLike; compact?: boolean }) {
  const html = entry.note?.body ?? entry.activity?.notes ?? '';
  return (
    <div className={entry.note?.is_pinned ? 'rounded-md bg-yellow-50 dark:bg-yellow-900/10 -m-1 p-1' : undefined}>
      {entry.note?.is_pinned && (
        <p className="text-[11px] text-yellow-700 dark:text-yellow-400 inline-flex items-center gap-1 mb-1"><Pin className="h-3 w-3" />Fijada</p>
      )}
      <HtmlContentRenderer html={html} collapsible={!compact} singleLine={compact} className="text-sm text-gray-700 dark:text-gray-300" />
    </div>
  );
}
