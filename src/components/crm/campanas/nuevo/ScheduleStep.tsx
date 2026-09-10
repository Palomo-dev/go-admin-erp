'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

/** Paso 3 del wizard: programación, throttle (1–80 msg/s) y horario permitido. */
export function ScheduleStep(p: { scheduledAt: string | null; onScheduledAt: (v: string | null) => void; throttle: number; onThrottle: (v: number) => void; respectHours: boolean; onRespectHours: (v: boolean) => void }) {
  const minutes = p.throttle > 0 ? Math.ceil(1000 / p.throttle / 60) : 0;
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="camp-when" className="text-xs">Enviar</Label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`text-xs px-3 py-1.5 rounded-md border ${!p.scheduledAt ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300' : 'border-gray-200 dark:border-gray-700'}`} onClick={() => p.onScheduledAt(null)}>Ahora</button>
          <Input id="camp-when" type="datetime-local" className="h-9 w-56 bg-gray-50 dark:bg-gray-900 text-sm" value={p.scheduledAt ? p.scheduledAt.slice(0, 16) : ''} min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)} onChange={(e) => p.onScheduledAt(e.target.value ? new Date(e.target.value).toISOString() : null)} aria-label="Fecha y hora de envío" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="camp-throttle" className="text-xs">Velocidad: {p.throttle} mensajes/segundo (≈ {p.throttle * 60}/min · 1.000 contactos en ≈ {minutes} min)</Label>
        <Slider id="camp-throttle" min={1} max={80} step={1} value={[p.throttle]} onValueChange={(v: number[]) => p.onThrottle(v[0] ?? 10)} aria-valuemin={1} aria-valuemax={80} aria-valuenow={p.throttle} />
        <p className="text-[11px] text-gray-500">Meta permite hasta 80 msg/s por número; el límite real es el tier de usuarios únicos/24 h del WABA (se verifica al lanzar).</p>
      </div>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={p.respectHours} onCheckedChange={(v) => p.onRespectHours(v === true)} />Respetar el horario permitido de contacto (Configuración › WhatsApp)</label>
    </div>
  );
}
