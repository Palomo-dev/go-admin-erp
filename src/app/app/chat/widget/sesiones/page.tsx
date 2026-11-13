'use client';

/**
 * Visitantes del sitio web (Figma 91-chat-40): quién usa el chat del sitio.
 * Cifras, buscador, filtros de estado y cliente, y tabla paginada. Los datos
 * son los de `widgetSessionsService` (cada visitante es una conversación del
 * canal web); cerrar y reabrir usan sus mismos métodos.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink, Lock, LockOpen, RefreshCw, Settings, Users } from 'lucide-react';
import { AvatarIniciales, DataTable, KpiStrip, PageHeader, Pagination, SearchInput, StatCard, clasesBoton, type ColumnaTabla } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import WidgetSessionsService, { type SessionStats, type WidgetSession } from '@/lib/services/widgetSessionsService';
import { tiempoRelativo } from '@/components/chat/channels/canalesLogica';
import { filtrarVisitantes, type FiltroCliente, type FiltroEstadoVisitante } from '@/components/chat/widget/visitantesLogica';

export default function WidgetSessionsPage() {
  const t = useTranslations('chatModulo.widget');
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { formatTime, formatDate, getToday, toDate } = useFormatDate();

  const [sesiones, setSesiones] = useState<WidgetSession[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [canalWeb, setCanalWeb] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<FiltroEstadoVisitante>('todos');
  const [cliente, setCliente] = useState<FiltroCliente>('todos');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);

  const cargar = useCallback(async () => {
    if (!organizationId) return;
    setCargando(true);
    setFallo(false);
    try {
      const s = new WidgetSessionsService(organizationId);
      const [ss, st, cs] = await Promise.all([s.getSessions({ status: 'all' }), s.getStats(), s.getChannels()]);
      setSesiones(ss);
      setStats(st);
      setCanalWeb(cs.find((c) => c.type === 'website')?.id ?? null);
    } catch (e) {
      console.error('Error cargando visitantes del widget:', e);
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, [organizationId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(() => filtrarVisitantes(sesiones, { busqueda, estado, cliente }), [sesiones, busqueda, estado, cliente]);
  useEffect(() => setPagina(1), [busqueda, estado, cliente]);
  const pagina_ = visibles.slice((pagina - 1) * tamano, pagina * tamano);
  const ahora = useMemo(() => new Date(), [sesiones]); // eslint-disable-line react-hooks/exhaustive-deps
  const hoy = getToday();

  const cambiarConversacion = async (s: WidgetSession, cerrar: boolean) => {
    if (!organizationId) return;
    try {
      const servicio = new WidgetSessionsService(organizationId);
      if (cerrar) await servicio.blockSession(s.id);
      else await servicio.unblockSession(s.id);
      toast({ title: t(cerrar ? 'toasts.cerrada' : 'toasts.reabierta') });
      cargar();
    } catch (e) {
      console.error('Error cambiando la conversación del visitante:', e);
      toast({ title: t('toasts.error'), variant: 'destructive' });
    }
  };

  const nombre = (s: WidgetSession) => s.customer?.full_name || t('anonimo');
  const cuando = (fecha: string) => (toDate(new Date(fecha)) === hoy ? formatTime(fecha) : formatDate(fecha));

  const columnas: ColumnaTabla<WidgetSession>[] = [
    {
      id: 'visitante',
      encabezado: t('tabla.visitante'),
      celda: (s) => (
        <div className="flex min-w-0 items-center gap-3">
          <AvatarIniciales nombre={nombre(s)} tamano="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{nombre(s)}</p>
            <p className="truncate text-xs text-fg-muted">{s.customer?.email || (s.customer ? t('cliente') : t('sinDatos'))}</p>
          </div>
        </div>
      ),
    },
    { id: 'canal', encabezado: t('tabla.canal'), ancho: 180, ocultarDebajo: 'lg', celda: (s) => <span className="truncate text-sm text-fg-secondary">{s.channel?.name ?? '—'}</span> },
    {
      id: 'estado',
      encabezado: t('tabla.estado'),
      ancho: 120,
      celda: (s) => (
        <Badge tono={s.is_active ? 'exito' : 'neutro'} tamano="sm" punto={s.is_active}>
          {t(s.is_active ? 'estados.enLinea' : 'estados.inactivo')}
        </Badge>
      ),
    },
    {
      id: 'conversacion',
      encabezado: t('tabla.conversacion'),
      ancho: 140,
      ocultarDebajo: 'md',
      celda: (s) => <span className="text-sm text-fg-secondary">{t.has(`conversacion.${s.conversation_status}`) ? t(`conversacion.${s.conversation_status}`) : '—'}</span>,
    },
    { id: 'visto', encabezado: t('tabla.ultimaVez'), ancho: 140, ocultarDebajo: 'lg', celda: (s) => <span className="text-sm text-fg-secondary">{tiempoRelativo(s.last_seen_at, ahora, locale)}</span> },
    { id: 'inicio', encabezado: t('tabla.inicio'), ancho: 110, ocultarDebajo: 'md', celda: (s) => <span className="text-sm tabular-nums text-fg-secondary">{cuando(s.created_at)}</span> },
  ];

  const abrirConversacion = (s: WidgetSession) => router.push(`/app/chat/conversaciones/${s.id}`);

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={Users}
        cargando={cargando}
        acciones={
          <>
            {canalWeb && (
              <button type="button" onClick={() => router.push(`/app/chat/canales/sitio-web/${canalWeb}`)} className={clasesBoton({ variante: 'secundario' })}>
                <Settings aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('configurar')}
              </button>
            )}
            <button type="button" onClick={cargar} disabled={cargando} className={clasesBoton({ variante: 'fantasma' })}>
              <RefreshCw aria-hidden="true" className={`size-4 ${cargando ? 'animate-spin' : ''}`} strokeWidth={1.5} />
              {t('actualizar')}
            </button>
          </>
        }
        movil={{ accionesEnFila: true }}
      />

      <KpiStrip etiqueta={t('kpis.etiqueta')} columnas={5}>
        <StatCard tamano="sm" etiqueta={t('kpis.sesiones')} valor={stats?.total ?? 0} cargando={!stats && !fallo} />
        <StatCard tamano="sm" etiqueta={t('kpis.enLinea')} valor={stats?.active ?? 0} tono="exito" cargando={!stats && !fallo} onClick={() => setEstado('enLinea')} />
        <StatCard tamano="sm" etiqueta={t('kpis.identificados')} valor={stats?.withCustomer ?? 0} cargando={!stats && !fallo} onClick={() => setCliente('identificados')} />
        <StatCard tamano="sm" etiqueta={t('kpis.anonimos')} valor={stats?.anonymous ?? 0} cargando={!stats && !fallo} onClick={() => setCliente('anonimos')} />
        <StatCard tamano="sm" etiqueta={t('kpis.inactivos')} valor={stats?.expired ?? 0} cargando={!stats && !fallo} onClick={() => setEstado('inactivo')} />
      </KpiStrip>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} placeholder={t('buscar')} className="w-full sm:max-w-sm" />
        <Select value={estado} onValueChange={(v) => setEstado(v as FiltroEstadoVisitante)}>
          <SelectTrigger className="w-full sm:w-44" aria-label={t('filtros.estado')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['todos', 'enLinea', 'inactivo'] as const).map((e) => (
              <SelectItem key={e} value={e}>
                {t(`filtros.estados.${e}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={cliente} onValueChange={(v) => setCliente(v as FiltroCliente)}>
          <SelectTrigger className="w-full sm:w-48" aria-label={t('filtros.cliente')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['todos', 'identificados', 'anonimos'] as const).map((c) => (
              <SelectItem key={c} value={c}>
                {t(`filtros.clientes.${c}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable<WidgetSession>
        etiqueta={t('tabla.etiqueta')}
        columnas={columnas}
        filas={pagina_}
        obtenerId={(s) => s.id}
        estado={fallo ? 'error' : cargando ? 'cargando' : visibles.length === 0 && (busqueda || estado !== 'todos' || cliente !== 'todos') ? 'sinResultados' : 'listo'}
        termino={busqueda}
        onReintentar={cargar}
        onLimpiarFiltros={() => {
          setBusqueda('');
          setEstado('todos');
          setCliente('todos');
        }}
        onFilaClick={abrirConversacion}
        etiquetaFila={nombre}
        vacio={{ titulo: t('vacioTitulo'), descripcion: t('vacioDescripcion') }}
        acciones={(s) => [
          { id: 'abrir', etiqueta: t('acciones.abrir'), icono: ExternalLink, onSelect: () => abrirConversacion(s) },
          s.conversation_status === 'closed'
            ? { id: 'reabrir', etiqueta: t('acciones.reabrir'), icono: LockOpen, onSelect: () => cambiarConversacion(s, false) }
            : { id: 'cerrar', etiqueta: t('acciones.cerrar'), icono: Lock, onSelect: () => cambiarConversacion(s, true) },
        ]}
        tarjetaMovil={(s) => (
          <button type="button" onClick={() => abrirConversacion(s)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left">
            <AvatarIniciales nombre={nombre(s)} tamano="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">{nombre(s)}</span>
              <span className="block truncate text-xs text-fg-muted">{tiempoRelativo(s.last_seen_at, ahora, locale)}</span>
            </span>
            <Badge tono={s.is_active ? 'exito' : 'neutro'} tamano="sm">
              {t(s.is_active ? 'estados.enLinea' : 'estados.inactivo')}
            </Badge>
          </button>
        )}
        pie={
          visibles.length > 0 ? (
            <Pagination pagina={pagina} tamano={tamano} total={visibles.length} sustantivo={{ singular: t('sustantivo.uno'), plural: t('sustantivo.varios') }} onPaginaChange={setPagina} onTamanoChange={(n) => (setTamano(n), setPagina(1))} />
          ) : undefined
        }
      />
    </div>
  );
}
