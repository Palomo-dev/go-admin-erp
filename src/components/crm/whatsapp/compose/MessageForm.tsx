'use client';

import { useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { VARIABLE_CATALOG } from '@/lib/services/crm/email/variables';
import { MediaAttachment } from './MediaAttachment';
import type { MediaValue } from './useWhatsAppCompose';

const QUICK_VARS = VARIABLE_CATALOG.filter((v) => ['contact.first_name', 'contact.full_name', 'opportunity.name', 'opportunity.amount', 'user.first_name', 'org.name'].includes(v.path));

/** Texto libre (≤4096) + variables + adjunto + programación. */
export function MessageForm(p: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  disabledReason?: string;
  media: MediaValue | null;
  onMedia: (m: MediaValue | null) => void;
  allowMedia: boolean;
  opportunityId?: string | null;
  scheduledAt: string | null;
  onScheduledAt: (v: string | null) => void;
  firstName?: string | null;
}) {
  const [schedule, setSchedule] = useState(!!p.scheduledAt);
  const insert = (path: string) => p.onChange(`${p.value}${p.value && !p.value.endsWith(' ') ? ' ' : ''}{{${path}}}`);
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor="wa-text" className="text-xs">Mensaje</Label>
        <Textarea id="wa-text" value={p.value} onChange={(e) => p.onChange(e.target.value.slice(0, 4096))} rows={5} maxLength={4096} disabled={p.disabled} aria-disabled={p.disabled} aria-describedby="wa-text-help" placeholder={p.disabled ? p.disabledReason : `Hola ${p.firstName ?? '{{contact.first_name}}'}, ¿pudiste ver la propuesta?`} className="bg-white dark:bg-gray-900 text-sm" />
        <div id="wa-text-help" className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
          <span>{p.disabled ? p.disabledReason : 'Las variables {{…}} se resuelven con los datos del cliente y la oportunidad.'}</span>
          <span>{p.value.length} / 4096</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {QUICK_VARS.map((v) => (
          <button key={v.path} type="button" disabled={p.disabled} onClick={() => insert(v.path)} className="rounded border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 text-[10px] font-mono text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50" title={v.label}>{`{{${v.path}}}`}</button>
        ))}
        {p.allowMedia && <MediaAttachment opportunityId={p.opportunityId} value={p.media} onChange={p.onMedia} disabled={p.disabled} />}
      </div>
      <div className="flex items-center gap-2">
        {!schedule ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSchedule(true)}><CalendarClock className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Programar</Button>
        ) : (
          <>
            <Label htmlFor="wa-schedule" className="text-xs">Enviar el</Label>
            <Input id="wa-schedule" type="datetime-local" className="h-8 w-52 text-xs bg-white dark:bg-gray-900" value={p.scheduledAt ? p.scheduledAt.slice(0, 16) : ''} min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)} onChange={(e) => p.onScheduledAt(e.target.value ? new Date(e.target.value).toISOString() : null)} />
            <button type="button" aria-label="Quitar programación" className="text-gray-400 hover:text-red-600" onClick={() => { setSchedule(false); p.onScheduledAt(null); }}><X className="h-3.5 w-3.5" /></button>
          </>
        )}
      </div>
    </div>
  );
}
