'use client';

/**
 * Detalle de una llamada — /app/crm/llamadas/[id] (Figma 1363:20 listo,
 * 1365:800947 transcribiendo, 1365:801445 sin grabación, 1368:17 móvil).
 *
 * Fuente (anotación 1363:1263): `calls` + `call_recordings` (audio por la ruta
 * firmada, `retention_until`) + `call_transcripts`/`call_transcript_segments`
 * (clic en un segmento salta el audio; el que suena se resalta) +
 * `call_analyses` (resumen, sentimiento, conversación, objeciones, tareas y
 * etapa sugerida). «Crear tareas» y «Aplicar» escriben por
 * `/api/crm/calls/[id]/analysis/apply` y no se repiten. Nada se aplica solo.
 *
 * Escritorio: dos columnas (reproducción y transcripción · análisis y
 * vínculos). Móvil: una columna con la transcripción plegada. Se monta UNA
 * sola de las dos (`useEsEscritorio`) para que haya un único reproductor.
 */

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Phone, RefreshCw, Sparkles, Mic } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { clasesBoton } from '@/components/kit/botonClases';
import type { AccionFila } from '@/components/kit/acciones';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { toast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { GateWarningDialog } from '@/components/crm/pipeline/GateWarningDialog';
import { useCallIntelligence } from '@/components/crm/calls/useCallIntelligence';
import { aplicarAnalisis, pedirAnalisis, pedirTranscripcion, type AccionesAplicar, type ResultadoEncolar } from '@/components/crm/calls/accionesInteligencia';
import { CallButton } from '../CallButton';
import {
  estadoGrabacion,
  formatoDuracionCorta,
  nombreCliente,
  nombrePerfil,
  numeroContraparteDetalle,
  tareasPendientes,
  type LlamadaDetalle as Llamada,
} from './llamadaDetalleLogica';
import { useLlamadaDetalle } from './useLlamadaDetalle';
import { TarjetaGrabacion, TarjetaNotas, TarjetaVinculada } from './TarjetasLlamada';
import { TranscripcionLlamada } from './TranscripcionLlamada';
import { TarjetaObjeciones, TarjetaResumen, TarjetaSentimiento, TarjetaTareas } from './AnalisisLlamada';

const LISTADO = '/app/crm/llamadas';

export function LlamadaDetalle({ callId }: { callId: string }) {
  const t = useTranslations('crm.llamadas.detalle');
  const tl = useTranslations('crm.llamadas');
  const { formatDateTime, formatPlain, getToday } = useFormatDate();
  const escritorio = useEsEscritorio();

  const sondear = useCallback((l: Llamada) => estadoGrabacion(l, getToday(), Date.now()).tipo === 'procesando', [getToday]);
  const { estado, recargar } = useLlamadaDetalle(callId, sondear);
  const intel = useCallIntelligence(callId, estado.tipo === 'listo');

  const [seekToMs, setSeekToMs] = useState<number | null>(null);
  const [actualMs, setActualMs] = useState<number | null>(null);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [aplicando, setAplicando] = useState<'tareas' | 'etapa' | null>(null);
  const [criterios, setCriterios] = useState<{ faltan: string[]; etapa: string } | null>(null);

  // Un valor distinto en cada clic: el reproductor salta aunque se repita el segmento.
  const irA = useCallback((ms: number) => setSeekToMs(ms + Math.random() * 0.001), []);

  const avisoEncolado = useCallback(
    (r: ResultadoEncolar, tipo: 'transcripcion' | 'analisis') => toast({ title: t(`avisos.${tipo}.${r}.titulo`), description: t.has(`avisos.${tipo}.${r}.descripcion`) ? t(`avisos.${tipo}.${r}.descripcion`) : undefined }),
    [t],
  );

  const transcribir = useCallback(
    async (forzar: boolean) => {
      setTranscribiendo(true);
      intel.setBusy(true);
      try {
        avisoEncolado(await pedirTranscripcion(callId, forzar), 'transcripcion');
        await intel.refetch();
      } catch (e) {
        toast({ title: t('avisos.errorTranscribir'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
      } finally {
        setTranscribiendo(false);
        intel.setBusy(false);
      }
    },
    [callId, intel, avisoEncolado, t],
  );

  const analizar = useCallback(
    async (forzar: boolean) => {
      setAnalizando(true);
      intel.setBusy(true);
      try {
        avisoEncolado(await pedirAnalisis(callId, forzar), 'analisis');
        await intel.refetch();
      } catch (e) {
        toast({ title: t('avisos.errorAnalizar'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
      } finally {
        setAnalizando(false);
        intel.setBusy(false);
      }
    },
    [callId, intel, avisoEncolado, t],
  );

  const analisis = intel.analysis?.analysis ?? null;
  const aplicar = useCallback(
    async (acciones: AccionesAplicar, cual: 'tareas' | 'etapa', ignorarCriterios = false) => {
      if (!analisis) return;
      setAplicando(cual);
      try {
        const r = await aplicarAnalisis(callId, analisis.id, acciones, ignorarCriterios);
        if (r.tipo === 'criterios') {
          setCriterios({ faltan: r.faltan, etapa: intel.analysis?.suggested_stage?.name ?? t('vinculada.etapaSugerida') });
          return;
        }
        toast({
          title: r.aplicadas.length ? t('avisos.aplicado') : t('avisos.nadaNuevo'),
          description: r.omitidas.length ? r.omitidas.map((x) => `${x.action}: ${x.reason}`).join(' · ') : undefined,
        });
        await Promise.all([intel.refetch(), cual === 'etapa' ? recargar(true) : Promise.resolve()]);
      } catch (e) {
        toast({ title: t('avisos.errorAplicar'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
      } finally {
        setAplicando(null);
      }
    },
    [analisis, callId, intel, recargar, t],
  );

  const aplicadas = useMemo(() => new Set(intel.analysis?.applied_actions ?? analisis?.raw_response?.applied_actions ?? []), [intel.analysis, analisis]);

  if (estado.tipo !== 'listo') {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <PageHeader titulo={t('tituloCargando')} icono={Phone} migas={migasDe(tl('migas.crm'), tl('titulo'))} variante="detail" volverA={LISTADO} cargando={estado.tipo === 'cargando'} movil={{ titulo: t('tituloCargando') }} />
        {estado.tipo === 'cargando' ? (
          <div aria-busy="true" aria-label={t('cargando')} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="flex flex-col gap-4">
              <div className="h-32 animate-pulse rounded-xl border border-line bg-subtle" />
              <div className="h-96 animate-pulse rounded-xl border border-line bg-subtle" />
            </div>
            <div className="flex flex-col gap-4">
              <div className="h-40 animate-pulse rounded-xl border border-line bg-subtle" />
              <div className="h-40 animate-pulse rounded-xl border border-line bg-subtle" />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-surface">
            <EmptyState
              variante={estado.sinPermiso ? 'forbidden' : estado.noExiste ? 'empty' : 'error'}
              titulo={t(estado.sinPermiso ? 'sinPermiso.titulo' : estado.noExiste ? 'noExiste.titulo' : 'error.titulo')}
              descripcion={t(estado.sinPermiso ? 'sinPermiso.descripcion' : estado.noExiste ? 'noExiste.descripcion' : 'error.descripcion')}
              onReintentar={estado.sinPermiso || estado.noExiste ? undefined : () => void recargar()}
              accion={estado.noExiste ? { etiqueta: t('noExiste.volver'), href: LISTADO } : undefined}
            />
          </div>
        )}
      </div>
    );
  }

  const l = estado.llamada;
  const grabacion = estadoGrabacion(l, getToday(), Date.now());
  const cliente = nombreCliente(l.customer);
  const numero = numeroContraparteDetalle(l);
  const vendedor = nombrePerfil(l.user);
  const direccion = t(`direccion.${l.direction === 'inbound' ? 'inbound' : 'outbound'}`);
  const modo = l.mode && l.mode !== 'inbound' && t.has(`modo.${l.mode}`) ? t(`modo.${l.mode}`) : null;
  const fecha = formatDateTime(l.started_at ?? l.created_at);
  const duracion = formatoDuracionCorta(l.duration_seconds);
  const subtitulo = [direccion, modo, fecha, duracion, vendedor].filter(Boolean).join(' · ');
  const subtituloMovil = [direccion, fecha, duracion].filter(Boolean).join(' · ');
  const titulo = t('titulo', { quien: cliente ?? numero });
  const acta = l.consents.find((c) => c.consent_type === 'recording')?.method ?? null;

  const conAudio = grabacion.tipo !== 'sin';
  const tr = intel.transcript;
  const transcripcionLista = tr?.status === 'completed';
  const trabajandoTr = !!tr && (tr.status === 'pending' || tr.status === 'processing' || !!tr.jobs?.some((j) => j.kind === 'transcribe' && (j.status === 'queued' || j.status === 'running')));
  const jobAnalisis = intel.analysis?.job;
  const enProceso = grabacion.tipo === 'procesando' || trabajandoTr || (!!jobAnalisis && (jobAnalisis.status === 'queued' || jobAnalisis.status === 'running'));
  const segmentos = tr?.segments ?? [];
  const pendientes = analisis ? tareasPendientes(analisis.suggested_tasks?.length ?? 0, aplicadas) : [];

  const sugerencia =
    analisis?.suggested_stage_id && l.opportunity_id && intel.analysis?.suggested_stage
      ? {
          etapa: intel.analysis.suggested_stage.name,
          confianza: Math.round((analisis.suggested_stage_confidence ?? 0) * 100),
          aplicando: aplicando === 'etapa',
          aplicada: aplicadas.has('stage'),
          onAplicar: () => void aplicar({ stage: true }, 'etapa'),
        }
      : null;

  const hablantes = { agente: vendedor, cliente: cliente };
  const idGrabacion = grabacion.tipo === 'lista' ? grabacion.grabacion.id : null;

  const botonDescargar = idGrabacion ? (
    <a href={`/api/voice/recording/${encodeURIComponent(idGrabacion)}/stream`} target="_blank" rel="noopener noreferrer" download className={clasesBoton({ variante: 'secundario' })}>
      <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('descargarAudio')}
    </a>
  ) : (
    <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled title={t('sinAudio')}>
      <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('descargarAudio')}
    </button>
  );
  const botonDevolver = (compacto: boolean) => (
    <CallButton
      phoneNumber={numero}
      customerId={l.customer_id}
      opportunityId={l.opportunity_id}
      displayName={cliente}
      label={compacto ? t('devolver') : t('devolverLlamada')}
      variant="default"
      size="default"
      className={compacto ? 'h-10 w-full' : undefined}
    />
  );
  const acciones: AccionFila[] = [
    { id: 'actualizar', etiqueta: t('menu.actualizar'), icono: RefreshCw, onSelect: () => void Promise.all([recargar(true), intel.refetch()]) },
    ...(conAudio && grabacion.tipo === 'lista'
      ? [{ id: 'transcribir', etiqueta: transcripcionLista ? t('menu.volverATranscribir') : t('menu.transcribir'), icono: Mic, onSelect: () => void transcribir(!!tr), deshabilitada: transcribiendo || trabajandoTr }]
      : []),
    ...(transcripcionLista
      ? [{ id: 'analizar', etiqueta: analisis ? t('menu.reanalizar') : t('menu.analizar'), icono: Sparkles, onSelect: () => void analizar(!!analisis), deshabilitada: analizando }]
      : []),
  ];
  const menu = <RowActionsMenu orientacion="horizontal" tamano="md" titulo={titulo} acciones={acciones} />;

  const transcripcion = (plegada: boolean) =>
    conAudio ? (
      <TranscripcionLlamada estado={intel} hablantes={hablantes} actualMs={actualMs} onIr={irA} onTranscribir={(f) => void transcribir(f)} transcribiendo={transcribiendo} plegada={plegada} />
    ) : (
      <TarjetaNotas llamada={l} estado={grabacion} />
    );
  const vinculada = <TarjetaVinculada llamada={l} sugerencia={sugerencia} onVinculada={() => void recargar(true)} />;
  const tareas = analisis ? (
    <TarjetaTareas
      key={analisis.id}
      analisis={analisis}
      aplicadas={aplicadas}
      creando={aplicando === 'tareas'}
      onCrear={(indices) => void aplicar({ tasks: indices }, 'tareas')}
      formatoFecha={formatPlain}
    />
  ) : null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        titulo={titulo}
        subtitulo={subtitulo}
        icono={Phone}
        migas={migasDe(tl('migas.crm'), tl('titulo'))}
        variante="detail"
        volverA={LISTADO}
        acciones={
          <>
            {botonDescargar}
            {botonDevolver(false)}
            {menu}
          </>
        }
        movil={{ titulo: cliente ?? numero, subtitulo: subtituloMovil, accion: menu }}
      />

      {escritorio ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex min-w-0 flex-col gap-4">
            <TarjetaGrabacion llamada={l} estado={grabacion} seekToMs={seekToMs} onTiempo={setActualMs} consentMethod={acta} />
            {transcripcion(false)}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            {conAudio && (
              <TarjetaResumen analisis={analisis} bundle={intel.analysis} enProceso={enProceso} transcripcionLista={transcripcionLista} analizando={analizando} onAnalizar={(f) => void analizar(f)} />
            )}
            {conAudio && analisis && <TarjetaSentimiento analisis={analisis} />}
            {conAudio && analisis && <TarjetaObjeciones analisis={analisis} bundle={intel.analysis} segmentos={segmentos} onIr={irA} />}
            {conAudio && tareas}
            {vinculada}
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <TarjetaGrabacion llamada={l} estado={grabacion} seekToMs={seekToMs} onTiempo={setActualMs} consentMethod={acta} compacta={grabacion.tipo === 'lista'} />
          {conAudio &&
            (analisis ? (
              <TarjetaResumen analisis={analisis} bundle={intel.analysis} enProceso={enProceso} transcripcionLista={transcripcionLista} analizando={analizando} onAnalizar={(f) => void analizar(f)} compacta />
            ) : (
              <TarjetaResumen analisis={null} bundle={intel.analysis} enProceso={enProceso} transcripcionLista={transcripcionLista} analizando={analizando} onAnalizar={(f) => void analizar(f)} />
            ))}
          {conAudio && analisis && <TarjetaObjeciones analisis={analisis} bundle={intel.analysis} segmentos={segmentos} onIr={irA} compacta />}
          {transcripcion(true)}
          <div className="grid grid-cols-2 gap-2">
            {pendientes.length > 0 ? (
              <button type="button" className={`${clasesBoton({ variante: 'secundario' })} w-full`} disabled={aplicando !== null} onClick={() => void aplicar({ tasks: pendientes }, 'tareas')}>
                {t('tareas.crear', { n: pendientes.length })}
              </button>
            ) : (
              botonDescargar
            )}
            {botonDevolver(true)}
          </div>
          {conAudio && analisis && <TarjetaSentimiento analisis={analisis} />}
          {vinculada}
        </div>
      )}

      <GateWarningDialog
        open={!!criterios}
        onClose={() => setCriterios(null)}
        onConfirm={() => {
          setCriterios(null);
          void aplicar({ stage: true }, 'etapa', true);
        }}
        missing={criterios?.faltan ?? []}
        stageName={criterios?.etapa ?? ''}
      />
    </div>
  );
}

function migasDe(crm: string, llamadas: string) {
  return [
    { etiqueta: crm, href: '/app/crm' },
    { etiqueta: llamadas, href: LISTADO },
  ];
}
