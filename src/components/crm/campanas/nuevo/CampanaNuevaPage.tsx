'use client';

/** /app/crm/campanas/nueva (FASE-16 §5.1): wizard 4 pasos — canal+plantilla → audiencia → programación → revisión/lanzar. */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Loader2, Megaphone, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/components/crm/whatsapp/api';
import { ChannelSelect } from '@/components/crm/whatsapp/compose/ChannelSelect';
import { TemplatePicker } from '@/components/crm/whatsapp/compose/TemplatePicker';
import { MessageForm } from '@/components/crm/whatsapp/compose/MessageForm';
import { useWhatsAppCompose } from '@/components/crm/whatsapp/compose/useWhatsAppCompose';
import { CampanasService } from '../CampanasService';
import { AudienceStep, type AudienceValue } from './AudienceStep';
import { ScheduleStep } from './ScheduleStep';
import type { MaterializeResult } from '@/components/crm/whatsapp/api';
import { SKIP_REASON_LABELS } from '@/components/crm/whatsapp/api';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { todayInTz } from '@/lib/utils/timezone';
import { formatPlainDate } from '@/lib/utils/dateDisplay';

const STEPS = ['Canal y mensaje', 'Audiencia', 'Programación', 'Revisión'];

export function CampanaNuevaPage() {
  const { timezone } = useOrgTimezone();
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const c = useWhatsAppCompose({ enabled: true });
  const [audience, setAudience] = useState<AudienceValue>({ source: search?.get('segment') ? 'segment' : 'stage', segment_id: search?.get('segment') ?? null, pipeline_id: null, stage_ids: [] });
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [throttle, setThrottle] = useState(10);
  const [respectHours, setRespectHours] = useState(true);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [mat, setMat] = useState<MaterializeResult | null>(null);
  const [busy, setBusy] = useState<'save' | 'mat' | 'launch' | null>(null);
  const [optin, setOptin] = useState(false);

  useEffect(() => { if (!name && c.template) setName(`${c.template.name} · ${formatPlainDate(todayInTz(timezone))}`); }, [c.template, name, timezone]);

  const marketing = c.preview?.category === 'marketing';
  const step0ok = !!c.channelId && (c.tab === 'template' ? !!c.templateId && !!c.preview && c.preview.status === 'APPROVED' : c.text.trim().length > 0);
  const step1ok = audience.source === 'segment' ? !!audience.segment_id : audience.source === 'stage' ? audience.stage_ids.length > 0 : false;

  const body = useMemo(() => ({
    name: name.trim() || 'Campaña sin nombre',
    channel: 'whatsapp' as const,
    channel_id: c.channelId,
    template_id: c.tab === 'template' ? c.templateId : null,
    content: c.tab === 'text' ? c.text : null,
    audience: { source: audience.source, segment_id: audience.segment_id, pipeline_id: audience.pipeline_id, stage_ids: audience.stage_ids },
    scheduled_at: scheduledAt,
    throttle_mps: throttle,
    respect_allowed_hours: respectHours,
    default_variables: c.variables,
    purpose: marketing ? 'marketing' as const : 'utility' as const,
  }), [name, c.channelId, c.tab, c.templateId, c.text, c.variables, audience, scheduledAt, throttle, respectHours, marketing]);

  const save = async () => {
    setBusy('save');
    try {
      const saved = campaignId ? await CampanasService.updateCampaign(campaignId, body) : await CampanasService.createCampaign(body);
      setCampaignId(saved.id);
      return saved.id;
    } finally { setBusy(null); }
  };

  const materialize = async () => {
    try {
      const id = await save();
      setBusy('mat');
      setMat(await CampanasService.materialize(id));
    } catch (e) {
      toast({ title: 'No se pudo calcular la audiencia', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const launch = async (draftOnly = false) => {
    try {
      const id = await save();
      if (draftOnly) { toast({ title: 'Borrador guardado' }); router.push(`/app/crm/campanas/${id}`); return; }
      setBusy('launch');
      if (!mat) setMat(await CampanasService.materialize(id));
      const r = await CampanasService.launch(id, { scheduled_at: scheduledAt });
      toast({ title: r.data.effective_status === 'scheduled' ? 'Campaña programada' : 'Campaña lanzada', description: `${mat?.pending ?? ''} contactos en cola` });
      router.push(`/app/crm/campanas/${id}`);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      toast({ title: err?.code === 'TIER_EXCEEDED' ? 'Supera el límite del WABA' : 'No se pudo lanzar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally { setBusy(null); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center gap-3">
        <Link href="/app/crm/campanas"><Button variant="ghost" size="icon" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3"><div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl"><Megaphone className="h-6 w-6 text-emerald-600" /></div>Nueva campaña de WhatsApp</h1><p className="text-gray-500 dark:text-gray-400">CRM / Campañas / Nueva</p></div>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="Pasos">
        {STEPS.map((s, i) => <li key={s} className={`text-xs px-3 py-1.5 rounded-full border ${i === step ? 'bg-emerald-600 text-white border-emerald-600' : i < step ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'text-gray-500 border-gray-200 dark:border-gray-700'}`} aria-current={i === step ? 'step' : undefined}>{i + 1}. {s}</li>)}
      </ol>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader><CardTitle className="text-gray-900 dark:text-gray-100 text-base">{STEPS[step]}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <div className="space-y-4">
              <div><Label htmlFor="camp-name" className="text-xs">Nombre de la campaña</Label><Input id="camp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Novedades septiembre" className="bg-gray-50 dark:bg-gray-900" /></div>
              <ChannelSelect channels={c.channels} value={c.channelId} onChange={c.setChannelId} loading={c.loadingChannels} />
              <div className="flex gap-2 text-xs">
                <button type="button" className={`px-3 py-1.5 rounded-md border ${c.tab === 'template' ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300' : 'border-gray-200 dark:border-gray-700'}`} onClick={() => c.setTab('template')} disabled={!c.capabilities.templates}>Plantilla aprobada (recomendado)</button>
                <button type="button" className={`px-3 py-1.5 rounded-md border ${c.tab === 'text' ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300' : 'border-gray-200 dark:border-gray-700'}`} onClick={() => c.setTab('text')}>Texto libre (solo ventana abierta)</button>
              </div>
              {c.tab === 'template' ? <TemplatePicker templates={c.templates} loading={c.loadingTemplates} value={c.templateId} onChange={c.setTemplateId} variables={c.variables} onVariable={c.setVariable} preview={c.preview} previewing={c.previewing} onCreateTemplate={() => router.push('/app/crm/plantillas?tab=whatsapp')} />
                : <MessageForm value={c.text} onChange={c.setText} media={null} onMedia={() => undefined} allowMedia={false} scheduledAt={null} onScheduledAt={() => undefined} />}
              {c.preview && c.preview.missing.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">Variables sin valor por defecto ({c.preview.missing.join(', ')}): escríbelas arriba; se aplicarán a todos los contactos.</p>}
            </div>
          )}
          {step === 1 && <AudienceStep value={audience} onChange={(v) => { setAudience(v); setMat(null); }} />}
          {step === 2 && <ScheduleStep scheduledAt={scheduledAt} onScheduledAt={setScheduledAt} throttle={throttle} onThrottle={setThrottle} respectHours={respectHours} onRespectHours={setRespectHours} />}
          {step === 3 && (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-xs">
                <dt className="text-gray-500">Nombre</dt><dd>{name || '—'}</dd>
                <dt className="text-gray-500">Canal</dt><dd>{c.channel?.name} · {c.channel?.provider}</dd>
                <dt className="text-gray-500">Mensaje</dt><dd>{c.tab === 'template' ? `Plantilla ${c.template?.name} (${c.preview?.category})` : `Texto libre (${c.text.length} chars)`}</dd>
                <dt className="text-gray-500">Audiencia</dt><dd>{audience.source === 'segment' ? 'Segmento' : `${audience.stage_ids.length} etapas`}</dd>
                <dt className="text-gray-500">Programación</dt><dd>{scheduledAt ? new Date(scheduledAt).toLocaleString('es-CO') : 'Inmediata'} · {throttle} msg/s · {respectHours ? 'respeta horario' : 'sin horario'}</dd>
              </dl>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                <div className="flex items-center justify-between"><p className="font-medium">Audiencia calculada</p><Button type="button" size="sm" variant="outline" onClick={() => void materialize()} disabled={!!busy}>{busy === 'mat' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}{mat ? 'Recalcular' : 'Calcular audiencia'}</Button></div>
                {mat ? (
                  <div className="text-xs space-y-1">
                    <p><strong className="text-emerald-700 dark:text-emerald-400">{mat.pending} pendientes</strong> · {mat.skipped} excluidos de {mat.total}{mat.estimated_cost !== null ? ` · costo estimado ≈ $${mat.estimated_cost.toFixed(4)} USD` : ''}</p>
                    <ul className="flex flex-wrap gap-1">{Object.entries(mat.skipped_by_reason).map(([r, n]) => <li key={r} className="rounded-full border px-2 py-0.5">{SKIP_REASON_LABELS[r] ?? r}: {n}</li>)}</ul>
                    {mat.pending === 0 && <p className="text-amber-700 dark:text-amber-400">Nadie cumple los criterios: revisa la audiencia o la plantilla.</p>}
                  </div>
                ) : <p className="text-xs text-gray-500">Calcula la audiencia para ver pendientes, exclusiones y costo antes de lanzar.</p>}
              </div>
              {marketing && <label className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-300"><Checkbox checked={optin} onCheckedChange={(v) => setOptin(v === true)} />He verificado que la audiencia dio su consentimiento (opt-in) para marketing (Habeas Data)</label>}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" onClick={() => (step === 0 ? router.push('/app/crm/campanas') : setStep(step - 1))} disabled={!!busy}>{step === 0 ? 'Cancelar' : 'Atrás'}</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void launch(true)} disabled={!!busy || !step0ok}>Guardar borrador</Button>
          {step < 3 ? <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setStep(step + 1)} disabled={(step === 0 && !step0ok) || (step === 1 && !step1ok)}>Continuar<ArrowRight className="h-4 w-4 ml-2" /></Button>
            : <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => void launch()} disabled={!!busy || !mat || mat.pending === 0 || (marketing && !optin)}>{busy === 'launch' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Rocket className="h-4 w-4 mr-2" />}{scheduledAt ? 'Programar' : 'Lanzar ahora'}</Button>}
        </div>
      </div>
    </div>
  );
}
