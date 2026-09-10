'use client';

/**
 * Programar envío: presets + datetime-local (≤30 días). ≤1 h lo programa
 * Resend (scheduledAt); >1 h va a outbound_jobs (lo decide el servidor).
 */

import { useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props {
  value: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
}

const MAX_DAYS = 30;

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function preset(kind: 'tomorrow8' | 'monday9' | 'in1h' | 'in3h'): string {
  const d = new Date();
  if (kind === 'in1h') d.setHours(d.getHours() + 1, d.getMinutes() + 1, 0, 0);
  else if (kind === 'in3h') d.setHours(d.getHours() + 3, 0, 0, 0);
  else if (kind === 'tomorrow8') { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); }
  else { const add = ((8 - d.getDay()) % 7) || 7; d.setDate(d.getDate() + add); d.setHours(9, 0, 0, 0); }
  return d.toISOString();
}

export function ScheduleSendPopover({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (iso: string | null) => {
    if (iso) {
      const t = new Date(iso).getTime();
      if (Number.isNaN(t)) { setError('Fecha inválida'); return; }
      if (t < Date.now() + 60_000) { setError('Debe ser al menos 1 minuto en el futuro'); return; }
      if (t > Date.now() + MAX_DAYS * 86_400_000) { setError(`Máximo ${MAX_DAYS} días`); return; }
    }
    setError(null);
    onChange(iso);
  };

  const label = value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Programar';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant={value ? 'secondary' : 'outline'} size="sm" disabled={disabled} className="gap-1 dark:border-gray-600 dark:text-gray-200" aria-label={value ? `Programado para ${label}` : 'Programar envío'}>
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3 dark:bg-gray-800" align="end">
        <div className="grid grid-cols-2 gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => set(preset('in1h'))}>En 1 hora</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => set(preset('in3h'))}>En 3 horas</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => set(preset('tomorrow8'))}>Mañana 8:00</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => set(preset('monday9'))}>Lunes 9:00</Button>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sched-dt" className="text-xs">Fecha y hora</Label>
          <Input id="sched-dt" type="datetime-local" value={value ? toLocalInput(value) : ''} onChange={(e) => set(e.target.value ? new Date(e.target.value).toISOString() : null)} className="h-8 text-sm dark:bg-gray-900" />
          {error && <p className="text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>}
        </div>
        <div className="flex justify-between">
          <Button type="button" size="sm" variant="ghost" onClick={() => { set(null); setOpen(false); }} disabled={!value} className="gap-1"><X className="h-3.5 w-3.5" aria-hidden="true" /> Quitar</Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>Listo</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
