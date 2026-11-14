'use client';

/**
 * Trabajos de la IA del chat (Figma 91-chat-35): cifras, filtros de estado,
 * tipo y fecha, tabla y detalle en hoja lateral. Se actualiza en tiempo real
 * (`ai_jobs`). Reintentar y cancelar usan `aiJobsService` como antes.
 * Columna «Valoración»: 👍/👎 que el equipo dio a la respuesta en la Bandeja
 * (Figma 93-chat-pendientes-03); el motivo y el comentario, en el detalle.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Eye, MessageSquare, RefreshCw, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react';
import { CampoFecha, DataTable, KpiStrip, PageHeader, StatCard, clasesBoton, type ColumnaTabla } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import { supabase } from '@/lib/supabase/config';
import AIJobsService, { type AIJob, type AIJobStats } from '@/lib/services/aiJobsService';
import { IANavTabs } from '@/components/chat/ia/IANavTabs';
import { HojaTrabajo } from '@/components/chat/ia/trabajos/HojaTrabajo';
import {
  diasDeRango,
  duracionMs,
  estadoTrabajo,
  ESTADOS_TRABAJO,
  idCorto,
  limitesDias,
  puedeCancelar,
  puedeReintentar,
  RANGOS_TRABAJOS,
  textoConfianza,
  textoDuracion,
  TIPOS_TRABAJO,
  tonoConfianza,
  tonoEstadoTrabajo,
  type RangoTrabajos,
} from '@/components/chat/ia/trabajos/trabajosLogica';
import { useMiembroActual } from '@/components/chat/conocimiento/useMiembroActual';
import { tiempoRelativo } from '@/components/chat/channels/canalesLogica';
import { useAgentesChat } from '@/components/chat/conversations/useConversacion';
import { resumenValoraciones } from '@/lib/services/chat/valoracionIa';

const TODOS = 'all';

export default function TrabajosPage() {
  const t = useTranslations('chatModulo.ia');
  const tv = useTranslations('chatBandejaPendientes.valoracion.trabajos');
  const { agentes } = useAgentesChat();
  const locale = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const memberId = useMiembroActual(organizationId);
  const { getToday, toInstant } = useFormatDate();

  const [trabajos, setTrabajos] = useState<AIJob[]>([]);
  const [stats, setStats] = useState<AIJobStats | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [estado, setEstado] = useState(TODOS);
  const [tipo, setTipo] = useState(TODOS);
  const [rango, setRango] = useState<RangoTrabajos>('7d');
  const [diaDesde, setDiaDesde] = useState('');
  const [diaHasta, setDiaHasta] = useState('');
  const [actualizando, setActualizando] = useState(false);
  const [abierto, setAbierto] = useState<AIJob | null>(null);
  const [bitacora, setBitacora] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);

  const { desde, hasta } = useMemo(() => {
    if (rango === 'personalizado') {
      const l = limitesDias(diaDesde, diaHasta);
      return { desde: l.desde ? toInstant(l.desde) : undefined, hasta: l.hastaExclusivo ? toInstant(l.hastaExclusivo) : undefined };
    }
    const dias = diasDeRango(rango);
    return { desde: dias === null ? undefined : toInstant(addPlainDays(getToday(), -dias)), hasta: undefined };
  }, [rango, diaDesde, diaHasta, getToday, toInstant]);

  const cargar = useCallback(async () => {
    if (!organizationId) return;
    setFallo(false);
    try {
      const s = new AIJobsService(organizationId);
      const [js, st] = await Promise.all([
        s.getJobs({ status: estado === TODOS ? undefined : estado, jobType: tipo === TODOS ? undefined : tipo, dateFrom: desde, dateTo: hasta }, 200),
        // Cifras de hoy en la zona de la organización (Figma 94-chat-recuperado-12).
        s.getStats(toInstant(getToday())),
      ]);
      setTrabajos(js);
      setStats(st);
    } catch (e) {
      console.error('Error cargando trabajos de IA:', e);
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, [organizationId, estado, tipo, desde, hasta, getToday, toInstant]);

  useEffect(() => {
    setCargando(true);
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!organizationId) return;
    const canal = supabase
      .channel(`ai_jobs_${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_jobs', filter: `organization_id=eq.${organizationId}` }, () => cargar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [organizationId, cargar]);

  const abrir = async (j: AIJob) => {
    setAbierto(j);
    setBitacora([]);
    if (!organizationId) return;
    try {
      setBitacora(await new AIJobsService(organizationId).getJobLogs(j.id));
    } catch {
      setBitacora([]);
    }
  };

  const accion = async (j: AIJob, que: 'reintentar' | 'cancelar') => {
    if (!organizationId || !memberId) {
      toast({ title: t('trabajos.toasts.sinMiembro'), variant: 'destructive' });
      return;
    }
    setOcupado(true);
    try {
      const s = new AIJobsService(organizationId);
      if (que === 'reintentar') await s.retryJob(j.id, memberId);
      else await s.cancelJob(j.id, memberId);
      toast({ title: t(que === 'reintentar' ? 'trabajos.toasts.reintentado' : 'trabajos.toasts.cancelado') });
      setAbierto(null);
      await cargar();
    } catch (e) {
      console.error('Error en el trabajo de IA:', e);
      toast({ title: t('trabajos.toasts.error'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const nombreTipo = (v: string) => (t.has(`trabajos.tipos.${v}`) ? t(`trabajos.tipos.${v}`) : v);
  const nombreEstado = (v: string) => {
    const e = estadoTrabajo(v);
    return t.has(`trabajos.estados.${e}`) ? t(`trabajos.estados.${e}`) : e;
  };
  const ahora = useMemo(() => new Date(), [trabajos]); // eslint-disable-line react-hooks/exhaustive-deps

  const columnas: ColumnaTabla<AIJob>[] = [
    {
      id: 'id',
      encabezado: t('trabajos.tabla.id'),
      ancho: 100,
      ocultarDebajo: 'lg',
      celda: (j) => (
        <span className="text-[13px] tabular-nums text-fg-secondary" title={j.id}>
          {idCorto(j.id)}
        </span>
      ),
    },
    { id: 'tipo', encabezado: t('trabajos.tabla.tipo'), ancho: 220, celda: (j) => <span className="text-sm font-medium text-fg">{nombreTipo(j.job_type)}</span> },
    {
      id: 'conversacion',
      encabezado: t('trabajos.tabla.conversacion'),
      celda: (j) => (
        <p className="truncate text-sm text-fg" title={j.conversation?.channel?.name ?? undefined}>
          {j.conversation?.customer?.full_name || t('trabajos.sinCliente')}
        </p>
      ),
    },
    {
      id: 'estado',
      encabezado: t('trabajos.tabla.estado'),
      ancho: 140,
      celda: (j) => (
        <Badge tono={tonoEstadoTrabajo(j.status)} apariencia="contorno" tamano="sm">
          {nombreEstado(j.status)}
        </Badge>
      ),
    },
    {
      id: 'tokens',
      encabezado: t('trabajos.tabla.tokens'),
      variante: 'importe',
      ancho: 100,
      ocultarDebajo: 'lg',
      celda: (j) => {
        const n = (j.prompt_tokens ?? 0) + (j.completion_tokens ?? 0);
        return n ? n.toLocaleString(locale) : '—';
      },
    },
    {
      id: 'duracion',
      encabezado: t('trabajos.tabla.duracion'),
      variante: 'importe',
      ancho: 100,
      ocultarDebajo: 'lg',
      celda: (j) => <span className="text-sm text-fg">{textoDuracion(duracionMs(j, ahora), locale)}</span>,
    },
    {
      id: 'confianza',
      encabezado: t('trabajos.tabla.confianza'),
      ancho: 110,
      ocultarDebajo: 'lg',
      celda: (j) =>
        j.confidence_score == null ? (
          <span className="text-sm text-fg-muted">—</span>
        ) : (
          <Badge tono={tonoConfianza(j.confidence_score)} tamano="sm">
            {textoConfianza(j.confidence_score, locale)}
          </Badge>
        ),
    },
    {
      id: 'valoracion',
      encabezado: tv('columna'),
      ancho: 120,
      ocultarDebajo: 'md',
      celda: (j) => {
        const r = resumenValoraciones(j.valoraciones);
        if (!r.util && !r.noUtil) return <span className="text-sm text-fg-muted">—</span>;
        return (
          <span className="inline-flex items-center gap-3 text-sm text-fg-secondary" aria-label={tv('resumen', { util: r.util, noUtil: r.noUtil })}>
            {r.util ? (
              <span className="inline-flex items-center gap-1">
                <ThumbsUp aria-hidden="true" className="size-3.5 text-success-text" />
                {r.util}
              </span>
            ) : null}
            {r.noUtil ? (
              <span className="inline-flex items-center gap-1">
                <ThumbsDown aria-hidden="true" className="size-3.5 text-danger-text" />
                {r.noUtil}
              </span>
            ) : null}
          </span>
        );
      },
    },
    { id: 'cuando', encabezado: t('trabajos.tabla.cuando'), ancho: 130, ocultarDebajo: 'md', celda: (j) => <span className="text-sm text-fg">{tiempoRelativo(j.created_at, ahora, locale)}</span> },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('trabajos.subtitulo')}
        cargando={cargando}
        acciones={
          <button
            type="button"
            disabled={actualizando}
            aria-busy={actualizando || undefined}
            onClick={async () => {
              setActualizando(true);
              try {
                await cargar();
              } finally {
                setActualizando(false);
              }
            }}
            className={clasesBoton({ variante: 'secundario' })}
          >
            <RefreshCw aria-hidden="true" className={actualizando ? 'size-4 animate-spin' : 'size-4'} />
            {t('trabajos.actualizar')}
          </button>
        }
        debajo={<IANavTabs className="w-full max-w-3xl" />}
      />

      <KpiStrip etiqueta={t('trabajos.kpis.etiqueta')} columnas={5}>
        <StatCard tamano="sm" etiqueta={t('trabajos.kpis.hoy')} valor={stats?.total ?? 0} cargando={!stats && !fallo} />
        <StatCard tamano="sm" etiqueta={t('trabajos.kpis.enCola')} valor={stats?.pending ?? 0} cargando={!stats && !fallo} onClick={() => setEstado('pending')} />
        <StatCard tamano="sm" etiqueta={t('trabajos.kpis.procesando')} valor={stats?.running ?? 0} cargando={!stats && !fallo} onClick={() => setEstado('processing')} />
        <StatCard tamano="sm" etiqueta={t('trabajos.kpis.completados')} valor={stats?.completed ?? 0} cargando={!stats && !fallo} onClick={() => setEstado('completed')} />
        <StatCard tamano="sm" etiqueta={t('trabajos.kpis.fallidos')} valor={stats?.failed ?? 0} cargando={!stats && !fallo} onClick={() => setEstado('failed')} />
      </KpiStrip>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-full sm:w-48" aria-label={t('trabajos.filtros.estado')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>{t('trabajos.filtros.estadoTodos')}</SelectItem>
            {ESTADOS_TRABAJO.map((e) => (
              <SelectItem key={e} value={e}>
                {nombreEstado(e)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-full sm:w-56" aria-label={t('trabajos.filtros.tipo')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>{t('trabajos.filtros.tipoTodos')}</SelectItem>
            {TIPOS_TRABAJO.map((v) => (
              <SelectItem key={v} value={v}>
                {nombreTipo(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={rango} onValueChange={(v) => setRango(v as RangoTrabajos)}>
          <SelectTrigger className="w-full sm:w-44" aria-label={t('trabajos.filtros.fecha')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGOS_TRABAJOS.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`trabajos.filtros.rangos.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {rango === 'personalizado' ? (
          <>
            <CampoFecha
              valor={diaDesde}
              onValorChange={setDiaDesde}
              max={diaHasta || getToday()}
              hoy={getToday()}
              placeholder={t('trabajos.filtros.desde')}
              aria-label={t('trabajos.filtros.desde')}
              tamano="sm"
            />
            <CampoFecha
              valor={diaHasta}
              onValorChange={setDiaHasta}
              min={diaDesde || undefined}
              max={getToday()}
              hoy={getToday()}
              placeholder={t('trabajos.filtros.hasta')}
              aria-label={t('trabajos.filtros.hasta')}
              tamano="sm"
            />
          </>
        ) : null}
      </div>

      <DataTable<AIJob>
        etiqueta={t('trabajos.tabla.etiqueta')}
        columnas={columnas}
        filas={trabajos}
        obtenerId={(j) => j.id}
        estado={fallo ? 'error' : cargando ? 'cargando' : trabajos.length === 0 && (estado !== TODOS || tipo !== TODOS) ? 'sinResultados' : 'listo'}
        onFilaClick={abrir}
        acciones={(j) => [
          { id: 'ver', etiqueta: t('trabajos.acciones.verDetalle'), icono: Eye, onSelect: () => void abrir(j) },
          {
            id: 'conversacion',
            etiqueta: t('trabajos.detalle.abrirConversacion'),
            icono: MessageSquare,
            onSelect: () => router.push(`/app/chat/conversaciones/${j.conversation_id}`),
            oculta: !j.conversation_id,
          },
          { id: 'reintentar', etiqueta: t('trabajos.detalle.reintentar'), icono: RefreshCw, onSelect: () => void accion(j, 'reintentar'), oculta: !puedeReintentar(j) },
          { id: 'cancelar', etiqueta: t('trabajos.detalle.cancelar'), icono: XCircle, onSelect: () => void accion(j, 'cancelar'), oculta: !puedeCancelar(j) },
        ]}
        etiquetaFila={(j) => nombreTipo(j.job_type)}
        tonoFila={(j) => (j.status === 'failed' ? 'peligro' : undefined)}
        onReintentar={cargar}
        onLimpiarFiltros={() => {
          setEstado(TODOS);
          setTipo(TODOS);
        }}
        vacio={{ titulo: t('trabajos.vacioTitulo'), descripcion: t('trabajos.vacioDescripcion') }}
        tarjetaMovil={(j) => (
          <button type="button" onClick={() => abrir(j)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-left">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-fg">{nombreTipo(j.job_type)}</span>
              <span className="block truncate text-xs text-fg-muted">
                {j.conversation?.customer?.full_name || t('trabajos.sinCliente')} · {tiempoRelativo(j.created_at, ahora, locale)}
              </span>
            </span>
            <Badge tono={tonoEstadoTrabajo(j.status)} apariencia="contorno" tamano="sm">
              {nombreEstado(j.status)}
            </Badge>
          </button>
        )}
      />

      <HojaTrabajo
        trabajo={abierto}
        bitacora={bitacora}
        nombrePersona={(memberId) => agentes.find((a) => a.memberId === memberId)?.nombre ?? null}
        ocupado={ocupado}
        onCerrar={() => setAbierto(null)}
        onReintentar={(j) => accion(j, 'reintentar')}
        onCancelar={(j) => accion(j, 'cancelar')}
      />
    </div>
  );
}
