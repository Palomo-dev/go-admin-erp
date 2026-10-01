'use client';

import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import { FormField } from '@/components/kit/FormField';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { CampoFechaHora } from '@/components/crm/kit/CampoFechaHora';
import { Slider } from '@/components/ui/slider';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { minutosMinimosCampana, type ErrorProgramacion, type ModoProgramacion } from './programacionCampanaLogica';

/** Figma 1402:821: programación en zona de organización y cumplimiento obligatorio. */
export function ScheduleStep(p: {
  mode: ModoProgramacion; onMode: (v: ModoProgramacion) => void;
  local: string; onLocal: (v: string) => void; error: ErrorProgramacion | null;
  throttle: number; onThrottle: (v: number) => void; disabled?: boolean;
}) {
  const t = useTranslations('crm.campanasAsistente.programacion');
  const { timezone, getToday } = useFormatDate(null);
  const min = getToday();
  return <div className="space-y-5">
    <FormField etiqueta={t('enviar')}>
      {campo => <SegmentedControl aria-labelledby={campo.idEtiqueta} valor={p.mode} onValorChange={p.onMode}
        opciones={[{ valor: 'now', etiqueta: t('ahora') }, { valor: 'scheduled', etiqueta: t('programar') }]}
        anchoCompleto className="flex-col items-stretch sm:flex-row" deshabilitado={p.disabled} />}
    </FormField>
    {p.mode === 'scheduled' && <FormField etiqueta={t('fecha')} obligatorio ayuda={t('zona', { zona: timezone })} error={p.error && t(p.error)}>
      <CampoFechaHora valor={p.local} onValorChange={p.onLocal} min={min} disabled={p.disabled} />
    </FormField>}
    <FormField etiqueta={t('velocidad', { n: p.throttle })} ayuda={t('estimacion', {
      n: p.throttle * 60, minutos: minutosMinimosCampana(1000, p.throttle),
    })}>
      <Slider min={1} max={80} step={1} value={[p.throttle]} disabled={p.disabled}
        onValueChange={v => p.onThrottle(v[0] ?? 10)} aria-valuemin={1} aria-valuemax={80} aria-valuenow={p.throttle} />
    </FormField>
    <p className="text-xs text-fg-secondary">{t('limites')}</p>
    <div className="flex gap-2 rounded-lg border border-line-success bg-success-subtle p-3 text-sm text-success-text">
      <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div><p className="font-medium">{t('legal')}</p><p className="mt-1 text-xs">{t('legalDetalle')}</p></div>
    </div>
  </div>;
}
