'use client';

import { CalendarClock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { CampoHora } from '@/components/kit/CampoHora';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { combinarFechaHora, partirFechaHora } from '@/components/crm/kit/fechasCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';

/** Presentación compacta: conserva la misma fecha local y los controles del kit. */
export function DispositionDueField({ value, onChange, disabled }: { value: string; onChange(value: string): void; disabled?: boolean }) {
  const t = useTranslations('phoneBrowser');
  const dates = useFormatDate();
  const local = partirFechaHora(value);
  return <Popover><PopoverTrigger asChild><button type="button" disabled={disabled} aria-label={t('followupDate')} className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-left text-xs font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"><CalendarClock size={16} strokeWidth={1.5} className="shrink-0 text-fg-secondary" /><span className="truncate">{local.dia ? dates.formatPlain(local.dia) : t('followupDate')}{local.hora ? ` · ${local.hora}` : ''}</span></button></PopoverTrigger>
    <PopoverContent align="end" className="z-[70] w-80 space-y-3 rounded-xl border-line bg-surface p-3"><CampoFecha valor={local.dia} onValorChange={day => onChange(combinarFechaHora(day, local.hora))} disabled={disabled} aria-label={t('followupDate')} /><CampoHora valor={local.hora} onValorChange={hour => onChange(combinarFechaHora(local.dia, hour))} disabled={disabled} aria-label={t('followupTime')} /></PopoverContent>
  </Popover>;
}
