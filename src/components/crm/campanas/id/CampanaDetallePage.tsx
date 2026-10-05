"use client";
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { Download, RefreshCw, Send } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatCard } from '@/components/kit/StatCard';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { Dialogo } from '@/components/kit/Dialogo';
import { FilaDato, ListaDatos } from '@/components/kit/FilaDato';
import { clasesBoton } from '@/components/kit/botonClases';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { CampanasService } from '../CampanasService';
import { CampaignCompliancePanel } from '../CampaignCompliancePanel';
import { CampaignContactsTable } from './CampaignContactsTable';
import { resumenCampana, campaignPauseKey } from './campanaDetalleLogica';
import { useDetalleCampana } from './useDetalleCampana';

function Detalle({ campaignId }: { campaignId: string }) {
  const t = useTranslations('crm.campanasDetalle');
  const c = useTranslations('crm.campanasNuevo');
  const f = useFormatter();
  const { formatDateTime } = useFormatDate(null);
  const { campaign, stats, canManage, loading, error, forbidden, notFound, load } = useDetalleCampana(campaignId);
  const [busy, setBusy] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [actionError, setActionError] = useState(false);
  const refresh = useCallback(() => { void load(true); }, [load]);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setActionError(false);
    try { await fn(); setCancel(false); await load(); } catch { setActionError(true); } finally { setBusy(false); }
  };
  const es = campaign?.effective_status;
  const k = stats ? resumenCampana(stats) : null;
  const reasonLabel = (code: string) => t.has(`razones.${code}`) ? t(`razones.${code}`) : t('otraExclusion');
  const money = (value: number | null) => value === null ? t('precioPendiente') : f.number(value, { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const navigation = <>
    <Link href="/app/crm/campanas" className={clasesBoton({ variante: 'secundario' })}>{t('volver')}</Link>
    <button className={clasesBoton({ variante: 'fantasma' })} onClick={refresh} disabled={busy || loading} aria-label={t('actualizar')}><RefreshCw className="size-4" aria-hidden="true" /></button>
    {campaign && <a className={clasesBoton({ variante: 'secundario' })} href={CampanasService.csvUrl(campaignId)} download><Download className="size-4" aria-hidden="true" />{t('exportar')}</a>}
  </>;
  const management = canManage && campaign && <>
      {es === 'draft' && <>
        <button className={clasesBoton({ variante: 'secundario' })} disabled={busy} onClick={() => void act(() => CampanasService.materialize(campaignId))}>{t('calcular')}</button>
        <button className={clasesBoton()} disabled={busy || !allowed || !campaign.statistics.materialized_at || !k?.remaining} onClick={() => void act(() => CampanasService.launch(campaignId))}>{t('lanzar')}</button>
      </>}
      {['sending', 'scheduled'].includes(es ?? '') && <button className={clasesBoton({ variante: 'secundario' })} disabled={busy} onClick={() => void act(() => CampanasService.pause(campaignId))}>{t('pausar')}</button>}
      {es === 'paused' && <button className={clasesBoton({ variante: 'secundario' })} disabled={busy || !allowed} onClick={() => void act(() => CampanasService.resume(campaignId))}>{t('reanudar')}</button>}
      {['draft', 'sending', 'scheduled', 'paused'].includes(es ?? '') && <button className={clasesBoton({ variante: 'destructivo' })} disabled={busy} onClick={() => { setActionError(false); setCancel(true); }}>{t('cancelar')}</button>}
  </>;
  return <div className="space-y-5 bg-canvas p-4 sm:p-6 lg:p-8">
    <PageHeader variante="detail" titulo={campaign?.name ?? t('titulo')} icono={Send}
      badge={es && <StatusBadge estado={es} etiqueta={c(`estados.${es}`)} />}
      subtitulo={campaign && `${t(campaign.channel === 'email' ? 'email' : 'whatsapp')} · ${campaign.scheduled_at ? t('programada', { fecha: formatDateTime(campaign.scheduled_at) }) : t('sinProgramar')}`}
      acciones={navigation} debajo={<><div className="flex flex-wrap gap-2 lg:hidden">{navigation}</div>{management}</>} />
    {loading ? <Skeleton className="h-72" /> : error || !campaign || !stats || !k ? <EmptyState variante={forbidden ? 'forbidden' : 'error'} titulo={t(forbidden ? 'sinPermiso' : notFound ? 'noEncontrada' : 'error')} onReintentar={refresh} /> : <>
      {actionError && !cancel && <p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">{t('errorAccion')}</p>}
      {!canManage && <p className="text-sm text-fg-secondary">{t('sinGestion')}</p>}
      {es === 'paused' && <p role="status" className="rounded-lg bg-warning-subtle p-3 text-sm text-warning-text">{t(`pausas.${campaignPauseKey(campaign.statistics.template_paused ? 'template_paused' : campaign.statistics.pause_reason)}`)}</p>}
      <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
        <Progress value={k.percentage} aria-label={t('progresoEtiqueta', { n: k.percentage })} />
        <p className="text-sm text-fg">{t('progreso', { n: k.processed, total: k.total })}</p>
        <p className="text-xs text-fg-secondary">{t('pendientes', { n: k.remaining })}</p>
      </section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {(['sent', 'delivered', 'read', 'replied', 'failed', 'skipped', 'pending'] as const).map(key => <StatCard key={key} etiqueta={t(`estadosContacto.${key}`)} valor={f.number(key === 'pending' ? k.remaining : k.counts[key])} />)}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
            <h2 className="text-base font-semibold text-fg">{t('costo')}</h2>
            <ListaDatos><FilaDato etiqueta={t('estimado')} valor={money(k.estimatedCost)} /><FilaDato etiqueta={t('real')} valor={money(k.actualCost)} />
              {k.actualCost === null && <FilaDato etiqueta={t('subtotal')} valor={money(k.knownCost)} />}
            </ListaDatos>
            {k.unpriced > 0 && <p className="text-xs text-warning-text">{t('sinPrecio', { n: k.unpriced })}</p>}
            <p className="text-xs text-fg-secondary">{t('costoNota')}</p>
          </section>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['by_error_code', 'by_skip_reason'] as const).map(key => <section key={key} className="space-y-2 rounded-xl border border-line bg-surface p-4">
              <h2 className="text-base font-semibold text-fg">{t(key === 'by_error_code' ? 'errores' : 'exclusiones')}</h2>
              {Object.entries(stats[key]).length ? <ListaDatos>{Object.entries(stats[key]).map(([code, n]) => <FilaDato key={code} etiqueta={key === 'by_error_code' ? t('errorProveedor', { code }) : reasonLabel(code)} valor={f.number(n)} />)}</ListaDatos> : <p className="text-xs text-fg-secondary">{t(key === 'by_error_code' ? 'sinErrores' : 'sinExclusiones')}</p>}
            </section>)}
          </div>
        </div>
        <CampaignCompliancePanel key={campaignId} campaignId={campaignId} onChanged={refresh} onAllowed={setAllowed} />
      </div>
      <CampaignContactsTable campaignId={campaignId} refreshKey={JSON.stringify(stats.counts)} />
    </>}
    <Dialogo abierto={cancel} onAbiertoChange={setCancel} titulo={t('confirmar')} descripcion={t('confirmarDetalle')}
      primario={{ etiqueta: t('cancelar'), destructiva: true, cargando: busy, onClick: () => void act(() => CampanasService.cancel(campaignId)) }}>
      {actionError && <p role="alert" className="text-sm text-danger-text">{t('errorAccion')}</p>}
    </Dialogo>
  </div>;
}
export function CampanaDetallePage({ campaignId }: { campaignId: string }) {
  const { organization } = useOrganization();
  return <Detalle key={`${organization?.id ?? ''}:${campaignId}`} campaignId={campaignId} />;
}
