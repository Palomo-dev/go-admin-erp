'use client';

/** /app/crm/campanas/[id] (FASE-16 §5.1): progreso en vivo, pausa/reanuda/cancela, errores por código, contactos y CSV. */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Loader2, Megaphone, Pause, Play, RefreshCw, Rocket, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { PageHeaderSkeleton, StatsSkeleton } from '@/components/common/PageSkeletons';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { ERROR_CODE_LABELS, SKIP_REASON_LABELS, type CampaignStatsResult } from '@/components/crm/whatsapp/api';
import { CampanasService } from '../CampanasService';
import { CAMPAIGN_STATUS_CONFIG, type Campaign } from '../types';
import { CampaignContactsTable } from './CampaignContactsTable';

export function CampanaDetallePage({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<CampaignStatsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  /** Lanzar/pausar/reanudar/cancelar exigen admin de organización (tester r1 · fallo 8). */
  const [canManage, setCanManage] = useState(false);

  const load = useCallback(async (sync = false) => {
    try {
      const [r, s] = await Promise.all([CampanasService.getCampaignWithPermissions(campaignId), CampanasService.stats(campaignId, sync)]);
      const c = r?.data ?? null;
      if (!c) { toast({ title: 'Campaña no encontrada', variant: 'destructive' }); router.push('/app/crm/campanas'); return; }
      setCanManage(r?.can_manage === true);
      setCampaign(c);
      setStats(s);
    } catch (e) {
      toast({ title: 'No se pudo cargar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally { setLoading(false); }
  }, [campaignId, router, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel(`campaign-${campaignId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` }, () => void load()).subscribe();
    const t = setInterval(() => { if (campaign?.effective_status === 'sending') void load(true); }, 15_000);
    return () => { void supabase.removeChannel(ch); clearInterval(t); };
  }, [campaignId, load, campaign?.effective_status]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast({ title: ok }); await load(); } catch (e) { toast({ title: 'No se pudo completar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' }); } finally { setBusy(null); }
  };

  if (loading || !campaign) return <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen"><PageHeaderSkeleton /><StatsSkeleton count={6} /></div>;

  const es = campaign.effective_status;
  const st = CAMPAIGN_STATUS_CONFIG[es] ?? CAMPAIGN_STATUS_CONFIG.draft;
  const k = stats?.counts ?? campaign.statistics.counts ?? { total: 0, pending: 0, queued: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, skipped: 0, cost: 0 };
  const total = campaign.statistics.total_contacts ?? k.total;
  const done = k.sent + k.failed + k.skipped;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const throttle = campaign.statistics.throttle_mps ?? 10;
  const etaMin = k.pending + k.queued > 0 ? Math.ceil((k.pending + k.queued) / throttle / 60) : 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/crm/campanas"><Button variant="ghost" size="icon" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3"><div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl"><Megaphone className="h-6 w-6 text-emerald-600" /></div>{campaign.name}<Badge className={`${st.bgColor} ${st.color}`}>{st.label}</Badge></h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{campaign.channel === 'email' ? 'Email' : 'WhatsApp'} · {campaign.template_id ? 'plantilla HSM' : 'texto libre'} · {throttle} msg/s{campaign.scheduled_at ? ` · programada ${new Date(campaign.scheduled_at).toLocaleString('es-CO')}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Actualizar" onClick={() => void load(true)}><RefreshCw className="h-4 w-4" /></Button>
          {canManage && es === 'draft' && <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!!busy} onClick={() => void act('launch', async () => { if (!campaign.statistics.materialized_at) await CampanasService.materialize(campaignId); await CampanasService.launch(campaignId); }, 'Campaña lanzada')}>{busy === 'launch' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Rocket className="h-4 w-4 mr-2" />}Lanzar</Button>}
          {canManage && (es === 'sending' || es === 'scheduled') && <Button variant="outline" disabled={!!busy} onClick={() => void act('pause', () => CampanasService.pause(campaignId), 'Campaña pausada')}><Pause className="h-4 w-4 mr-2" />Pausar</Button>}
          {canManage && es === 'paused' && <Button variant="outline" disabled={!!busy} onClick={() => void act('resume', () => CampanasService.resume(campaignId), 'Campaña reanudada')}><Play className="h-4 w-4 mr-2" />Reanudar</Button>}
          {canManage && ['sending', 'scheduled', 'paused', 'draft'].includes(es) && <Button variant="outline" className="text-red-600" disabled={!!busy} onClick={() => { if (confirm('Los pendientes se omiten y los créditos reservados se devuelven. ¿Cancelar la campaña?')) void act('cancel', () => CampanasService.cancel(campaignId), 'Campaña cancelada'); }}><XCircle className="h-4 w-4 mr-2" />Cancelar</Button>}
          <a href={CampanasService.csvUrl(campaignId)} download><Button variant="outline"><Download className="h-4 w-4 mr-2" />Exportar CSV</Button></a>
          {!canManage && !loading && <span className="text-xs text-gray-500 dark:text-gray-400">Lanzar, pausar o cancelar requiere rol de administrador de la organización.</span>}
        </div>
      </div>

      {campaign.statistics.pause_reason && es === 'paused' && <p role="alert" className="rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 text-sm p-3">Pausada automáticamente: {campaign.statistics.pause_reason === 'no_credits' ? 'sin créditos de WhatsApp' : campaign.statistics.template_paused ? 'Meta pausó/rechazó la plantilla' : campaign.statistics.pause_reason}.</p>}
      {campaign.statistics.messaging_limit?.warning && <p className="rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200 text-xs p-2">{campaign.statistics.messaging_limit.warning}</p>}

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-5 space-y-2">
          <Progress value={pct} className="h-3 [&>div]:transition-[width] [&>div]:duration-700 [&>div]:ease-out" aria-label={`Progreso ${pct}%`} />
          <p className="text-sm text-gray-700 dark:text-gray-200">{done} / {total} procesados · {k.sent} enviados{es === 'sending' && etaMin > 0 ? ` · termina ≈ ${etaMin} min` : ''}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[['Enviados', k.sent, 'text-blue-600'], ['Entregados', k.delivered, 'text-green-600'], ['Leídos', k.read, 'text-sky-600'], ['Respondieron', k.replied, 'text-teal-600'], ['Fallidos', k.failed, 'text-red-600'], ['Omitidos', k.skipped, 'text-gray-500'], ['Pendientes', k.pending + k.queued, 'text-amber-600']].map(([l, n, c]) => (
          <Card key={String(l)} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"><CardContent className="pt-4 text-center"><p className={`text-2xl font-bold ${c}`}>{n}</p><p className="text-xs text-gray-500">{l}</p></CardContent></Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"><CardHeader><CardTitle className="text-base">Costo</CardTitle></CardHeader><CardContent className="text-sm space-y-1"><p>Estimado: {campaign.statistics.estimated_cost != null ? `$${Number(campaign.statistics.estimated_cost).toFixed(4)} USD` : '—'}</p><p>Real: ${k.cost.toFixed(4)} USD</p><p className="text-xs text-gray-500">El costo real llega con los eventos de entrega (pricing de Meta).</p></CardContent></Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"><CardHeader><CardTitle className="text-base">Errores</CardTitle></CardHeader><CardContent className="text-xs space-y-1">{stats && Object.keys(stats.by_error_code).length ? Object.entries(stats.by_error_code).map(([code, n]) => <p key={code}><span className="font-mono">{code}</span> {ERROR_CODE_LABELS[code] ?? ''} <Badge variant="outline">{n}</Badge></p>) : <p className="text-gray-500">Sin errores del proveedor.</p>}</CardContent></Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"><CardHeader><CardTitle className="text-base">Exclusiones</CardTitle></CardHeader><CardContent className="text-xs space-y-1">{stats && Object.keys(stats.by_skip_reason).length ? Object.entries(stats.by_skip_reason).map(([r, n]) => <p key={r}>{SKIP_REASON_LABELS[r] ?? r} <Badge variant="outline">{n}</Badge></p>) : <p className="text-gray-500">Sin exclusiones.</p>}</CardContent></Card>
      </div>

      <CampaignContactsTable campaignId={campaignId} refreshKey={done} />
    </div>
  );
}
