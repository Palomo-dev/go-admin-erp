'use client';

/**
 * Visitantes del sitio web (Figma 91-chat-40 y 94-chat-recuperado-ia-07/08):
 * quién usa el chat del sitio ahora y qué está mirando. Cifras de hoy,
 * buscador (página, ciudad o nombre), filtros de estado, cliente y canal, tabla
 * paginada (visitante, página actual, dispositivo, estado, conversación e
 * inicio) y detalle de la sesión en hoja lateral. «Bloqueado» (insignia y
 * cifra): su cliente o su conversación tienen un bloqueo vigente en
 * `chat_contactos_bloqueados` (regla de `bloqueoContacto.estaBloqueado`).
 *
 * Cada fila es una visita de `widget_sessions` (la Edge Function `chat-widget`
 * guarda página, origen, navegador y dispositivo) con la conversación que abrió
 * el visitante si llegó a escribir. Cerrar y reabrir actúan sobre esa
 * conversación (`widgetSessionsService`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, Lock, LockOpen, MessageSquare, Monitor, RefreshCw, Settings, Smartphone, Tablet, Users } from 'lucide-react';
import { AvatarIniciales, DataTable, FilaDato, KpiStrip, ListaDatos, PageHeader, Pagination, SearchInput, StatCard, Tarjeta, clasesBoton, type ColumnaTabla } from '@/components/kit';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import WidgetSessionsService, { type SessionStats, type WidgetSession } from '@/lib/services/widgetSessionsService';
import { DatoEnCaja } from '@/components/chat/DatoEnCaja';
import { estadoVisitante, filtrarVisitantes, partesSubtitulo, rutaDePagina, type FiltroCliente, type FiltroEstadoVisitante } from '@/components/chat/widget/visitantesLogica';

const TODOS_CANALES = '__todos__';
const ICONO_DISPOSITIVO = { mobile: Smartphone, tablet: Tablet, desktop: Monitor } as const;
const TONO_ESTADO = { enLinea: 'exito', inactivo: 'neutro', bloqueado: 'peligro' } as const;

export default function WidgetSessionsPage() {
  const t = useTranslations('chatModulo.widget');
  const tr = useTranslations('chatRecuperado.widget');
  const tTipos = useTranslations('chatModulo.canales.tipos');
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { formatTime, formatDate, formatDateTime, getToday, toDate, toInstant } = useFormatDate();

  const [sesiones, setSesiones] = useState<WidgetSession[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [canales, setCanales] = useState<{ id: string; name: string; type: string }[]>([]);
  const canalWeb = canales[0]?.id ?? null;
  const [canal, setCanal] = useState<string>(TODOS_CANALES);
  const [abierta, setAbierta] = useState<WidgetSession | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<FiltroEstadoVisitante>('todos');
  const [cliente, setCliente] = useState<FiltroCliente>('todos');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);

  const hoy = getToday();

  const cargar = useCallback(async () => {
    if (!organizationId) return;
    setCargando(true);
    setFallo(false);
    try {
      const s = new WidgetSessionsService(organizationId);
      const [ss, st, cs] = await Promise.all([s.getSessions(), s.getStats(toInstant(hoy)), s.getChannels()]);
      setSesiones(ss);
      setStats(st);
      setCanales(cs.filter((c) => c.type === 'website'));
    } catch (e) {
      console.error('Error cargando visitantes del widget:', e);
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, [organizationId, hoy, toInstant]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(
    () => filtrarVisitantes(sesiones, { busqueda, estado, cliente, canal: canal === TODOS_CANALES ? null : canal }),
    [sesiones, busqueda, estado, cliente, canal],
  );
  useEffect(() => setPagina(1), [busqueda, estado, cliente, canal]);
  const pagina_ = visibles.slice((pagina - 1) * tamano, pagina * tamano);

  const cambiarConversacion = async (s: WidgetSession, cerrar: boolean) => {
    if (!organizationId || !s.conversation_id) return;
    try {
      const servicio = new WidgetSessionsService(organizationId);
      if (cerrar) await servicio.blockSession(s.conversation_id);
      else await servicio.unblockSession(s.conversation_id);
      toast({ title: t(cerrar ? 'toasts.cerrada' : 'toasts.reabierta') });
      cargar();
    } catch (e) {
      console.error('Error cambiando la conversación del visitante:', e);
      toast({ title: t('toasts.error'), variant: 'destructive' });
    }
  };

  const nombre = (s: WidgetSession) => s.customer?.full_name || t('anonimo');
  const cuando = (fecha: string) => (toDate(new Date(fecha)) === hoy ? formatTime(fecha) : formatDate(fecha));
  const subtitulo = (s: WidgetSession) => {
    const p = partesSubtitulo(s);
    const partes = [p.esCliente ? t('cliente') : null, p.ciudad, p.origen].filter(Boolean);
    return partes.length > 0 ? partes.join(' · ') : tr('desconocido');
  };
  const etiquetaEstado = (s: WidgetSession) => {
    const e = estadoVisitante(s);
    return e === 'bloqueado' ? tr('bloqueado') : t(e === 'enLinea' ? 'estados.enLinea' : 'estados.inactivo');
  };
  const insigniaEstado = (s: WidgetSession) => (
    <Badge tono={TONO_ESTADO[estadoVisitante(s)]} tamano="sm">
      {etiquetaEstado(s)}
    </Badge>
  );
  const dispositivo = (s: WidgetSession) => (s.device_type && tr.has(`dispositivos.${s.device_type}`) ? tr(`dispositivos.${s.device_type}`) : null);
  const conversacion = (s: WidgetSession) => {
    if (!s.conversation_id || !s.conversation_status) return '—';
    const estadoConv = t.has(`conversacion.${s.conversation_status}`) ? t(`conversacion.${s.conversation_status}`) : s.conversation_status;
    if (s.conversation_status === 'closed' || s.conversation_status === 'archived') return estadoConv;
    return `${estadoConv} · ${s.assigned_name ?? tr('sinAsignar')}`;
  };

  const columnas: ColumnaTabla<WidgetSession>[] = [
    {
      id: 'visitante',
      encabezado: t('tabla.visitante'),
      celda: (s) => (
        <div className="flex min-w-0 items-center gap-3">
          <AvatarIniciales nombre={nombre(s)} tamano="sm" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-fg">{nombre(s)}</p>
            <p className="truncate text-xs text-fg-muted">{subtitulo(s)}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'pagina',
      encabezado: tr('pagina'),
      ancho: 260,
      ocultarDebajo: 'md',
      celda: (s) => <span className="block truncate text-sm text-fg-secondary">{rutaDePagina(s.current_page) ?? '—'}</span>,
    },
    {
      id: 'dispositivo',
      encabezado: tr('dispositivo'),
      ancho: 140,
      ocultarDebajo: 'lg',
      celda: (s) => {
        const etiqueta = dispositivo(s);
        if (!etiqueta) return <span className="text-sm text-fg-muted">—</span>;
        const Icono = ICONO_DISPOSITIVO[s.device_type as keyof typeof ICONO_DISPOSITIVO] ?? Monitor;
        return (
          <span className="inline-flex items-center gap-1.5 text-sm text-fg-secondary">
            <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {etiqueta}
          </span>
        );
      },
    },
    {
      id: 'estado',
      encabezado: t('tabla.estado'),
      ancho: 120,
      celda: (s) => insigniaEstado(s),
    },
    { id: 'conversacion', encabezado: t('tabla.conversacion'), ancho: 170, ocultarDebajo: 'md', celda: (s) => <span className="block truncate text-sm text-fg-secondary">{conversacion(s)}</span> },
    { id: 'inicio', encabezado: t('tabla.inicio'), ancho: 100, ocultarDebajo: 'md', celda: (s) => <span className="text-sm tabular-nums text-fg-secondary">{cuando(s.created_at)}</span> },
  ];

  const abrirConversacion = (s: WidgetSession) => s.conversation_id && router.push(`/app/chat/conversaciones/${s.conversation_id}`);
  const ubicacion = (s: WidgetSession) =>
    [s.location_data?.city, s.location_data?.region, s.location_data?.country].filter(Boolean).join(', ') || s.customer?.city || null;

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={tr('subtitulo')}
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
        <StatCard etiqueta={tr('kpiHoy')} valor={stats?.today ?? 0} cargando={!stats && !fallo} />
        <StatCard etiqueta={t('kpis.enLinea')} valor={stats?.active ?? 0} cargando={!stats && !fallo} onClick={() => setEstado('enLinea')} />
        <StatCard etiqueta={t('kpis.identificados')} valor={stats?.withCustomer ?? 0} detalle={tr('identificadosDetalle')} cargando={!stats && !fallo} onClick={() => setCliente('identificados')} />
        <StatCard etiqueta={t('kpis.anonimos')} valor={stats?.anonymous ?? 0} cargando={!stats && !fallo} onClick={() => setCliente('anonimos')} />
        <StatCard etiqueta={tr('kpiBloqueados')} valor={stats?.blocked ?? 0} cargando={!stats && !fallo} onClick={() => setEstado('bloqueado')} />
      </KpiStrip>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} placeholder={tr('buscar')} className="w-full sm:w-80" />
        <Select value={estado} onValueChange={(v) => setEstado(v as FiltroEstadoVisitante)}>
          <SelectTrigger className="w-full sm:w-[180px]" aria-label={t('filtros.estado')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['todos', 'enLinea', 'inactivo'] as const).map((e) => (
              <SelectItem key={e} value={e}>
                {t(`filtros.estados.${e}`)}
              </SelectItem>
            ))}
            <SelectItem value="bloqueado">{tr('filtroBloqueados')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={cliente} onValueChange={(v) => setCliente(v as FiltroCliente)}>
          <SelectTrigger className="w-full sm:w-[180px]" aria-label={t('filtros.cliente')}>
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
        {canales.length > 0 && (
          <Select value={canal} onValueChange={setCanal}>
            <SelectTrigger className="w-full sm:w-60" aria-label={tr('filtroCanal')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_CANALES}>{tr('canalTodos')}</SelectItem>
              {canales.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <DataTable<WidgetSession>
        etiqueta={t('tabla.etiqueta')}
        columnas={columnas}
        filas={pagina_}
        obtenerId={(s) => s.id}
        estado={fallo ? 'error' : cargando ? 'cargando' : visibles.length === 0 && (busqueda || estado !== 'todos' || cliente !== 'todos' || canal !== TODOS_CANALES) ? 'sinResultados' : 'listo'}
        termino={busqueda}
        onReintentar={cargar}
        onLimpiarFiltros={() => {
          setBusqueda('');
          setEstado('todos');
          setCliente('todos');
          setCanal(TODOS_CANALES);
        }}
        onFilaClick={setAbierta}
        etiquetaFila={nombre}
        vacio={{ titulo: t('vacioTitulo'), descripcion: t('vacioDescripcion') }}
        acciones={(s) => [
          { id: 'detalle', etiqueta: tr('verDetalle'), icono: Eye, onSelect: () => setAbierta(s) },
          { id: 'abrir', etiqueta: t('acciones.abrir'), icono: MessageSquare, onSelect: () => abrirConversacion(s), oculta: !s.conversation_id },
          s.conversation_status === 'closed'
            ? { id: 'reabrir', etiqueta: t('acciones.reabrir'), icono: LockOpen, onSelect: () => cambiarConversacion(s, false), oculta: !s.conversation_id }
            : { id: 'cerrar', etiqueta: t('acciones.cerrar'), icono: Lock, onSelect: () => cambiarConversacion(s, true), oculta: !s.conversation_id },
        ]}
        tarjetaMovil={(s) => (
          <button type="button" onClick={() => setAbierta(s)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left">
            <AvatarIniciales nombre={nombre(s)} tamano="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">{nombre(s)}</span>
              <span className="block truncate text-xs text-fg-muted">{rutaDePagina(s.current_page) ?? subtitulo(s)}</span>
            </span>
            {insigniaEstado(s)}
          </button>
        )}
        pie={
          visibles.length > 0 ? (
            <Pagination pagina={pagina} tamano={tamano} total={visibles.length} sustantivo={{ singular: t('sustantivo.uno'), plural: t('sustantivo.varios') }} onPaginaChange={setPagina} onTamanoChange={(n) => (setTamano(n), setPagina(1))} />
          ) : undefined
        }
      />

      {abierta && (
        <HojaDetalle abierto onAbiertoChange={(a) => !a && setAbierta(null)} titulo={nombre(abierta)} subtitulo={tr('detalleTitulo')}>
          <div className="flex flex-col gap-4">
            <Tarjeta titulo={tr('detalleTitulo')}>
              <ListaDatos etiqueta={tr('detalleTitulo')}>
                <DatoEnCaja etiqueta={tr('idAnonimo')} valor={abierta.anon_id} mono />
                <FilaDato etiqueta={tr('inicio')} valor={formatDateTime(abierta.created_at)} />
                <FilaDato etiqueta={tr('ultimaActividad')} valor={formatDateTime(abierta.last_seen_at)} />
                <FilaDato etiqueta={tr('canal')} valor={abierta.channel?.name ?? '—'} />
                {abierta.channel?.type && (
                  <FilaDato etiqueta={tr('tipoCanal')} valor={tTipos.has(abierta.channel.type) ? tTipos(abierta.channel.type) : abierta.channel.type} />
                )}
                <FilaDato etiqueta={tr('cliente')} valor={abierta.customer?.full_name ?? t('anonimo')} />
                <FilaDato etiqueta={tr('correo')} valor={abierta.customer?.email ?? '—'} />
                {dispositivo(abierta) && <FilaDato etiqueta={tr('dispositivo')} valor={dispositivo(abierta)} />}
                {ubicacion(abierta) && <FilaDato etiqueta={tr('ubicacion')} valor={ubicacion(abierta)} />}
                {abierta.current_page && <DatoEnCaja etiqueta={tr('pagina')} valor={abierta.current_page} />}
                {abierta.referrer && <DatoEnCaja etiqueta={tr('origen')} valor={abierta.referrer} />}
                {abierta.user_agent && <DatoEnCaja etiqueta={tr('navegador')} valor={abierta.user_agent} mono />}
              </ListaDatos>
            </Tarjeta>
            {abierta.conversation_id && (
              <button type="button" onClick={() => abrirConversacion(abierta)} className={clasesBoton({ anchoCompleto: true })}>
                <MessageSquare aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {tr('abrirConversacion')}
              </button>
            )}
          </div>
        </HojaDetalle>
      )}
    </div>
  );
}
