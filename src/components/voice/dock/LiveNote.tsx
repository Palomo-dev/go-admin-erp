'use client';

/**
 * LiveNote — nota en vivo durante la llamada (FASE-03 §5.2).
 * Autosave con debounce 1,5 s → PATCH /api/crm/calls/[id] { live_note } cuando
 * ya se conoce `calls.id`; al colgar se precarga en el diálogo de disposición.
 */

import { useEffect, useRef, useState } from 'react';
import { StickyNote } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';

interface LiveNoteProps {
  callId: string | null;
  diseno?: 'heredado' | 'kit';
  value: string;
  onChange: (text: string) => void;
}

export function LiveNote({ callId, value, onChange, diseno = 'heredado' }: LiveNoteProps) {
  const t = useTranslations('phoneBrowser');
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<number | null>(null);
  const lastSaved = useRef('');
  const revision = useRef(0);
  const savedCall = useRef<string | null>(null);

  useEffect(() => {
    const current = ++revision.current;
    const controller = new AbortController();
    if (savedCall.current !== callId) { savedCall.current = callId; lastSaved.current = ''; setSaved('idle'); }
    if (!callId || value === lastSaved.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaved('saving');
      try {
        const res = await fetch(`/api/crm/calls/${callId}`, {
          method: 'PATCH',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ live_note: value }),
        });
        if (!res.ok) throw new Error(String(res.status));
        if (current !== revision.current || controller.signal.aborted) return;
        lastSaved.current = value;
        setSaved('saved');
      } catch {
        if (current === revision.current && !controller.signal.aborted) setSaved('error');
      }
    }, 1500);
    return () => {
      controller.abort();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [callId, value]);

  return (
    <div>
      <label htmlFor="softphone-live-note" className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span className={cn('inline-flex items-center gap-2', diseno === 'kit' && 'font-semibold text-fg')}>{diseno === 'kit' && <StickyNote size={14} strokeWidth={1.5} />}{t('liveNotes')}</span>
        <span aria-live="polite">{saved === 'saving' ? t('saving') : saved === 'saved' ? t('noteSaved') : saved === 'error' ? t('noteUnsaved') : callId ? '' : t('noteAtHangup')}</span>
      </label>
      <Textarea
        id="softphone-live-note"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder={t('liveNotePlaceholder')}
        className={cn('text-sm', diseno === 'kit' && 'h-[84px] min-h-[84px] rounded-lg border-line-strong bg-surface px-2.5 py-2 text-[13px] leading-[18px] text-fg dark:bg-surface dark:text-fg')}
      />
    </div>
  );
}
