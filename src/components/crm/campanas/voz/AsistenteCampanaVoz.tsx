'use client';

/**
 * /app/crm/campanas/voz/nueva — asistente «Nueva campaña de llamadas IA»
 * (Figma CRM, fila 9 «Campañas conectadas al flujo»: 1680:859620 objetivo,
 * 1681:856945 audiencia, 1681:860291 agente y voz, 1682:130990 horario y
 * topes, 1683:136171 / 1687:183908 cumplimiento, 1683:861470 revisión, y el
 * diagrama 1685:132525 en «Ver flujo completo»).
 *
 * Escribe SOLO por las rutas que ya existen:
 *  - borrador: POST / PATCH `/api/crm/voice-agents/campaigns[/id]` (status `draft`);
 *  - activar:  PATCH con `status: 'running'` (lo toma la cola en su próximo
 *    ciclo) o `status: 'scheduled'` + `schedule.start_at`.
 * El borrador se guarda al pasar de paso y con «Guardar borrador»; su id queda
 * en `?id=` para reabrirlo en cualquier paso.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CalendarDays, Loader2, Play, Send } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/kit/PageHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { clasesBoton } from '@/components/kit/botonClases';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrmLookups } from '@/components/crm/shared/useCrmLookups';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import {
  FORM_INICIAL,
  INTENTOS_DIA_CLIENTE,
  PASOS_ASISTENTE,
  cuerpoCampana,
  diasParaTerminar,
  entradaDesdeUrl,
  erroresPaso,
  formDesdeCampana,
  minutosEstimados,
  politicaValida,
  primerPasoIncompleto,
  textoHorario,
  type CampanaGuardada,
  type FormAsistente,
  type PasoAsistente,
} from './asistenteVozLogica';
import { StepperCampanaVoz } from './StepperCampanaVoz';
import { ResumenCampanaVoz, type FilaResumen } from './ResumenCampanaVoz';
import { PasoObjetivo } from './PasoObjetivo';
import { PasoAudiencia } from './PasoAudiencia';
import { PasoAgenteVoz } from './PasoAgenteVoz';
import { PasoHorarioTopes } from './PasoHorarioTopes';
import { PasoCumplimiento } from './PasoCumplimiento';
import { CuandoEmpieza, PasoRevision, type FilaRevision } from './PasoRevision';
import { useDatosAsistenteVoz } from './useDatosAsistenteVoz';
import { useAudienciaPrevia } from './useAudienciaPrevia';

const RUTA_LISTA = '/app/crm/campanas';
const RUTA_NUEVA = '/app/crm/campanas/voz/nueva';

type Apertura = { estado: 'nuevo' } | { estado: 'cargando' } | { estado: 'listo' } | { estado: 'noBorrador'; id: string } | { estado: 'noExiste' } | { estado: 'error' };

export function AsistenteCampanaVoz() {
  const t = useTranslations('crm.campanaVozAsistente');
  const formato = useFormatter();
  const router = useRouter();
  const params = useSearchParams();
  const idUrl = params?.get('id') ?? null;
  // Desde «Nueva campaña» (`rutaAsistenteVoz`): nombre ya escrito y, si venía, el segmento (aún no usable en voz).
  const [entrada] = useState(() => entradaDesdeUrl({ nombre: params?.get('nombre') ?? null, segment: params?.get('segment') ?? null }));
  const { timezone, getToday, toInstant, formatTime } = useFormatDate();
  const lookups = useCrmLookups();

  const [form, setForm] = useState<FormAsistente>(() => (idUrl ? FORM_INICIAL : entrada.form));
  const [paso, setPaso] = useState<PasoAsistente>('objetivo');
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [guardando, setGuardando] = useState<null | 'borrador' | 'activar'>(null);
  const [reintento, setReintento] = useState(0);
  const [apertura, setApertura] = useState<Apertura>(idUrl ? { estado: 'cargando' } : { estado: 'nuevo' });

  const datos = useDatosAsistenteVoz(form.agenteId, form.fuente === 'sequence_step', paso === 'revision');
  const audiencia = useAudienciaPrevia(form, (d) => formatTime(d));

  const cambiar = useCallback((p: Partial<FormAsistente>) => setForm((f) => ({ ...f, ...p })), []);

  // Reabrir un borrador (`?id=`): solo los que siguen en «draft».
  useEffect(() => {
    if (!idUrl || form.id === idUrl) return;
    let vivo = true;
    setApertura({ estado: 'cargando' });
    pedirCrm<CampanaGuardada[]>('/api/crm/voice-agents/campaigns')
      .then(({ data }) => {
        if (!vivo) return;
        const c = (data ?? []).find((x) => x.id === idUrl);
        if (!c) return setApertura({ estado: 'noExiste' });
        if (c.status !== 'draft') return setApertura({ estado: 'noBorrador', id: c.id });
        setForm(formDesdeCampana(c));
        setApertura({ estado: 'listo' });
      })
      .catch(() => vivo && setApertura({ estado: 'error' }));
    return () => {
      vivo = false;
    };
  }, [idUrl, form.id, reintento]);

  // Agente por defecto: el primero activo (el borrador necesita uno para guardarse; se cambia en el paso 3).
  const lecturaAgentes = datos.agentes;
  const agentes = useMemo(() => (lecturaAgentes.estado === 'listo' ? lecturaAgentes.datos : []), [lecturaAgentes]);
  useEffect(() => {
    if (form.agenteId || agentes.length === 0) return;
    const primero = agentes.find((a) => a.is_active);
    if (primero) cambiar({ agenteId: primero.id });
  }, [agentes, form.agenteId, cambiar]);

  const agente = agentes.find((a) => a.id === form.agenteId) ?? null;
  const voz = agente?.voice_ref_id && datos.voces.estado === 'listo' ? datos.voces.datos.find((v) => v.id === agente.voice_ref_id) ?? null : null;
  const politicaLista = datos.telefonia.estado === 'listo' && politicaValida(datos.telefonia.datos.politicaUrl);
  const bloqueos = datos.motivos.estado === 'listo' ? datos.motivos.datos.filter((m) => m.bloquea).length : 0;
  const ctxValidacion = { politicaLista, bloqueosOrganizacion: bloqueos };
  const errores = mostrarErrores ? erroresPaso(paso, form, ctxValidacion) : [];

  const aLlamar = audiencia.estado === 'lista' && audiencia.datos ? audiencia.datos.a_llamar : null;
  const duracion = datos.metricas.estado === 'listo' ? datos.metricas.datos.duracionMediaSeg : null;
  const estimado = minutosEstimados(aLlamar, duracion);
  const disponibles = datos.minutos.estado === 'listo' ? datos.minutos.datos : null;
  const dias = diasParaTerminar(aLlamar, form.porDia);
  const indice = PASOS_ASISTENTE.indexOf(paso);

  const horario = textoHorario(form, (d) => t(`horario.diasLetra.${d}`), (d, h) => t('horario.sabado', { desde: d, hasta: h }));
  const nombreGoal = form.goal ? t(`objetivo.goals.${form.goal}.titulo`) : '';

  const filasResumen: FilaResumen[] = [
    { clave: 'objetivo', paso: 'objetivo', valor: nombreGoal || null },
    { clave: 'audiencia', paso: 'audiencia', valor: aLlamar !== null ? t('resumen.aLlamar', { n: formato.number(aLlamar) }) : null },
    { clave: 'agente', paso: 'agente', valor: agente ? [agente.name, voz?.name].filter(Boolean).join(' · ') : null },
    { clave: 'horario', paso: 'horario', valor: horario || null },
    { clave: 'topes', paso: 'horario', valor: t('resumen.topes', { dia: form.porDia, hora: form.porHora }) },
    { clave: 'cumplimiento', paso: 'cumplimiento', valor: politicaLista ? t('resumen.listo') : null },
  ];
  const pieMinutos =
    indice >= PASOS_ASISTENTE.indexOf('horario') && dias !== null
      ? t('resumen.minutos.termina', { porDia: form.porDia, n: dias })
      : duracion !== null
        ? t('resumen.minutos.porLlamada', { min: formato.number(duracion / 60, { maximumFractionDigits: 1 }) })
        : t('resumen.minutos.sinHistorial');

  const filasRevision: FilaRevision[] = [
    { clave: 'nombre', valor: form.name.trim(), paso: 'objetivo' },
    {
      clave: 'objetivo',
      valor: form.instruccion.trim() ? t('revision.valores.objetivoConInstruccion', { objetivo: nombreGoal, instruccion: form.instruccion.trim() }) : nombreGoal,
      paso: 'objetivo',
    },
    {
      clave: 'audiencia',
      valor:
        audiencia.datos && aLlamar !== null
          ? t('revision.valores.audiencia', {
              fuente: t(`audiencia.fuentes.${form.fuente}`),
              n: formato.number(aLlamar),
              excluidos: formato.number(audiencia.datos.total - aLlamar),
            })
          : t('revision.valores.audienciaSinDato', { fuente: t(`audiencia.fuentes.${form.fuente}`) }),
      paso: 'audiencia',
    },
    { clave: 'agente', valor: agente ? (voz ? t('revision.valores.agente', { agente: agente.name, voz: voz.name }) : agente.name) : '—', paso: 'agente' },
    { clave: 'horario', valor: t('revision.valores.horario', { horario }), paso: 'horario' },
    {
      clave: 'topes',
      valor: t('revision.valores.topes', { dia: form.porDia, hora: form.porHora, simultaneas: form.simultaneas, intentos: INTENTOS_DIA_CLIENTE }),
      paso: 'horario',
    },
    {
      clave: 'cumplimiento',
      valor: t('revision.valores.cumplimiento', {
        politica: politicaLista ? t('revision.valores.ok') : t('revision.valores.falta'),
        identidad: agente?.identity_disclosure ? t('revision.valores.ok') : t('revision.valores.falta'),
      }),
      paso: 'cumplimiento',
    },
  ];

  /** Guarda el borrador (POST la primera vez, PATCH después). Devuelve el id o `null`. */
  const guardarBorrador = useCallback(
    async (silencioso: boolean): Promise<string | null> => {
      if (!form.agenteId) {
        if (!silencioso) toast({ title: t('errores.sinAgente'), variant: 'destructive' });
        return null;
      }
      if (!form.name.trim()) return null;
      setGuardando('borrador');
      try {
        const cuerpo = cuerpoCampana(form);
        let id = form.id;
        if (id) {
          await pedirCrm(`/api/crm/voice-agents/campaigns/${encodeURIComponent(id)}`, { method: 'PATCH', cuerpo });
        } else {
          const { data } = await pedirCrm<{ id: string }>('/api/crm/voice-agents/campaigns', { method: 'POST', cuerpo: { ...cuerpo, status: 'draft' } });
          id = data.id;
          setForm((f) => ({ ...f, id }));
          router.replace(`${RUTA_NUEVA}?id=${encodeURIComponent(id)}`, { scroll: false });
        }
        if (!silencioso) toast({ title: t('ok.guardado') });
        return id;
      } catch (e) {
        toast({ title: t('errores.guardar'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
        return null;
      } finally {
        setGuardando(null);
      }
    },
    [form, router, t],
  );

  const irA = (p: PasoAsistente) => {
    setMostrarErrores(false);
    setPaso(p);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const siguiente = async () => {
    if (erroresPaso(paso, form, ctxValidacion).length > 0) {
      setMostrarErrores(true);
      return;
    }
    const proximo = PASOS_ASISTENTE[indice + 1];
    if (!proximo) return;
    await guardarBorrador(true);
    irA(proximo);
  };

  const activar = async () => {
    const pendiente = primerPasoIncompleto(form, ctxValidacion);
    if (pendiente) {
      setPaso(pendiente);
      setMostrarErrores(true);
      return;
    }
    const startAt = form.inicio === 'programar' ? toInstant(form.inicioFecha, `${String(form.inicioHora).padStart(2, '0')}:00`) : null;
    setGuardando('activar');
    try {
      const cuerpo = cuerpoCampana(form, startAt ? new Date(startAt).toISOString() : null);
      const estado = form.inicio === 'programar' ? 'scheduled' : 'running';
      let id = form.id;
      if (id) {
        await pedirCrm(`/api/crm/voice-agents/campaigns/${encodeURIComponent(id)}`, { method: 'PATCH', cuerpo: { ...cuerpo, status: estado, emergency_stop: false } });
      } else {
        const { data } = await pedirCrm<{ id: string }>('/api/crm/voice-agents/campaigns', { method: 'POST', cuerpo: { ...cuerpo, status: estado } });
        id = data.id;
      }
      toast({ title: form.inicio === 'programar' ? t('ok.programada') : t('ok.iniciada') });
      router.push(`/app/crm/campanas/voz/${encodeURIComponent(id)}`);
    } catch (e) {
      toast({ title: t('errores.activar'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setGuardando(null);
    }
  };

  const migas = useMemo(
    () => [
      { etiqueta: t('migas.crm'), href: '/app/crm' },
      { etiqueta: t('migas.campanas'), href: RUTA_LISTA },
    ],
    [t],
  );

  const enRevision = paso === 'revision';
  const bloqueadoPorPolitica = paso === 'cumplimiento' && datos.telefonia.estado === 'listo' && !politicaLista;
  const bloqueadoActivar = enRevision && (bloqueos > 0 || datos.motivos.estado !== 'listo');
  const acciones = (
    <>
      {indice > 0 && (
        <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => irA(PASOS_ASISTENTE[indice - 1])} disabled={guardando !== null}>
          <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('acciones.anterior')}
        </button>
      )}
      <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => void guardarBorrador(false)} disabled={guardando !== null}>
        {guardando === 'borrador' && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
        {guardando === 'borrador' ? t('acciones.guardando') : t('acciones.guardar')}
      </button>
      {enRevision ? (
        <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => void activar()} disabled={guardando !== null || bloqueadoActivar}>
          {guardando === 'activar' ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : form.inicio === 'programar' ? (
            <CalendarDays aria-hidden="true" className="size-4" strokeWidth={1.5} />
          ) : (
            <Play aria-hidden="true" className="size-4" strokeWidth={1.5} />
          )}
          {guardando === 'activar' ? t('acciones.activando') : form.inicio === 'programar' ? t('acciones.programar') : t('acciones.iniciar')}
        </button>
      ) : (
        <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => void siguiente()} disabled={guardando !== null || bloqueadoPorPolitica}>
          <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('acciones.siguiente')}
        </button>
      )}
    </>
  );

  const cabecera = (
    <PageHeader
      titulo={t('titulo')}
      subtitulo={t('subtitulo', { n: indice + 1, total: PASOS_ASISTENTE.length, paso: t(`pasos.${paso}`) })}
      icono={Send}
      migas={migas}
      variante="form"
      volverA={RUTA_LISTA}
      acciones={apertura.estado === 'nuevo' || apertura.estado === 'listo' ? acciones : undefined}
      movil={{ accionesEnFila: true }}
    />
  );

  if (apertura.estado === 'cargando') {
    return (
      <div className="flex min-w-0 flex-col gap-4" aria-busy="true" aria-label={t('cargando')}>
        {cabecera}
        <Skeleton className="h-10 rounded-lg" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }
  if (apertura.estado === 'noBorrador' || apertura.estado === 'noExiste' || apertura.estado === 'error') {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {cabecera}
        <div className="rounded-xl border border-line bg-surface">
          {apertura.estado === 'noBorrador' ? (
            <EmptyState
              titulo={t('noBorrador.titulo')}
              descripcion={t('noBorrador.descripcion')}
              accion={{ etiqueta: t('noBorrador.ir'), href: `/app/crm/campanas/voz/${encodeURIComponent(apertura.id)}` }}
            />
          ) : apertura.estado === 'noExiste' ? (
            <EmptyState titulo={t('noExiste.titulo')} descripcion={t('noExiste.descripcion')} accion={{ etiqueta: t('noExiste.nueva'), href: RUTA_NUEVA }} />
          ) : (
            <EmptyState variante="error" descripcion={t('errores.cargar')} onReintentar={() => setReintento((n) => n + 1)} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {cabecera}
      <StepperCampanaVoz actual={paso} onIr={irA} />
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0">
          {paso === 'objetivo' && <PasoObjetivo form={form} cambiar={cambiar} errores={errores} />}
          {paso === 'audiencia' && (
            <PasoAudiencia form={form} cambiar={cambiar} errores={errores} lookups={lookups} secuencias={datos.secuencias} audiencia={audiencia} segmentoSinUsar={!idUrl && entrada.segmentoSinUsar} />
          )}
          {paso === 'agente' && (
            <PasoAgenteVoz form={form} cambiar={cambiar} errores={errores} agentes={datos.agentes} voces={datos.voces} metricas={datos.metricas} />
          )}
          {paso === 'horario' && <PasoHorarioTopes form={form} cambiar={cambiar} errores={errores} agente={agente} />}
          {paso === 'cumplimiento' && (
            <PasoCumplimiento
              telefonia={datos.telefonia}
              recargarTelefonia={datos.recargarTelefonia}
              agente={agente}
              campanaId={form.id}
              asegurarBorrador={() => guardarBorrador(true)}
            />
          )}
          {paso === 'revision' && <PasoRevision filas={filasRevision} onEditar={irA} motivos={datos.motivos} />}
        </div>
        <aside className="min-w-0 lg:sticky lg:top-4">
          {enRevision ? (
            <CuandoEmpieza form={form} cambiar={cambiar} errores={errores} hoy={getToday()} zona={timezone} estimado={estimado} disponibles={disponibles} />
          ) : (
            <ResumenCampanaVoz actual={paso} filas={filasResumen} estimado={estimado} disponibles={disponibles} pie={pieMinutos} />
          )}
        </aside>
      </div>
    </div>
  );
}

