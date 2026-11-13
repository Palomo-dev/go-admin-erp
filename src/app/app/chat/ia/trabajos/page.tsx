'use client';

/**
 * Trabajos de la IA del chat (Figma 91-chat-35): cifras, filtros de estado,
 * tipo y fecha, tabla y detalle en hoja lateral. Se actualiza en tiempo real
 * (`ai_jobs`). Reintentar y cancelar usan `aiJobsService` como antes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Bot } from 'lucide-react';
import { DataTable, KpiStrip, PageHeader, StatCard, type ColumnaTabla } from '@/components/kit';
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
import { diasDeRango, estadoTrabajo, ESTADOS_TRABAJO, TIPOS_TRABAJO, tonoEstadoTrabajo, type RangoTrabajos } from '@/components/chat/ia/trabajos/trabajosLogica';
import { useMiembroActual } from '@/components/chat/conocimiento/useMiembroActual';
import { tiempoRelativo } from '@/components/chat/channels/canalesLogica';

const TODOS = 'all';

export default function TrabajosPage() {
  const t = useTranslations('chatModulo.ia');
  const locale = useLocale();
  const { toast } = useToast();
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
  const [abierto, setAbierto] = useState<AIJob | null>(null);
  const [bitacora, setBitacora] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);

  const desde = useMemo(() => {
    const dias = diasDeRango(rango);
    return dias === null ? undefined : toInstant(addPlainDays(getToday(), -dias));
  }, [rango, getToday, toInstant]);

  const cargar = useCallback(async () => {
    if (!organizationId) return;
    setFallo(false);
    try {
      const s = new AIJobsService(organizationId);
      const [js, st] = await Promise.all([
        s.getJobs({ status: estado === TODOS ? undefined : estado, jobType: tipo === TODOS ? undefined : tipo, dateFrom: desde }, 200),
        s.getStats(),
      ]);
      setTrabajos(js);
      setStats(st);
    } catch (e) {
      console.error('Error cargando trabajos de IA:', e);
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, [organizationId, estado, tipo, desde]);

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
    { id: 'tipo', encabezado: t('trabajos.tabla.tipo'), ancho: 220, celda: (j) => <span className="text-sm font-medium text-fg">{nombreTipo(j.job_type)}</span> },
    {
      id: 'conversacion',
      encabezado: t('trabajos.tabla.conversacion'),
      celda: (j) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-fg">{j.conversation?.customer?.full_name || t('trabajos.sinCliente')}</p>
          {j.conversation?.channel?.name && <p className="truncate text-xs text-fg-muted">{j.conversation.channel.name}</p>}
        </div>
      ),
    },
    {
      id: 'estado',
      encabezado: t('trabajos.tabla.estado'),
      ancho: 140,
      celda: (j) => (
        <Badge tono={tonoEstadoTrabajo(j.status)} tamano="sm">
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
    { id: 'cuando', encabezado: t('trabajos.tabla.cuando'), ancho: 140, ocultarDebajo: 'md', celda: (j) => <span className="text-sm text-fg-secondary">{tiempoRelativo(j.created_at, ahora, locale)}</span> },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader titulo={t('titulo')} subtitulo={t('trabajos.subtitulo')} icono={Bot} cargando={cargando} debajo={<IANavTabs className="w-full max-w-3xl" />} />

      <KpiStrip etiqueta={t('trabajos.kpis.etiqueta')} columnas={5}>
        <StatCard tamano="sm" etiqueta={t('trabajos.kpis.total')} valor={stats?.total ?? 0} cargando={!stats && !fallo} />
        <StatCard tamano="sm" etiqueta={t('trabajos.kpis.enCola')} valor={stats?.pending ?? 0} cargando={!stats && !fallo} onClick={() => setEstado('pending')} />
        <StatCard tamano="sm" etiqueta={t('trabajos.kpis.procesando')} valor={stats?.running ?? 0} cargando={!stats && !fallo} onClick={() => setEstado('processing')} />
        <StatCard tamano="sm" etiqueta={t('trabajos.kpis.completados')} valor={stats?.completed ?? 0} tono="exito" cargando={!stats && !fallo} onClick={() => setEstado('completed')} />
        <StatCard
          tamano="sm"
          etiqueta={t('trabajos.kpis.fallidos')}
          valor={stats?.failed ?? 0}
          tono={stats?.failed ? 'peligro' : 'neutro'}
          resaltada={!!stats?.failed}
          cargando={!stats && !fallo}
          onClick={() => setEstado('failed')}
        />
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
            {(['hoy', '7d', '30d', 'todo'] as const).map((r) => (
              <SelectItem key={r} value={r}>
                {t(`trabajos.filtros.rangos.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable<AIJob>
        etiqueta={t('trabajos.tabla.etiqueta')}
        columnas={columnas}
        filas={trabajos}
        obtenerId={(j) => j.id}
        estado={fallo ? 'error' : cargando ? 'cargando' : trabajos.length === 0 && (estado !== TODOS || tipo !== TODOS) ? 'sinResultados' : 'listo'}
        onFilaClick={abrir}
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
            <Badge tono={tonoEstadoTrabajo(j.status)} tamano="sm">
              {nombreEstado(j.status)}
            </Badge>
          </button>
        )}
      />

      <HojaTrabajo
        trabajo={abierto}
        bitacora={bitacora}
        ocupado={ocupado}
        onCerrar={() => setAbierto(null)}
        onReintentar={(j) => accion(j, 'reintentar')}
        onCancelar={(j) => accion(j, 'cancelar')}
      />
    </div>
  );
}
