'use client';
import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { Switch } from '@/components/ui/switch';
import type { HealthIndicatorJson } from '@/lib/services/crm/healthBands';

export function HealthFactorRow({ indicator, disabled, onChange }: { indicator: HealthIndicatorJson; disabled: boolean; onChange: (next: HealthIndicatorJson) => void }) {
  const t = useTranslations('crm.salud');
  const previousWeight = useRef(indicator.weight || 10);
  if (indicator.weight > 0) previousWeight.current = indicator.weight;
  const title = t.has(`indicatorLabels.${indicator.key}`) ? t(`indicatorLabels.${indicator.key}`) : indicator.label;
  const thresholds = [...indicator.thresholds].sort((a, b) => indicator.direction === 'lower_better' ? (a.max ?? 0) - (b.max ?? 0) : (b.min ?? 0) - (a.min ?? 0));
  return <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
    <div className="min-w-40 flex-1"><label htmlFor={`weight-${indicator.key}`} className="text-sm font-medium text-fg">{title}</label><p className="mt-1 text-xs text-fg-secondary">{thresholds.map(threshold => `${indicator.direction === 'lower_better' ? '≤' : '≥'} ${threshold.max ?? threshold.min}: ${threshold.score}`).join(' · ')}</p></div>
    <CampoNumero id={`weight-${indicator.key}`} className="max-w-32" valor={indicator.weight} decimales={0} minimo={0} maximo={100} sufijo="%" disabled={disabled} onValorChange={value => onChange({ ...indicator, weight: value ?? 0 })} />
    <Switch checked={indicator.weight > 0} disabled={disabled} aria-label={t('enableIndicator', { indicator: title })} onCheckedChange={checked => onChange({ ...indicator, weight: checked ? previousWeight.current : 0 })} />
  </div>;
}
