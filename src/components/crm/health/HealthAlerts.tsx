'use client';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { HealthAlert, HealthRpcRow } from '@/lib/services/crm/healthBands';
export interface HealthAlertsProps { alerts: HealthAlert[]; raw?: HealthRpcRow; className?: string; emptyText?: string; compact?: boolean }
const SEVERITY = {
  red: { box: 'bg-danger-subtle border-line-danger', text: 'text-danger-text', icon: AlertTriangle },
  yellow: { box: 'bg-warning-subtle border-line-warning', text: 'text-warning-text', icon: CircleAlert },
} as const;
export function HealthAlerts({ alerts, raw, className = '', emptyText, compact = false }: HealthAlertsProps) {
  const t = useTranslations('crm.salud');
  const { formatear } = useMonedaOrganizacion();
  const message = (alert: HealthAlert) => !raw ? alert.message : alert.code === 'overdue' ? t('alerts.overdue', { amount: formatear(raw.overdue_balance), percentage: Math.round(raw.overdue_ratio * 100) }) : alert.code === 'no_activity' ? raw.days_since_last_activity === null ? t('alerts.activityMissing') : t('alerts.noActivity', { days: raw.days_since_last_activity }) : raw.days_since_last_invoice === null ? t('alerts.invoiceMissing') : t('alerts.noInvoice', { days: raw.days_since_last_invoice });
  const Wrap = compact ? 'span' : 'p';
  if (!alerts.length) return <Wrap className={`inline-flex items-center gap-1.5 text-xs text-success-text ${className}`}><CheckCircle2 className="size-3.5 shrink-0" aria-hidden />{emptyText ?? t('alerts.none')}</Wrap>;
  if (compact) {
    const first = alerts[0]; const s = SEVERITY[first.severity]; const Icon = s.icon;
    return <span className={`flex items-center gap-1.5 text-xs ${s.text} ${className}`} title={alerts.map(a => `${t(`severity.${a.severity}`)}: ${message(a)}`).join(' · ')}><Icon className="size-3.5 shrink-0" aria-hidden /><span className="truncate"><span className="font-semibold">{t(`severity.${first.severity}`)}: </span>{message(first)}</span>{alerts.length > 1 && <span className="shrink-0 text-fg-secondary">+{alerts.length - 1}</span>}</span>;
  }
  return <ul className={`space-y-1.5 ${className}`} aria-label={t('alerts.count', { count: alerts.length })}>{alerts.map(a => { const s = SEVERITY[a.severity]; const Icon = s.icon; return <li key={a.code} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${s.box} ${s.text}`}><Icon className="mt-px size-4 shrink-0" aria-hidden /><span><strong>{t(`severity.${a.severity}`)}: </strong>{message(a)}</span></li>; })}</ul>;
}
export default HealthAlerts;
