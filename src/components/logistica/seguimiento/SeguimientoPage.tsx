'use client';

/**
 * Logística › Seguimiento (`/app/logistica/seguimiento`). Figma «22 Logística»: una sola lista
 * «Por resolver» 2825:8985, con selección 2827:8980 y en celular 2828:9609.
 *
 * Por resolver = novedades abiertas y envíos sin movimiento desde las horas de Configuración ›
 * Logística (`horasSinMovimiento`: propio y transportadora por separado), con chips «Todo,
 * Novedades, Sin movimiento», el plazo (lo que vence primero, arriba) y la acción sugerida.
 * Lee con `listarSeguimiento`; reintentar y devolver van por `logistica_cambiar_estado`. Consultar
 * proveedor y abrir reclamo necesitan el conector de la transportadora (Fase 2): se muestran
 * deshabilitados con su motivo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bell, Eye, MapPin, MessageCircle, Navigation, RefreshCw, RotateCcw, Search, ShieldAlert } from 'lucide-react';
import {
  AccionRapida,
  BranchBadgeActiva,
  BulkActionBar,
  ChipsOpcion,
  DataTable,
  FilterChips,
  FilterPanel,
  FormField,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  StatCard,
  StatusBadge,
  clasesBoton,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess, toastWarning } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { addPlainDays, startOfDayInstant } from '@/lib/utils/dateCore';
import { deliveryIntegrationService, EnvioError } from '@/lib/services/deliveryIntegrationService';
import { avisosDesde, entregadosDesde, listarSeguimiento } from '@/lib/services/logistica/despachoService';
import {
  CHIPS_SEGUIMIENTO,
  META_PRIMER_INTENTO,
  accionRequiereConector,
  accionSugerida,
  consecuenciaDe,
  conteosSeguimiento,
  listaPorResolver,
  plazoDe,
  porResolver,
  tasaPrimerIntento,
  type AccionSugerida,
  type ChipSeguimiento,
  type FilaSeguimiento,
} from '@/lib/logistica/seguimiento';
import { transicionValida } from '@/lib/logistica/estadosEnvio';
import { enlaceWhatsApp } from '@/lib/logistica/misEnvios';
import { RUTAS_LOGISTICA, SECCION_CONFIGURACION_LOGISTICA, rutaEnvio } from '@/lib/logistica/rutas';
import { AJUSTES_LOGISTICA_POR_DEFECTO, normalizarAjustesLogistica, type AjustesLogistica } from '@/lib/logistica/ajustesLogistica';
import { AtajoConfigurar } from '@/components/configuracion/AtajoConfigurar';
import { avisarCliente } from '../logisticaApi';

const TAMANOS = [25, 50, 100] as const;

const ICONO_ACCION: Record<AccionSugerida, typeof Eye> = {
  reintentar: RefreshCw,
  cambiar_direccion: MapPin,
  contactar_cliente: MessageCircle,
  consultar_proveedor: Search,
  abrir_reclamo: ShieldAlert,
  ver_detalle: Eye,
};

export function SeguimientoPage() {
  const t = useTranslations('logistica.seguimiento');
  const tEnvio = useTranslations('logistica.envio');
  const router = useRouter();
  const entero = useFormatoEntero();
  const locale = useLocaleIntl();
  const { branchFilter } = useBranch();
  const { timezone, formatTime, formatDate, getToday } = useFormatDate();
  const organizationId = getOrganizationId();

  const l = useListadoServidor({ filtros: ['chip', 'propio'], tamanoPorDefecto: 25, tamanosPermitidos: TAMANOS });
  const chip: ChipSeguimiento = (CHIPS_SEGUIMIENTO as readonly string[]).includes(l.filtros.chip ?? '') ? (l.filtros.chip as ChipSeguimiento) : 'todo';
  const propio = l.filtros.propio === 'propio' || l.filtros.propio === 'transportadora' ? l.filtros.propio : null;

  const [filas, setFilas] = useState<FilaSeguimiento[]>([]);
  const [tasa, setTasa] = useState<number | null>(null);
  const [avisos, setAvisos] = useState<{ total: number; fallidosWhatsApp: number } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<'sin_permiso' | 'error' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [ahora, setAhora] = useState(() => new Date());
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [aDevolver, setADevolver] = useState<FilaSeguimiento | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  // Umbrales «sin movimiento» de la organización (GET /api/logistica/ajustes; cualquier miembro lee).
  const [ajustes, setAjustes] = useState<AjustesLogistica>(AJUSTES_LOGISTICA_POR_DEFECTO);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const hoy = getToday();

  useEffect(() => {
    if (!organizationId || typeof fetch !== 'function') return;
    let cancelado = false;
    fetch('/api/logistica/ajustes', { credentials: 'same-origin', cache: 'no-store', headers: { 'x-organization-id': String(organizationId) } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { ajustes?: unknown } | null) => {
        if (!cancelado && d) setAjustes(normalizarAjustesLogistica(d.ajustes));
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [organizationId, recarga]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    setCargando(true);
    setError(null);
    const inicioHoy = startOfDayInstant(hoy, timezone).toISOString();
    const hace30 = startOfDayInstant(addPlainDays(hoy, -30), timezone).toISOString();
    Promise.all([
      listarSeguimiento(supabase, { organizationId, branchId: branchFilter }),
      entregadosDesde(supabase, organizationId, hace30, branchFilter).catch(() => null),
      avisosDesde(supabase, organizationId, inicioHoy).catch(() => null),
    ])
      .then(([lista, entregados, av]) => {
        if (cancelado) return;
        setFilas(lista);
        setTasa(entregados ? tasaPrimerIntento(entregados) : null);
        setAvisos(av);
        setAhora(new Date());
      })
      .catch((e: { code?: string }) => !cancelado && setError(e?.code === '42501' ? 'sin_permiso' : 'error'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [organizationId, branchFilter, recarga, hoy, timezone]);

  const visibles = useMemo(() => listaPorResolver(filas, { chip, busqueda: l.busqueda, propio }, ahora, ajustes), [filas, chip, l.busqueda, propio, ahora, ajustes]);
  const pagina = useMemo(() => visibles.slice((l.pagina - 1) * l.tamano, l.pagina * l.tamano), [visibles, l.pagina, l.tamano]);
  const finDeHoy = useMemo(() => startOfDayInstant(addPlainDays(hoy, 1), timezone), [hoy, timezone]);
  const conteos = useMemo(() => conteosSeguimiento(filas, ahora, finDeHoy, ajustes), [filas, ahora, finDeHoy, ajustes]);
  const porId = useMemo(() => new Map(filas.map((f) => [f.id, f])), [filas]);
  const seleccionadas = useMemo(() => Array.from(seleccion, (id) => porId.get(id)).filter((f): f is FilaSeguimiento => !!f), [seleccion, porId]);

  useEffect(() => setSeleccion(new Set()), [chip, l.busqueda, propio, branchFilter]);

  // ── Acciones ───────────────────────────────────────────────────────────────
  const abrir = (f: FilaSeguimiento) => router.push(rutaEnvio(f.id));
  const mensajeError = (e: unknown) => {
    const c = e instanceof EnvioError ? e.codigo : 'ERROR';
    return tEnvio.has(`errores.${c}`) ? tEnvio(`errores.${c}`) : tEnvio('errores.ERROR');
  };

  const reintentar = async (lista: readonly FilaSeguimiento[]) => {
    const aptas = lista.filter((f) => transicionValida(f.status, 'out_for_delivery'));
    if (aptas.length === 0) return;
    setOcupado('reintentar');
    let ok = 0;
    let primer: unknown = null;
    for (const f of aptas) {
      try {
        const r = await deliveryIntegrationService.changeStatus(f.id, 'out_for_delivery', { nota: t('notaReintento') });
        if (r.aviso && f.pedidoWebId) void avisarCliente({ source_type: 'web_order', source_id: f.pedidoWebId }, r.aviso);
        ok += 1;
      } catch (e) {
        primer ??= e;
      }
    }
    setOcupado(null);
    if (ok > 0) toastSuccess(t('toast.reintentados', { count: ok }));
    if (primer) toastError(t('toast.error'), mensajeError(primer));
    setSeleccion(new Set());
    recargar();
  };

  const devolver = async (f: FilaSeguimiento) => {
    setOcupado('devolver');
    try {
      await deliveryIntegrationService.changeStatus(f.id, 'returned', { nota: t('notaDevolucion') });
      toastSuccess(t('toast.devuelto', { numero: f.numero }));
      setADevolver(null);
      recargar();
    } catch (e) {
      toastError(t('toast.error'), mensajeError(e));
    } finally {
      setOcupado(null);
    }
  };

  /** Reenvía el aviso del estado actual del pedido: «en camino» o, con intento fallido, «novedad». */
  const avisar = async (lista: readonly FilaSeguimiento[]) => {
    const conPedido = lista.filter((f) => f.pedidoWebId && (f.status === 'out_for_delivery' || f.status === 'failed_attempt'));
    setOcupado('avisar');
    let ok = 0;
    for (const f of conPedido) {
      const momento = f.status === 'failed_attempt' ? 'novedad' : 'en_camino';
      if (await avisarCliente({ source_type: 'web_order', source_id: f.pedidoWebId }, momento)) ok += 1;
    }
    setOcupado(null);
    if (ok > 0) toastSuccess(t('toast.avisados', { count: ok }));
    if (ok < lista.length) toastWarning(t('toast.sinAviso', { count: lista.length - ok }), t('toast.sinAvisoAyuda'));
    setSeleccion(new Set());
  };

  const contactar = (f: FilaSeguimiento) => {
    const enlace = enlaceWhatsApp(f.telefono, t('mensajeCliente', { numero: f.pedido ?? f.numero }));
    if (enlace) window.open(enlace, '_blank', 'noopener,noreferrer');
    else abrir(f);
  };

  const ejecutar = (a: AccionSugerida, f: FilaSeguimiento) => {
    if (a === 'reintentar') return void reintentar([f]);
    if (a === 'contactar_cliente') return contactar(f);
    // Cambiar dirección y ver detalle viven en el detalle del envío (mismo diálogo).
    return abrir(f);
  };

  const accionesDe = (f: FilaSeguimiento): AccionFila[] => [
    { id: 'detalle', etiqueta: t('acciones.ver_detalle'), icono: Eye, onSelect: () => abrir(f) },
    { id: 'reintentar', etiqueta: t('acciones.reintentar'), icono: RefreshCw, onSelect: () => void reintentar([f]), oculta: !transicionValida(f.status, 'out_for_delivery') },
    { id: 'contactar', etiqueta: t('acciones.contactar_cliente'), icono: MessageCircle, onSelect: () => contactar(f), oculta: !f.telefono },
    {
      id: 'proveedor',
      etiqueta: t('acciones.consultar_proveedor'),
      icono: Search,
      onSelect: () => undefined,
      deshabilitada: true,
      motivo: f.transportadora ? t('motivos.conector') : t('motivos.propio'),
    },
    { id: 'devolver', etiqueta: t('acciones.devolver'), icono: RotateCcw, destructiva: true, separadorAntes: true, onSelect: () => setADevolver(f), oculta: !transicionValida(f.status, 'returned') },
  ];

  // ── Celdas ─────────────────────────────────────────────────────────────────
  const quePaso = (f: FilaSeguimiento) => {
    const pr = porResolver(f, ahora, ajustes);
    if (!pr) return null;
    const etiqueta =
      pr.tipo === 'sin_movimiento'
        ? t('quePaso.sinMovimiento', { horas: pr.horas })
        : f.motivoNovedad
          ? f.intentosFallidos > 1
            ? t('quePaso.motivoIntento', { motivo: tEnvio.has(`motivos.${f.motivoNovedad}`) ? tEnvio(`motivos.${f.motivoNovedad}`) : f.motivoNovedad, n: f.intentosFallidos })
            : tEnvio.has(`motivos.${f.motivoNovedad}`)
              ? tEnvio(`motivos.${f.motivoNovedad}`)
              : f.motivoNovedad
          : tEnvio('estados.exception');
    const tono = pr.tipo === 'sin_movimiento' || f.motivoNovedad === 'not_home' ? 'advertencia' : 'peligro';
    return (
      <div className="flex min-w-0 max-w-[220px] flex-col items-start gap-1">
        <StatusBadge estado={pr.tipo} tono={tono} etiqueta={etiqueta} />
        {(f.detalleNovedad || f.ultimoEvento) && <span className="truncate text-xs text-fg-muted">«{f.detalleNovedad ?? f.ultimoEvento}»</span>}
      </div>
    );
  };

  const plazoCelda = (f: FilaSeguimiento) => {
    const plazo = plazoDe(f, ahora, ajustes);
    const vencido = new Date(plazo).getTime() <= ahora.getTime();
    const esHoy = new Date(plazo).getTime() < finDeHoy.getTime();
    const dia = formatDate(plazo);
    const texto = esHoy ? t('plazo.hoy', { hora: formatTime(plazo) }) : t('plazo.otroDia', { dia, hora: formatTime(plazo) });
    return (
      <div className="flex flex-col">
        <span className={vencido || esHoy ? 'font-medium text-danger-text' : 'font-medium text-warning-text'}>{texto}</span>
        <span className="text-xs text-fg-muted">{t(`consecuencias.${consecuenciaDe(f, ahora, ajustes)}`)}</span>
      </div>
    );
  };

  const accionRapida = (f: FilaSeguimiento) => {
    const a = accionSugerida(f, ahora, ajustes);
    const conector = accionRequiereConector(a);
    return (
      <AccionRapida
        icono={ICONO_ACCION[a]}
        etiqueta={t(`acciones.${a}`)}
        onClick={() => ejecutar(a, f)}
        deshabilitada={conector || ocupado !== null}
        motivo={conector ? t('motivos.conector') : undefined}
      />
    );
  };

  const columnas: ColumnaTabla<FilaSeguimiento>[] = [
    {
      id: 'envio',
      encabezado: t('columnas.envio'),
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{f.numero}</span>
          <span className="truncate text-xs text-fg-muted">{[f.pedido, t(`canales.${f.canal}`)].filter(Boolean).join(' · ')}</span>
        </div>
      ),
    },
    { id: 'quePaso', encabezado: t('columnas.quePaso'), celda: quePaso },
    {
      id: 'destino',
      encabezado: t('columnas.destino'),
      ocultarDebajo: 'lg',
      celda: (f) => (
        <div className="flex min-w-0 max-w-[200px] flex-col">
          <span className="truncate text-fg">{f.direccion ?? '—'}</span>
          <span className="truncate text-xs text-fg-muted">{[f.ciudad, f.barrio].filter(Boolean).join(' · ')}</span>
        </div>
      ),
    },
    {
      id: 'proveedor',
      encabezado: t('columnas.proveedor'),
      ocultarDebajo: 'md',
      celda: (f) => (
        <div className="flex min-w-0 max-w-[180px] flex-col">
          <span className="truncate text-fg">{f.transportadora ?? t('domiciliarioPropio')}</span>
          <span className="truncate text-xs text-fg-muted">{f.transportadora ? t('guia', { guia: f.guia ?? '—' }) : f.domiciliario ?? f.sede ?? '—'}</span>
        </div>
      ),
    },
    { id: 'plazo', encabezado: t('columnas.plazo'), celda: plazoCelda },
  ];

  const chips: ChipFiltro[] = propio ? [{ clave: 'propio', etiqueta: t(`filtros.${propio}`) }] : [];
  const estadoTabla = error === 'sin_permiso' ? 'sinPermiso' : cargando && filas.length === 0 ? 'cargando' : error ? 'error' : visibles.length === 0 ? (l.busqueda || chips.length || chip !== 'todo' ? 'sinResultados' : 'vacio') : 'listo';
  const sustantivo = { singular: t('sustantivo.singular'), plural: t('sustantivo.plural'), genero: 'masculino' as const };
  const pct = (v: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(v);
  const proveedoresSeleccionados = seleccionadas.filter((f) => f.transportadora).length;

  const menuCabecera: AccionFila[] = [
    { id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: recargar },
    { id: 'porDespachar', etiqueta: t('irPorDespachar'), icono: Navigation, onSelect: () => router.push(RUTAS_LOGISTICA.porDespachar) },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        icono={Navigation}
        subtitulo={t('subtitulo')}
        migas={[{ etiqueta: t('migas.logistica'), href: RUTAS_LOGISTICA.porDespachar }, { etiqueta: t('titulo') }]}
        debajo={<BranchBadgeActiva tamano="sm" />}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })} onClick={recargar} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <button type="button" className={clasesBoton({ variante: 'primario' })} disabled title={t('motivos.conector')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('consultarProveedores')}
            </button>
            <AtajoConfigurar seccion={SECCION_CONFIGURACION_LOGISTICA} ancla="sin-movimiento" soloIcono />
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('titulo')} acciones={menuCabecera} />
          </>
        }
        movil={{ subtitulo: t('subtituloMovil', { n: entero(conteos.todo) }), accion: <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('titulo')} acciones={menuCabecera} /> }}
      />
      <p className="sr-only">{t('motivos.conector')}</p>

      <KpiStrip etiqueta={t('kpis.etiqueta')}>
        <StatCard
          etiqueta={t('kpis.novedades')}
          cargando={cargando && filas.length === 0}
          valor={entero(conteos.novedades)}
          tono={conteos.vencenHoy > 0 ? 'peligro' : 'neutro'}
          tendencia={conteos.vencenHoy > 0 ? 'baja' : undefined}
          detalle={conteos.vencenHoy > 0 ? t('kpis.vencenHoy', { count: conteos.vencenHoy }) : t('kpis.sinVencer')}
          onClick={() => l.setFiltro('chip', 'novedades')}
        />
        <StatCard
          etiqueta={t('kpis.sinMovimientoTitulo')}
          cargando={cargando && filas.length === 0}
          valor={entero(conteos.sinMovimiento)}
          tono={conteos.sinMovimiento > 0 ? 'advertencia' : 'neutro'}
          detalle={
            conteos.sinMovimientoTransportadora > 0
              ? t('kpis.conTransportadora', { count: conteos.sinMovimientoTransportadora })
              : t('kpis.sinMovimientoUmbral', { propio: ajustes.horasSinMovimientoPropio, transportadora: ajustes.horasSinMovimientoTransportadora })
          }
          onClick={() => l.setFiltro('chip', 'sin_movimiento')}
        />
        <StatCard
          etiqueta={t('kpis.primerIntento')}
          cargando={cargando && filas.length === 0}
          valor={tasa === null ? '—' : pct(tasa)}
          tono={tasa === null ? 'neutro' : tasa >= META_PRIMER_INTENTO ? 'exito' : 'advertencia'}
          tendencia={tasa === null ? undefined : tasa >= META_PRIMER_INTENTO ? 'sube' : 'baja'}
          detalle={t('kpis.meta', { meta: pct(META_PRIMER_INTENTO) })}
        />
        <StatCard
          etiqueta={t('kpis.avisosHoy')}
          cargando={cargando && filas.length === 0}
          valor={avisos ? entero(avisos.total) : '—'}
          tono={avisos && avisos.fallidosWhatsApp > 0 ? 'advertencia' : 'neutro'}
          detalle={avisos && avisos.fallidosWhatsApp > 0 ? t('kpis.fallaronWhatsApp', { count: avisos.fallidosWhatsApp }) : t('kpis.avisosDetalle')}
        />
      </KpiStrip>

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        filtros={
          <FilterPanel conteo={chips.length} onLimpiar={l.limpiarFiltros} textoVerResultados={t('filtros.verN', { count: visibles.length })}>
            <FormField etiqueta={t('filtros.proveedor')}>
              {(cp) => (
                <Select value={propio ?? 'todos'} onValueChange={(v) => l.setFiltro('propio', v === 'todos' ? null : v)}>
                  <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('filtros.todos')}</SelectItem>
                    <SelectItem value="propio">{t('filtros.propio')}</SelectItem>
                    <SelectItem value="transportadora">{t('filtros.transportadora')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={() => l.setFiltro('propio', null)} textoLimpiarTodo={t('filtros.limpiar')} />}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChipsOpcion<ChipSeguimiento>
          etiqueta={t('chips.etiqueta')}
          valor={chip}
          onValorChange={(v) => l.setFiltro('chip', v === 'todo' ? null : v)}
          opciones={[
            { valor: 'todo', etiqueta: t('chips.todo', { n: entero(conteos.todo) }) },
            { valor: 'novedades', etiqueta: t('chips.novedades', { n: entero(conteos.novedades) }) },
            { valor: 'sin_movimiento', etiqueta: t('chips.sinMovimiento', { n: entero(conteos.sinMovimiento) }) },
          ]}
        />
        <p className="hidden text-sm text-fg-muted sm:block">{t('orden')}</p>
      </div>

      <DataTable
        etiqueta={t('tabla')}
        columnas={columnas}
        filas={pagina}
        obtenerId={(f) => f.id}
        estado={estadoTabla}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        onFilaClick={abrir}
        etiquetaFila={(f) => f.numero}
        acciones={accionesDe}
        accionesRapidas={accionRapida}
        tonoFila={(f) => (new Date(plazoDe(f, ahora, ajustes)).getTime() <= ahora.getTime() ? 'peligro' : undefined)}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            titulo={f.numero}
            subtitulo={f.transportadora ? [f.transportadora, t('guia', { guia: f.guia ?? '—' })].join(' · ') : [t('domiciliarioPropio'), f.sede].filter(Boolean).join(' · ')}
            insignia={quePaso(f)}
            meta={plazoCelda(f)}
            datos={[{ icono: MapPin, etiqueta: t('columnas.destino'), texto: [f.direccion, f.ciudad].filter(Boolean).join(' · ') || '—' }]}
            acciones={accionesDe(f)}
            onClick={() => abrir(f)}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
          />
        )}
        vacio={{ icono: Navigation, titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('errorCarga') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        onLimpiarFiltros={l.limpiarTodo}
        onReintentar={recargar}
        termino={l.busqueda}
        pie={
          <Pagination
            pagina={l.pagina}
            tamano={l.tamano}
            total={visibles.length}
            onPaginaChange={l.setPagina}
            onTamanoChange={l.setTamano}
            opcionesTamano={TAMANOS}
            sustantivo={sustantivo}
            cargando={cargando}
          />
        }
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={visibles.length}
        sustantivo={sustantivo}
        onSeleccionarTodos={() => setSeleccion(new Set(visibles.map((f) => f.id)))}
        onLimpiar={() => setSeleccion(new Set())}
        acciones={[
          {
            id: 'proveedor',
            etiqueta: t('acciones.consultar_proveedor'),
            icono: Search,
            onClick: () => undefined,
            deshabilitada: true,
            motivo: proveedoresSeleccionados > 0 ? t('motivos.conector') : t('motivos.propio'),
          },
          { id: 'avisar', etiqueta: t('masivo.avisar'), icono: Bell, onClick: () => void avisar(seleccionadas), cargando: ocupado === 'avisar', deshabilitada: ocupado !== null },
        ]}
        accionesSecundarias={[
          {
            id: 'reintentar',
            etiqueta: t('acciones.reintentar'),
            icono: RefreshCw,
            onSelect: () => void reintentar(seleccionadas),
            deshabilitada: ocupado !== null || !seleccionadas.some((f) => transicionValida(f.status, 'out_for_delivery')),
            motivo: t('motivos.noReintentable'),
          },
        ]}
      />

      <ConfirmDialog
        abierto={aDevolver !== null}
        onAbiertoChange={(v) => !v && ocupado === null && setADevolver(null)}
        titulo={t('devolver.titulo', { numero: aDevolver?.numero ?? '' })}
        descripcion={t('devolver.descripcion')}
        textoConfirmar={t('devolver.confirmar')}
        textoCancelar={t('devolver.volver')}
        tono="peligro"
        icono={RotateCcw}
        cargando={ocupado === 'devolver'}
        onConfirmar={() => {
          if (aDevolver) void devolver(aDevolver);
        }}
      />
    </div>
  );
}
