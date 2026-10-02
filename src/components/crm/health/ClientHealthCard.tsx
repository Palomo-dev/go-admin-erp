'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { HeartPulse } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/kit/EmptyState';
import { FormSection } from '@/components/kit/FormSection';
import { healthScoreService } from '@/lib/services/crm/healthScoreService';
import type { HealthCustomerDetail } from '@/lib/services/crm/healthReadService';
import { ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import { claveError } from '@/components/crm/acciones/apiCrm';
import { HealthGauge } from './HealthGauge';
import { HealthTrend } from './HealthTrend';
import { HealthAlerts } from './HealthAlerts';
import { HealthDimensions } from './HealthDimensions';
interface ClientHealthCardProps { customerId: string; customerName: string; lifecycleStage?: string | null }
/** Texto honesto cuando no hay score (F11 r2): la salud se mide solo para clientes. */
export function noHealthMessage(input: { customerName: string; lifecycleStage: string | null | undefined; invoices: number }): string {
  const stage = input.lifecycleStage ?? null;
  if (stage && stage !== 'customer') {
    const n = input.invoices;
    const facturas = n === 1 ? '1 factura' : `${n} facturas`;
    const etapa = stage === 'lead' ? 'un lead' : stage === 'prospect' ? 'un prospecto' : `«${stage}»`;
    return n > 0
      ? `La salud se mide solo para clientes; esta ficha es ${etapa} con ${facturas}. Cámbialo a cliente para medirlo.`
      : `La salud se mide solo para clientes; esta ficha es ${etapa} sin facturas.`;
  }
  return `Sin datos de salud para ${input.customerName}: aún no tiene facturas ni actividad medibles.`;
}

export function ClientHealthCard({ customerId, customerName, lifecycleStage }: ClientHealthCardProps) {
  const t = useTranslations('crm.salud'); const errors = useTranslations('crm.accionesRapidas.errores');
  const [data, setData] = useState<HealthCustomerDetail | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const load = useCallback(async () => {
    const current = ++revision.current; setLoading(true); setError(null);
    try { const result = await healthScoreService.getDetail(customerId, 20); if (current === revision.current) setData(result); }
    catch (e) { if (current === revision.current) setError(errors(claveError(e))); }
    finally { if (current === revision.current) setLoading(false); }
  }, [customerId, errors]);
  useEffect(() => { setData(null); void load(); return () => { revision.current += 1; }; }, [load]);
  useEffect(() => { const change = () => { revision.current += 1; setData(null); void load(); }; window.addEventListener(ORGANIZATION_CHANGED_EVENT, change); return () => window.removeEventListener(ORGANIZATION_CHANGED_EVENT, change); }, [load]);
  const health = data?.health;
  return <FormSection titulo={t('customerHealth')} icono={HeartPulse}>
    {loading ? <div aria-busy="true"><Skeleton className="h-32 w-full" /><span className="sr-only">{t('loading')}</span></div> : error ? <EmptyState variante="error" titulo={t('loadError')} descripcion={error} onReintentar={() => void load()} /> : !health ? <p className="text-xs text-fg-secondary">{lifecycleStage && lifecycleStage !== 'customer' ? t('nonCustomer', { stage: lifecycleStage, invoices: data?.invoice_count ?? 0 }) : t('customerEmpty', { customer: customerName })}</p> : <>
      <div className="flex items-start gap-4"><HealthGauge score={health.score} band={health.band} /><HealthAlerts alerts={(health.alerts ?? []).slice(0, 3)} raw={health.raw} /></div>
      <HealthDimensions indicators={health.indicators} />
      {data?.history_error ? <EmptyState variante="error" titulo={t('trend.error')} onReintentar={() => void load()} /> : <HealthTrend snapshots={data?.history ?? []} band={health.band} />}
    </>}
  </FormSection>;
}
export default ClientHealthCard;
