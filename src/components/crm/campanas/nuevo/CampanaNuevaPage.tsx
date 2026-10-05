'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useFormatter } from 'next-intl';
import { ArrowRight, Bot, Check, CircleCheck, CircleX, Clock, Info, Mail, MessageSquare, Save, Send, ShieldCheck } from 'lucide-react';
import { useMigasAreaCrm } from '../migasCrm';
import { PageHeader } from '@/components/kit/PageHeader';
import { Stepper } from '@/components/kit/Stepper';
import { FormField } from '@/components/kit/FormField';
import { BadgeTono } from '@/components/kit/BadgeTono';
import { EmptyState } from '@/components/kit/EmptyState';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { clasesBoton } from '@/components/kit/botonClases';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { CLASE_CAMPO, CLASE_AREA } from '@/components/crm/kit/camposCrm';
import { ChannelSelect } from '@/components/crm/whatsapp/compose/ChannelSelect';
import { TemplatePicker } from '@/components/crm/whatsapp/compose/TemplatePicker';
import { MessageForm } from '@/components/crm/whatsapp/compose/MessageForm';
import { useWhatsAppCompose } from '@/components/crm/whatsapp/compose/useWhatsAppCompose';
import { ApiError } from '@/components/crm/whatsapp/api';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { fetchJson } from '@/lib/utils/fetchJson';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOrganization } from '@/lib/hooks/useOrganization';
import type { VoiceAgent } from '@/lib/services/crm/voiceAgentService';
import type { DiagnosticoVoz } from '@/lib/services/crm/voiceCampaignDiagnostics';
import { voiceCampaignErrorKey } from '@/lib/services/crm/voiceCampaignWriteLogica';
import type { SegmentoRegistro } from '@/lib/services/crm/segmentosAudiencia';
import { useSegmentosData } from '@/components/crm/segmentos/useSegmentosData';
import { AudienceStep, type AudienceValue } from './AudienceStep';
import { ScheduleStep } from './ScheduleStep';
import { evaluarProgramacion, type ModoProgramacion } from './programacionCampanaLogica';
import { useBorradorCampana } from './useBorradorCampana';
import { useBorradorCampanaVoz } from './useBorradorCampanaVoz';
import { CampaignCompliancePanel } from '../CampaignCompliancePanel';
import { DEFAULT_VOICE_CAMPAIGN_LIMITS, voiceCampaignLimitsValid } from '@/lib/crm/voiceCampaignLimits';
import { VoiceCampaignLimitsFields } from '@/components/crm/agentes/campanas/VoiceCampaignLimitsFields';

type Canal = 'voice' | 'whatsapp' | 'email';
const PASOS = ['audience', 'content', 'compliance', 'review'] as const;

function AsistenteCampana() {
  const migas = useMigasAreaCrm('/app/crm/campanas');
  const t = useTranslations('crm.campanasVisual');
  const tp = useTranslations('crm.campanasAsistente.programacion');
  const ta = useTranslations('crm.campanasAsistente');
  const tc = useTranslations('crm.campanasNuevo');
  const formatter = useFormatter();
  const { timezone } = useFormatDate(null);
  const router = useRouter();
  const search = useSearchParams();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<Canal>('voice');
  const segmentId = search?.get('segment_id') ?? search?.get('segment');
  const [audience, setAudience] = useState<AudienceValue>({ source: 'segment', segment_id: segmentId ?? null, pipeline_id: null, stage_ids: [] });
  const [agentId, setAgentId] = useState('');
  const [objective, setObjective] = useState('');
  const [emailText, setEmailText] = useState('');
  const [daily, setDaily] = useState<number>(DEFAULT_VOICE_CAMPAIGN_LIMITS.max_calls_per_day);
  const [hourly, setHourly] = useState<number>(DEFAULT_VOICE_CAMPAIGN_LIMITS.max_calls_per_hour);
  const [concurrent, setConcurrent] = useState<number>(DEFAULT_VOICE_CAMPAIGN_LIMITS.max_concurrent);
  const [voiceHours, setVoiceHours] = useState('business');
  const [scheduleMode, setScheduleMode] = useState<ModoProgramacion>('now');
  const [scheduleLocal, setScheduleLocal] = useState('');
  const [throttle, setThrottle] = useState(10);
  const [allowed, setAllowed] = useState(false);
  const [rneBusy, setRneBusy] = useState(false);
  const [optin, setOptin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<{ loading: boolean; error: boolean; canManage: boolean; agents: VoiceAgent[]; policy: boolean | null; minutes: number | null; maxConcurrent: number | null }>({ loading: true, error: false, canManage: false, agents: [], policy: null, minutes: null, maxConcurrent: null });
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);
  const segments = useSegmentosData<SegmentoRegistro[]>('/api/crm/segments');
  const c = useWhatsAppCompose({ enabled: channel === 'whatsapp' });
  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    setCatalog({ loading: true, error: false, canManage: false, agents: [], policy: null, minutes: null, maxConcurrent: null });
    void Promise.allSettled([
      pedirCrm<unknown[]>('/api/crm/voice-agents/campaigns', { signal: abort.signal }),
      pedirCrm<VoiceAgent[]>('/api/crm/voice-agents', { signal: abort.signal }),
      pedirCrm<DiagnosticoVoz>('/api/crm/voice-agents/campaigns/diagnostics', { signal: abort.signal }),
      fetchJson<{ comm: { voice_minutes_remaining: number | null } }>('/api/crm/config/credits', { signal: abort.signal, cache: 'no-store' }),
    ]).then(([permission, agents, diagnosis, credits]) => {
      if (abort.signal.aborted) return;
      setCatalog({ loading: false, error: permission.status === 'rejected', canManage: permission.status === 'fulfilled' && permission.value.extra.can_manage === true,
        agents: agents.status === 'fulfilled' ? agents.value.data.filter(a => a.is_active) : [],
        policy: diagnosis.status === 'fulfilled' ? !diagnosis.value.data.organizacion.some(m => ['sin_politica_datos', 'sin_comm_settings'].includes(m.codigo)) : null,
        maxConcurrent: diagnosis.status === 'fulfilled' && Number.isInteger(diagnosis.value.data.maxConcurrentCalls) && diagnosis.value.data.maxConcurrentCalls! > 0 ? diagnosis.value.data.maxConcurrentCalls! : null,
        minutes: credits.status === 'fulfilled' && typeof credits.value?.comm?.voice_minutes_remaining === 'number' ? credits.value.comm.voice_minutes_remaining : null });
    });
    return () => { mounted.current = false; abort.abort(); };
  }, [revision]);
  const schedule = evaluarProgramacion(scheduleMode, scheduleLocal, timezone, new Date());
  const segment = segments.data?.find(s => s.id === audience.segment_id);
  const agent = catalog.agents.find(a => a.id === agentId);
  const marketing = channel === 'email' || c.preview?.category === 'marketing';
  const body = useMemo(() => ({ name: name.trim(), channel: channel === 'email' ? 'email' as const : 'whatsapp' as const,
    channel_id: channel === 'email' ? null : c.channelId,
    template_id: channel === 'whatsapp' && c.tab === 'template' ? c.templateId : null,
    content: channel === 'email' ? emailText : c.tab === 'text' ? c.text : null,
    audience: { source: audience.source, segment_id: audience.segment_id, pipeline_id: audience.pipeline_id, stage_ids: audience.stage_ids },
    scheduled_at: schedule.instante, throttle_mps: throttle, respect_allowed_hours: true,
    default_variables: c.variables, purpose: marketing ? 'marketing' as const : 'utility' as const,
  }), [name, channel, c.channelId, c.tab, c.templateId, c.text, c.variables, audience, schedule.instante, throttle, marketing, emailText]);
  const draft = useBorradorCampana(body);
  const voiceBody = useMemo(() => ({ name: name.trim(), voice_agent_id: agentId, objective,
    target_source: audience.source === 'segment' ? 'segment' as const : 'pipeline_stage' as const,
    target_config: audience.source === 'segment' ? { segment_id: audience.segment_id } : { stage_id: audience.stage_ids[0] },
    max_calls_per_day: daily, max_calls_per_hour: hourly, max_concurrent: concurrent,
    schedule: { days: voiceHours === 'business' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6], start_hour: voiceHours === 'business' ? 9 : 8, end_hour: voiceHours === 'business' ? 17 : 15, timezone },
  }), [name, agentId, objective, audience, daily, hourly, concurrent, voiceHours, timezone]);
  const voice = useBorradorCampanaVoz(voiceBody);
  const busy = voice.busy || !!draft.busy || rneBusy;
  const audienceOk = !!name.trim() && (audience.source === 'segment' ? !!segment : audience.stage_ids.length > 0) && (channel !== 'voice' || audience.source === 'segment' || audience.stage_ids.length === 1);
  const contentOk = channel === 'voice' ? !!agent && !!objective.trim() && voiceCampaignLimitsValid({ max_calls_per_day: daily, max_calls_per_hour: hourly, max_concurrent: concurrent }) && catalog.maxConcurrent !== null && concurrent <= catalog.maxConcurrent
    : channel === 'email' ? !!emailText.trim() : !!c.channelId && (c.tab === 'template' ? !!c.templateId && !!c.preview && c.preview.status === 'APPROVED' && c.preview.missing.length === 0 : !!c.text.trim());
  const canActivate = channel === 'voice' ? audienceOk && contentOk && catalog.policy === true && catalog.minutes !== null && catalog.minutes > 0
    : !!draft.mat?.pending && allowed && (!marketing || optin) && !schedule.error;
  const explain = (e: unknown) => e instanceof ErrorApiCrm ? tc(voiceCampaignErrorKey(e.codigo)) : e instanceof ApiError && e.code === 'CAMPAIGN_MODIFIED' ? tc('archivoConflicto') : tc('errorAccion');
  const save = async (activate = false, stay = false) => {
    if (busy || !audienceOk || !contentOk || !catalog.canManage || (activate && !canActivate)) return;
    setError(null);
    try {
      if (channel !== 'voice' && evaluarProgramacion(scheduleMode, scheduleLocal, timezone, new Date()).error) throw new Error('invalid_schedule');
      const result = channel === 'voice' ? await (activate ? voice.lanzar() : voice.guardar()) : await (activate ? draft.lanzar() : draft.guardar());
      if (mounted.current && !stay) router.push(`/app/crm/campanas/${result.id}${channel === 'voice' ? '?tipo=voz' : ''}`);
    } catch (e) { if (mounted.current) setError(explain(e)); }
  };
  const materialize = async () => { if (busy || !audienceOk || !contentOk) return; setError(null); setAllowed(false); try { await draft.calcular(); } catch (e) { if (mounted.current) setError(explain(e)); } };
  const next = () => { if (!busy && (step !== 0 || audienceOk) && (step !== 1 || contentOk) && (step !== 2 || channel === 'voice' || !schedule.error)) setStep(n => Math.min(3, n + 1)); };
  const actions = <><Link href="/app/crm/campanas" className={clasesBoton({ variante: 'fantasma' })}>{t('cancel')}</Link>
    {step < 3 ? <button type="button" onClick={next} disabled={busy || (step === 0 && !audienceOk) || (step === 1 && !contentOk) || (step === 2 && channel !== 'voice' && !!schedule.error)} className={clasesBoton()}><ArrowRight className="size-4" aria-hidden="true" strokeWidth={1.5} />{t('next')}</button>
      : <button type="button" className={clasesBoton()} disabled={busy || !canActivate} onClick={() => void save(true)}>{t('activate')}</button>}</>;
  if (catalog.loading) return <div className="space-y-4 p-6" role="status" aria-label={ta('cargando')}><Skeleton className="h-16" /><Skeleton className="h-80" /></div>;
  if (catalog.error || !catalog.canManage) return <div className="p-6"><EmptyState variante={catalog.error ? 'error' : 'forbidden'} titulo={ta(catalog.error ? 'error' : 'sinPermiso')} onReintentar={() => setRevision(n => n + 1)} /></div>;
  const channels = [{ id: 'voice' as const, icon: Bot, title: t('voice'), help: t('voiceHelp'), count: segment?.counts_json?.voice_contactable }, { id: 'whatsapp' as const, icon: MessageSquare, title: t('whatsapp'), help: t('whatsappHelp'), count: segment?.counts_json?.whatsapp_contactable }, { id: 'email' as const, icon: Mail, title: t('email'), help: t('emailHelp'), count: segment?.counts_json?.email_contactable }];
  return <div className="space-y-4 bg-canvas p-4 sm:p-6">
    <PageHeader migas={migas} titulo={t('title')} subtitulo={t('step', { n: step + 1, title: t(PASOS[step]) })} icono={Send} acciones={actions} />
    <Stepper pasos={PASOS.map(valor => ({ valor, etiqueta: t(valor) }))} actual={PASOS[step]} deshabilitado={busy} onPasoClick={v => { if (!busy) setStep(PASOS.indexOf(v)); }} etiqueta={t('steps')} resumenMovil={(n, total, title) => t('stepMobile', { n, total, title })} className="rounded-xl border border-line bg-surface p-3 [&_ol>li:not(:last-child)]:flex-1 [&_ol>li>span[aria-hidden]]:flex-1 [&_ol>li>span[aria-hidden]]:bg-line [&_ol>li>button>span:first-child]:bg-success-text [&_ol>li>span>span.ring-4]:ring-0" />
    {error && <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle p-3 text-sm text-danger-text">{error}</p>}
    <fieldset disabled={busy} className="min-w-0 rounded-xl border border-line bg-surface p-5">
      {step === 0 && <div className="space-y-4">
        <FormField etiqueta={t('name')} obligatorio tamanoEtiqueta="sm"><input value={name} maxLength={200} onChange={e => setName(e.target.value)} className={CLASE_CAMPO} /></FormField>
        <AudienceStep value={audience} onChange={setAudience} />
        {channel === 'voice' && audience.source === 'stage' && audience.stage_ids.length > 1 && <p role="alert" className="text-xs text-danger-text">{t('oneStage')}</p>}
        <div className="space-y-3"><p className="text-xs font-semibold text-fg-secondary">{t('channel')}</p><div role="radiogroup" aria-label={t('channel')} className="grid gap-3 md:grid-cols-3">
          {channels.map(({ id, icon: Icon, title, help, count }) => <button key={id} type="button" role="radio" aria-checked={channel === id} className={`relative rounded-xl border p-4 text-left focus-visible:ring-2 focus-visible:ring-brand ${channel === id ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-line bg-surface hover:bg-hover'}`} onClick={() => { setChannel(id); setAllowed(false); setError(null); }}><span className="flex items-center gap-2 text-base font-semibold leading-[22px] text-fg"><Icon className={`size-4 ${channel === id ? 'text-brand' : 'text-fg-secondary'}`} strokeWidth={1.5} />{title}{channel === id && <Check className="ml-auto size-4 text-brand" aria-hidden="true" />}</span><span className="mt-2 block text-[13px] leading-[18px] text-fg-secondary">{help}</span><BadgeTono tono="neutro" className="mt-2">{typeof count === 'number' ? t('contactable', { n: formatter.number(count, { useGrouping: true }) }) : t('countUnavailable')}</BadgeTono></button>)}
        </div></div>
        <p className="flex gap-2 rounded-lg bg-canvas p-3 text-[13px] leading-[18px] text-fg-secondary"><Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />{t('exclusions')}</p>
      </div>}
      {step === 1 && <div className="space-y-4">
        {channel === 'voice' ? <><FormField etiqueta={t('agent')} tamanoEtiqueta="sm">{campo => <div role="radiogroup" aria-labelledby={campo.idEtiqueta} className="grid gap-3 md:grid-cols-2">{catalog.agents.map(a => <button key={a.id} type="button" role="radio" aria-checked={a.id === agentId} className={`rounded-xl border p-4 text-left focus-visible:ring-2 focus-visible:ring-brand ${a.id === agentId ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-line'}`} onClick={() => setAgentId(a.id)}><span className="flex items-center gap-2 text-base font-semibold leading-[22px] text-fg"><Bot className="size-4 text-brand" strokeWidth={1.5} />{a.name}{a.id === agentId && <Check className="ml-auto size-4 text-brand" />}</span><span className="mt-2 block text-[13px] leading-[18px] text-fg-secondary">{a.description || a.language}</span></button>)}{!catalog.agents.length && <EmptyState compacto titulo={t('noAgents')} accion={{ etiqueta: t('createAgent'), href: '/app/crm/agentes-ia?editor=new' }} />}</div>}</FormField>
          <FormField etiqueta={t('objective')} obligatorio tamanoEtiqueta="sm" ayuda={t('objectiveHelp')}><input className={CLASE_CAMPO} value={objective} maxLength={2000} onChange={e => setObjective(e.target.value)} /></FormField>
          {agent && <section className="space-y-3 rounded-xl border border-line bg-canvas p-4"><h3 className="text-xs font-semibold text-fg-secondary">{t('opening')}</h3><p className="text-[13px] leading-[18px] text-fg">{agent.first_message || '—'}</p><p className="text-xs text-fg-secondary">{agent.identity_disclosure || t('openingHelp')}</p></section>}
          <VoiceCampaignLimitsFields limits={{ max_calls_per_day: daily, max_calls_per_hour: hourly, max_concurrent: concurrent }}
            onChange={limits => { setDaily(limits.max_calls_per_day); setHourly(limits.max_calls_per_hour); setConcurrent(limits.max_concurrent); }}
            orgConcurrencyLimit={catalog.maxConcurrent} disabled={busy} />
        </> : channel === 'email' ? <FormField etiqueta={t('emailContent')} obligatorio tamanoEtiqueta="sm" ayuda={t('emailContentHelp')}><textarea className={CLASE_AREA} rows={8} maxLength={4096} value={emailText} onChange={e => setEmailText(e.target.value)} /></FormField> : <><ChannelSelect channels={c.channels} value={c.channelId} onChange={c.setChannelId} loading={c.loadingChannels} /><SegmentedControl valor={c.tab} onValorChange={v => c.setTab(v === 'template' ? 'template' : 'text')} opciones={[{ valor: 'template', etiqueta: t('approvedTemplate'), deshabilitada: !c.capabilities.templates }, { valor: 'text', etiqueta: t('freeText') }]} />{c.error && <p role="alert" className="text-xs text-danger-text">{ta('errorCompositor')}</p>}{c.tab === 'template' ? <TemplatePicker templates={c.templates} loading={c.loadingTemplates} value={c.templateId} onChange={c.setTemplateId} variables={c.variables} onVariable={c.setVariable} preview={c.preview} previewing={c.previewing} onCreateTemplate={() => router.push('/app/crm/plantillas?tab=whatsapp')} /> : <MessageForm value={c.text} onChange={c.setText} media={null} onMedia={() => undefined} allowMedia={false} scheduledAt={null} onScheduledAt={() => undefined} />}</>}
      </div>}
      {step === 2 && <div className="space-y-4"><div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-line p-4"><h2 className="flex items-center gap-2 text-base font-semibold leading-[22px] text-fg"><Clock className="size-4 text-brand" strokeWidth={1.5} />{t('legal')}</h2><dl className="grid grid-cols-[1fr_auto] gap-3 text-[13px] leading-[18px] text-fg"><dt>{t('weekdays')}</dt><dd>7:00–19:00</dd><dt>{t('saturday')}</dt><dd>8:00–15:00</dd><dt>{t('sunday')}</dt><dd>{t('noCalls')}</dd></dl><p className="text-xs leading-4 text-fg-secondary">{tp('legalDetalle')}</p>
          {channel === 'voice' ? <FormField etiqueta={t('withinWindow')} tamanoEtiqueta="sm" ayuda={t('timezone', { zona: timezone })}><SelectCrm valor={voiceHours} onValorChange={setVoiceHours} opciones={[{ valor: 'business', etiqueta: t('businessHours') }, { valor: 'morning', etiqueta: t('morningHours') }]} /></FormField> : <ScheduleStep mode={scheduleMode} onMode={setScheduleMode} local={scheduleLocal} onLocal={setScheduleLocal} error={schedule.error} throttle={throttle} onThrottle={setThrottle} disabled={busy} />}
        </section>
        <section className="space-y-3 rounded-xl border border-line p-4"><h2 className="flex items-center gap-2 text-base font-semibold leading-[22px] text-fg"><ShieldCheck className="size-4 text-brand" strokeWidth={1.5} />{t('requirements')}</h2>
          {channel === 'voice' ? <>
            <div className={`space-y-2 rounded-lg border p-3 ${catalog.policy === true ? 'border-line-success bg-success-subtle' : catalog.policy === false ? 'border-line-danger bg-danger-subtle' : 'border-line bg-subtle'}`}><h3 className={`flex items-center gap-2 text-sm font-medium ${catalog.policy === true ? 'text-success-text' : catalog.policy === false ? 'text-danger-text' : 'text-fg-secondary'}`}>{catalog.policy === true ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}{t('policy')}</h3><p className="text-xs text-fg-secondary">{t(catalog.policy === true ? 'policyReady' : catalog.policy === false ? 'policyMissing' : 'requirementUnknown')}</p><Link className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} href="/app/configuracion?modulo=crm&tab=telefonia">{tc('configurar')}</Link></div>
            <div className={`space-y-2 rounded-lg border p-3 ${catalog.minutes !== null && catalog.minutes > 0 ? 'border-line-success bg-success-subtle' : 'border-line bg-subtle'}`}><h3 className="text-sm font-medium text-fg">{t('credits')}</h3><p className="text-xs text-fg-secondary">{catalog.minutes === null ? t('requirementUnknown') : t('minutes', { n: formatter.number(catalog.minutes) })}</p></div>
          </> : <><button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} disabled={busy || !!schedule.error} onClick={() => void materialize()}>{t(draft.mat ? 'recalculate' : 'calculate')}</button>{draft.mat && <p className="text-xs text-fg-secondary">{t('audienceCounts', { pending: draft.mat.pending, skipped: draft.mat.skipped, total: draft.mat.total })}</p>}{draft.saved && <CampaignCompliancePanel key={draft.saved.id} campaignId={draft.saved.id} expectedUpdatedAt={draft.saved.updated_at} onChanged={draft.actualizarRne} refreshKey={draft.calculationKey} disabled={!draft.mat} onAllowed={setAllowed} onUploadingChange={setRneBusy} />}{marketing && <label className="flex items-center gap-2 text-xs text-fg-secondary"><Checkbox checked={optin} onCheckedChange={v => setOptin(v === true)} />{t('optin')}</label>}</>}
        </section>
      </div><p className="rounded-lg bg-warning-subtle p-3 text-[13px] leading-[18px] text-warning-text">{t('draftWarning')}</p></div>}
      {step === 3 && <div className="space-y-4"><h2 className="text-base font-semibold leading-[22px] text-fg">{t('review')}</h2><dl className="grid grid-cols-[140px_1fr] gap-3 text-[13px] leading-[18px]"><dt className="text-fg-secondary">{t('name')}</dt><dd>{name}</dd><dt className="text-fg-secondary">{t('channel')}</dt><dd>{channels.find(v => v.id === channel)?.title}</dd><dt className="text-fg-secondary">{t('audience')}</dt><dd>{segment?.name ?? t('stageCount', { n: audience.stage_ids.length })}</dd><dt className="text-fg-secondary">{t('content')}</dt><dd>{channel === 'voice' ? agent?.name : channel === 'email' ? emailText : c.template?.name || c.text}</dd></dl>{!canActivate && <p className="rounded-lg bg-warning-subtle p-3 text-sm text-warning-text">{t('draftWarning')}</p>}</div>}
    </fieldset>
    <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" disabled={busy || step === 0} className={clasesBoton({ variante: 'fantasma' })} onClick={() => setStep(n => Math.max(0, n - 1))}>{t('back')}</button><div className="flex flex-wrap items-center gap-2"><button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={busy || !audienceOk || !contentOk || (channel !== 'voice' && !!schedule.error)} onClick={() => void save()}><Save className="size-4" aria-hidden="true" />{t('saveDraft')}</button><div className="flex gap-2 lg:hidden">{actions}</div></div></div>
  </div>;
}

export function CampanaNuevaPage() {
  const { organization } = useOrganization();
  return <AsistenteCampana key={organization?.id ?? 'sin-organizacion'} />;
}
