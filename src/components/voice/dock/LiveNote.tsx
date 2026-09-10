'use client';

/**
 * LiveNote — nota en vivo durante la llamada (FASE-03 §5.2).
 * Autosave con debounce 1,5 s → PATCH /api/crm/calls/[id] { live_note } cuando
 * ya se conoce `calls.id`; al colgar se precarga en el diálogo de disposición.
 */

import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface LiveNoteProps {
  callId: string | null;
  value: string;
  onChange: (text: string) => void;
}

export function LiveNote({ callId, value, onChange }: LiveNoteProps) {
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<number | null>(null);
  const lastSaved = useRef('');

  useEffect(() => {
    if (!callId || value === lastSaved.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaved('saving');
      try {
        const res = await fetch(`/api/crm/calls/${callId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ live_note: value }),
        });
        if (!res.ok) throw new Error(String(res.status));
        lastSaved.current = value;
        setSaved('saved');
      } catch {
        setSaved('error');
      }
    }, 1500);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [callId, value]);

  return (
    <div>
      <label htmlFor="softphone-live-note" className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>Nota en vivo</span>
        <span aria-live="polite">{saved === 'saving' ? 'Guardando…' : saved === 'saved' ? 'Guardada' : saved === 'error' ? 'Sin guardar' : callId ? '' : 'Se guardará al colgar'}</span>
      </label>
      <Textarea
        id="softphone-live-note"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="Apuntes durante la llamada…"
        className="text-sm"
      />
    </div>
  );
}
