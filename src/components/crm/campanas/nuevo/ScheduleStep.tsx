'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useTranslations } from 'next-intl';

/** Paso 3 del wizard: programación, throttle (1–80 msg/s) y horario permitido. */
export function ScheduleStep(p: { scheduledAt: string | null; onScheduledAt: (v: string | null) => void; throttle: number; onThrottle: (v: number) => void; respectHours: boolean; onRespectHours: (v: boolean) => void }) {
  const t = useTranslations('crm.campanasLista');
  const minutes = p.throttle > 0 ? Math.ceil(1000 / p.throttle / 60) : 0;
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="camp-when" className="text-xs">{t('scheduleStep.enviar')}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`text-xs px-3 py-1.5 rounded-md border ${!p.scheduledAt ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300' : 'border-gray-200 dark:border-gray-700'}`} onClick={() => p.onScheduledAt(null)}>{t('scheduleStep.ahora')}</button>
          <Input id="camp-when" type="datetime-local" className="h-9 w-56 bg-gray-50 dark:bg-gray-900 text-sm" value={p.scheduledAt ? p.scheduledAt.slice(0, 16) : ''} min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)} onChange={(e) => p.onScheduledAt(e.target.value ? new Date(e.target.value).toISOString() : null)} aria-label={t('scheduleStep.fechaHoraEnvio')} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="camp-throttle" className="text-xs">{t('scheduleStep.velocidadMensajesSegundoMin', { throttle: p.throttle, throttle2: p.throttle * 60, minutes })}</Label>
        <Slider id="camp-throttle" min={1} max={80} step={1} value={[p.throttle]} onValueChange={(v: number[]) => p.onThrottle(v[0] ?? 10)} aria-valuemin={1} aria-valuemax={80} aria-valuenow={p.throttle} />
        <p className="text-[11px] text-gray-500">{t('scheduleStep.metaPermiteHasta80')}</p>
      </div>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={p.respectHours} onCheckedChange={(v) => p.onRespectHours(v === true)} />{t('scheduleStep.respetarHorarioPermitidoContacto')}</label>
    </div>
  );
}
