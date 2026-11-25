'use client';

/**
 * /app/crm/campanas/nuevo — asistente «Nueva campaña» (Figma CRM 1395:1065
 * audiencia y canal, 1402:17 agente o plantilla, 1402:821 horario y
 * cumplimiento; el paso 4 «Revisar y activar» resume y lanza).
 *
 * Un solo canal por campaña. «Llamada con agente IA» sigue en su asistente
 * propio (`/app/crm/campanas/voz/nueva`) con el segmento y el nombre ya
 * elegidos (allí se usa el nombre; el segmento aún no es audiencia de
 * llamadas y se avisa); aquí se completan WhatsApp (y correo cuando el motor
 * lo envíe).
 *
 * Mismos servicios de siempre: `CampanasService` (crear/editar borrador,
 * materializar, lanzar → `/api/crm/campaigns/**`) y `useWhatsAppCompose`
 * (números, plantillas aprobadas, vista previa con variables).
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2, Rocket, Send } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/kit/PageHeader';
import { Stepper } from '@/components/kit/Stepper';
import { FilaDato, ListaDatos } from '@/components/kit/FilaDato';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { ApiError, type MaterializeResult } from '@/components/crm/whatsapp/api';
import { useWhatsAppCompose } from '@/components/crm/whatsapp/compose/useWhatsAppCompose';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { CampanasService, type SegmentOption } from '../CampanasService';
import {
  PASOS_ASISTENTE,
  audienciaCompleta,
  disponibilidadCanales,
  partirFechaHoraLocal,
  plantillaCompleta,
  requisitosActivar,
  requisitosEnRojo,
  rutaAsistenteVoz,
  type CanalAsistente,
  type PasoAsistente,
} from './asistenteCampanaLogica';
import { PasoAudienciaCanal } from './PasoAudienciaCanal';
import { PasoPlantilla } from './PasoPlantilla';
import { PasoHorarioCumplimiento } from './PasoHorarioCumplimiento';
import { useDesgloseSegmento } from './useDesgloseSegmento';

const VOLVER = '/app/crm/campanas';

export function CampanaNuevaPage() {
  const t = useTranslations('crm.campanasAsistente');
  const router = useRouter();
  const search = useSearchParams();
  const entero = useFormatoEntero();
  const { formatDateTime, toInstant } = useFormatDate();

  const [paso, setPaso] = useState<PasoAsistente>('audiencia');
  const [nombre, setNombre] = useState('');
  const [intentoSeguir, setIntentoSeguir] = useState(false);
  const [segmentos, setSegmentos] = useState<SegmentOption[] | null>(null);
  const [segmentId, setSegmentId] = useState<string | null>(search?.get('segment') ?? null);
  const [canal, setCanal] = useState<CanalAsistente | null>(null);
  const [agentesVoz, setAgentesVoz] = useState<number | null>(null);

  const c = useWhatsAppCompose({ enabled: true });
  const [cuando, setCuando] = useState<'ahora' | 'programar'>('ahora');
  const [fechaLocal, setFechaLocal] = useState('');
  const [respetarHorario, setRespetarHorario] = useState(true);
  const [consentimiento, setConsentimiento] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [mat, setMat] = useState<MaterializeResult | null>(null);
  const [ocupado, setOcupado] = useState<'guardar' | 'calcular' | 'activar' | null>(null);

  useEffect(() => {
    CampanasService.getSegments().then(setSegmentos, () => setSegmentos([]));
    pedirCrm<unknown[]>('/api/crm/voice-agents').then(
      ({ data }) => setAgentesVoz(Array.isArray(data) ? data.length : 0),
      () => setAgentesVoz(0),
    );
  }, []);

  // Todas las campañas de mensajes del asistente usan plantilla aprobada.
  const { tab, setTab } = c;
  useEffect(() => {
    if (tab !== 'template') setTab('template');
  }, [tab, setTab]);

  const segmento = segmentos?.find((s) => s.id === segmentId) ?? null;
  const { estado: estadoDesglose, desglose } = useDesgloseSegmento(segmento?.filter_json, !!segmento);
  const disponibilidad = useMemo(
    () => disponibilidadCanales({ agentesVoz, canalesWhatsappActivos: c.loadingChannels ? null : c.channels.filter((x) => x.status === 'active').length }),
    [agentesVoz, c.loadingChannels, c.channels],
  );

  const marketing = c.preview?.category === 'marketing';
  const programadaPara = useMemo(() => {
    if (cuando !== 'programar') return null;
    const f = partirFechaHoraLocal(fechaLocal);
    return f ? toInstant(f.fecha, f.hora) : null;
  }, [cuando, fechaLocal, toInstant]);
  const requisitos = requisitosActivar({
    plantillaAprobada: c.preview?.status === 'APPROVED',
    variablesFaltantes: c.preview?.missing.length ?? 0,
    marketing,
    consentimiento,
    pendientes: mat ? mat.pending : null,
  });
  const enRojo = requisitosEnRojo(requisitos);

  const pasoOk: Record<PasoAsistente, boolean> = {
    audiencia: audienciaCompleta({ nombre, segmentId, canal }, disponibilidad),
    contenido: plantillaCompleta({ canalId: c.channelId, plantillaId: c.templateId, estadoMeta: c.preview?.status ?? null, variablesFaltantes: c.preview?.missing ?? [] }),
    horario: cuando === 'ahora' || !!programadaPara,
    revision: enRojo === 0,
  };
  const indice = PASOS_ASISTENTE.indexOf(paso);

  const cuerpo = useMemo(
    () => ({
      name: nombre.trim(),
      channel: 'whatsapp' as const,
      channel_id: c.channelId,
      template_id: c.templateId,
      content: null,
      audience: { source: 'segment' as const, segment_id: segmentId, pipeline_id: null, stage_ids: [] },
      scheduled_at: programadaPara,
      respect_allowed_hours: respetarHorario,
      default_variables: c.variables,
      purpose: marketing ? ('marketing' as const) : ('utility' as const),
    }),
    [nombre, c.channelId, c.templateId, c.variables, segmentId, programadaPara, respetarHorario, marketing],
  );

  const guardar = async (): Promise<string> => {
    const g = campaignId ? await CampanasService.updateCampaign(campaignId, cuerpo) : await CampanasService.createCampaign(cuerpo);
    setCampaignId(g.id);
    return g.id;
  };

  const errorToast = (titulo: string, e: unknown) =>
    toast({ title: titulo, description: e instanceof Error ? e.message : undefined, variant: 'destructive' });

  const calcular = async () => {
    setOcupado('calcular');
    try {
      const id = await guardar();
      setMat(await CampanasService.materialize(id));
    } catch (e) {
      errorToast(t('errores.calcular'), e);
    } finally {
      setOcupado(null);
    }
  };

  const guardarBorrador = async () => {
    setOcupado('guardar');
    try {
      const id = await guardar();
      toast({ title: t('ok.borrador') });
      router.push(`/app/crm/campanas/${encodeURIComponent(id)}`);
    } catch (e) {
      errorToast(t('errores.guardar'), e);
    } finally {
      setOcupado(null);
    }
  };

  const activar = async () => {
    setOcupado('activar');
    try {
      const id = await guardar();
      const m = mat ?? (await CampanasService.materialize(id));
      setMat(m);
      const r = await CampanasService.launch(id, { scheduled_at: programadaPara });
      toast({
        title: r.data.effective_status === 'scheduled' ? t('ok.programada') : t('ok.activada'),
        description: t('ok.enCola', { n: entero(m.pending) }),
      });
      router.push(`/app/crm/campanas/${encodeURIComponent(id)}`);
    } catch (e) {
      errorToast(e instanceof ApiError && e.code === 'TIER_EXCEEDED' ? t('errores.limiteWaba') : t('errores.activar'), e);
    } finally {
      setOcupado(null);
    }
  };

  const siguiente = () => {
    if (paso === 'audiencia') {
      setIntentoSeguir(true);
      if (!pasoOk.audiencia) return;
      if (canal === 'voice') {
        router.push(rutaAsistenteVoz({ segmentId, nombre }));
        return;
      }
    }
    if (paso === 'contenido' && !pasoOk.contenido) return;
    if (paso === 'horario' && !mat && pasoOk.horario) void calcular();
    setPaso(PASOS_ASISTENTE[Math.min(indice + 1, PASOS_ASISTENTE.length - 1)]);
  };

  const errorNombre = intentoSeguir && !nombre.trim() ? t('audiencia.errorNombre') : null;
  const puedeSeguir = paso === 'audiencia' ? !!segmentId && !!canal && disponibilidad[canal].habilitado : pasoOk[paso];

  const primario =
    paso === 'revision' ? (
      <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => void activar()} disabled={!!ocupado || enRojo > 0}>
        {ocupado === 'activar' ? <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.5} /> : <Rocket aria-hidden="true" className="size-4" strokeWidth={1.5} />}
        {programadaPara ? t('acciones.programar') : t('acciones.activar')}
      </button>
    ) : (
      <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={siguiente} disabled={!!ocupado || !puedeSeguir}>
        <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('acciones.siguiente')}
      </button>
    );

  const acciones = (
    <>
      <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => router.push(VOLVER)} disabled={ocupado === 'activar'}>
        {t('acciones.cancelar')}
      </button>
      {indice >= 2 && (
        <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => void guardarBorrador()} disabled={!!ocupado}>
          {ocupado === 'guardar' && <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.5} />}
          {t('acciones.guardarBorrador')}
        </button>
      )}
      {primario}
    </>
  );

  return (
    <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6">
      <PageHeader
        variante="form"
        volverA={VOLVER}
        icono={Send}
        titulo={t('titulo')}
        subtitulo={t('subtitulo', { n: indice + 1, total: PASOS_ASISTENTE.length, descripcion: t(`pasos.${paso}.descripcion`) })}
        migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('migas.campanas'), href: VOLVER }]}
        acciones={acciones}
        movil={{ accion: primario }}
      />

      <div className="rounded-xl border border-line bg-surface px-4 py-3">
        <Stepper<PasoAsistente>
          pasos={PASOS_ASISTENTE.map((v) => ({ valor: v, etiqueta: t(`pasos.${v}.titulo`) }))}
          actual={paso}
          onPasoClick={(v) => setPaso(v)}
          etiqueta={t('pasosEtiqueta')}
          resumenMovil={(n, total, etiqueta) => t('resumenPaso', { n, total, etiqueta })}
        />
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        {paso === 'audiencia' && (
          <PasoAudienciaCanal
            nombre={nombre}
            onNombre={setNombre}
            errorNombre={errorNombre}
            segmentos={segmentos}
            segmentId={segmentId}
            onSegmento={(id) => {
              setSegmentId(id || null);
              setMat(null);
            }}
            canal={canal}
            onCanal={setCanal}
            disponibilidad={disponibilidad}
            desglose={desglose}
            estadoDesglose={estadoDesglose}
          />
        )}
        {paso === 'contenido' && <PasoPlantilla c={c} />}
        {paso === 'horario' && (
          <PasoHorarioCumplimiento
            cuando={cuando}
            onCuando={setCuando}
            fechaLocal={fechaLocal}
            onFechaLocal={setFechaLocal}
            respetarHorario={respetarHorario}
            onRespetarHorario={setRespetarHorario}
            requisitos={requisitos}
            marketing={marketing}
            consentimiento={consentimiento}
            onConsentimiento={setConsentimiento}
            materializado={mat}
            calculando={ocupado === 'calcular'}
            onCalcular={() => void calcular()}
          />
        )}
        {paso === 'revision' && (
          <div className="space-y-4">
            <ListaDatos etiqueta={t('pasos.revision.titulo')} divisores>
              <FilaDato etiqueta={t('revision.nombre')} valor={nombre} />
              <FilaDato etiqueta={t('revision.segmento')} valor={segmento?.name ?? '—'} />
              <FilaDato etiqueta={t('revision.canal')} valor={`${t('canales.whatsapp.titulo')} · ${c.channel?.name ?? '—'}`} />
              <FilaDato etiqueta={t('revision.plantilla')} valor={c.template?.name ?? '—'} />
              <FilaDato etiqueta={t('revision.cuando')} valor={programadaPara ? formatDateTime(programadaPara) : t('horario.ahora')} />
              <FilaDato
                etiqueta={t('revision.destinatarios')}
                valor={mat ? t('revision.destinatariosValor', { pendientes: entero(mat.pending), excluidos: entero(mat.skipped) }) : ocupado === 'calcular' ? t('revision.calculando') : '—'}
              />
            </ListaDatos>
            {enRojo > 0 && (
              <p role="status" className="rounded-lg bg-warning-subtle px-3 py-2 text-[13px] leading-[18px] text-warning-text">
                {t('horario.avisoRojo', { n: enRojo })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
