'use client';

/**
 * Logística › Por despachar (`/app/logistica/por-despachar`). Figma «21 Logística»: listo con
 * barra masiva 2794:3311, sin domiciliarios 2795:4513, vacío 2795:5367.
 *
 * La bandeja única de salida: todos los envíos sin despachar de todos los canales, con KPI,
 * buscador + Filtros, tabla, «⋯» por fila y la barra masiva flotante del kit. Lee con
 * `listarPorDespachar` (RLS por pertenencia); escribe SOLO por las RPC de
 * `deliveryIntegrationService` (asignar, cambiar estado). «Pedir repartidor» y «Crear guía»
 * se muestran deshabilitados con su motivo (Fase 3 y Fase 2).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Ban,
  Eye,
  FileText,
  Globe,
  PackageCheck,
  Printer,
  QrCode,
  RefreshCw,
  Send,
  ShoppingCart,
  Smartphone,
  Store,
  Truck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  BranchBadgeActiva,
  BulkActionBar,
  DataTable,
  EmptyState,
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
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { deliveryIntegrationService, EnvioError } from '@/lib/services/deliveryIntegrationService';
import { contarDomiciliariosActivos, listarPorDespachar } from '@/lib/services/logistica/despachoService';
import {
  CANALES_ENVIO,
  FILTROS_PAGO,
  accionesFilaDespacho,
  avisoBandeja,
  diaPromesa,
  estadoBandeja,
  esCanalEnvio,
  filtrarDespacho,
  kpisDespacho,
  ordenarDespacho,
  promesaDe,
  resumenSeleccion,
  type CanalEnvio,
  type EstadoBandeja,
  type FilaDespacho,
  type FiltroPago,
} from '@/lib/logistica/despacho';
import { RUTAS_LOGISTICA, SECCION_CONFIGURACION_LOGISTICA, rutaEnvio } from '@/lib/logistica/rutas';
import { AtajoConfigurar } from '@/components/configuracion/AtajoConfigurar';
import { HojaAsignarDomiciliario } from '../asignar/HojaAsignarDomiciliario';
import { useImpresionLogistica } from '../useImpresionLogistica';

const TAMANOS = [25, 50, 100] as const;
const ESTADOS_BANDEJA: readonly EstadoBandeja[] = ['por_asignar', 'asignado', 'listo_para_salir', 'intento_fallido', 'por_crear_guia'];

const ICONO_CANAL: Record<CanalEnvio, LucideIcon> = {
  web: Globe,
  pos: ShoppingCart,
  qr: QrCode,
  manual: FileText,
  marketplace: Smartphone,
};

const TONO_BANDEJA: Record<EstadoBandeja, 'neutro' | 'marca' | 'informacion' | 'peligro'> = {
  por_asignar: 'neutro',
  asignado: 'marca',
  listo_para_salir: 'informacion',
  por_crear_guia: 'neutro',
  intento_fallido: 'peligro',
};

export function PorDespacharPage() {
  const t = useTranslations('logistica.despacho');
  const tEnvio = useTranslations('logistica.envio');
  const router = useRouter();
  const entero = useFormatoEntero();
  const moneda = useMonedaOrganizacion();
  const { branches, branchFilter } = useBranch();
  const { timezone, formatTime, formatPlain, getToday } = useFormatDate();
  const { imprimirGuias, imprimirHojaRuta } = useImpresionLogistica();
  const organizationId = getOrganizationId();

  const l = useListadoServidor({ filtros: ['estado', 'pago', 'canal', 'atrasados'], tamanoPorDefecto: 25, tamanosPermitidos: TAMANOS });

  const [filas, setFilas] = useState<FilaDespacho[]>([]);
  const [recortada, setRecortada] = useState(false);
  const [domiciliarios, setDomiciliarios] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<'sin_permiso' | 'error' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [ahora, setAhora] = useState(() => new Date());
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [asignar, setAsignar] = useState<FilaDespacho[] | null>(null);
  const [aCancelar, setACancelar] = useState<FilaDespacho | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    setCargando(true);
    setError(null);
    Promise.all([
      listarPorDespachar(supabase, { organizationId, branchId: branchFilter }),
      contarDomiciliariosActivos(supabase, organizationId, branchFilter).catch(() => null),
    ])
      .then(([r, n]) => {
        if (cancelado) return;
        setFilas(r.filas);
        setRecortada(r.recortada);
        setDomiciliarios(n);
        setAhora(new Date());
      })
      .catch((e: { code?: string }) => !cancelado && setError(e?.code === '42501' ? 'sin_permiso' : 'error'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [organizationId, branchFilter, recarga]);

  // La promesa corre: el «+18 min» se refresca cada minuto sin volver a leer la base.
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const filtros = {
    busqueda: l.busqueda,
    estado: (ESTADOS_BANDEJA as readonly string[]).includes(l.filtros.estado ?? '') ? (l.filtros.estado as EstadoBandeja) : null,
    pago: (FILTROS_PAGO as readonly string[]).includes(l.filtros.pago ?? '') ? (l.filtros.pago as FiltroPago) : null,
    canal: esCanalEnvio(l.filtros.canal) ? l.filtros.canal : null,
    soloAtrasados: l.filtros.atrasados === '1',
  };
  const claveFiltros = JSON.stringify(filtros);
  const visibles = useMemo(
    () => ordenarDespacho(filtrarDespacho(filas, filtros, ahora)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, claveFiltros, ahora],
  );
  const pagina = useMemo(() => visibles.slice((l.pagina - 1) * l.tamano, l.pagina * l.tamano), [visibles, l.pagina, l.tamano]);
  const kpis = useMemo(() => kpisDespacho(filas, ahora, timezone), [filas, ahora, timezone]);
  const aviso = avisoBandeja(kpis, domiciliarios);
  const porId = useMemo(() => new Map(filas.map((f) => [f.id, f])), [filas]);
  const seleccionadas = useMemo(() => Array.from(seleccion, (id) => porId.get(id)).filter((f): f is FilaDespacho => !!f), [seleccion, porId]);
  const resumen = resumenSeleccion(seleccionadas);

  useEffect(() => setSeleccion(new Set()), [claveFiltros, branchFilter]);

  const sede = branchFilter ? branches.find((b) => b.id === branchFilter)?.name ?? null : null;
  const hoy = getToday();
  const fmt = (f: Pick<FilaDespacho, 'moneda'>, v: number) => (f.moneda && f.moneda !== moneda.code ? new Intl.NumberFormat(moneda.locale, { style: 'currency', currency: f.moneda }).format(v) : moneda.formatear(v));

  // ── Acciones ───────────────────────────────────────────────────────────────
  const abrir = (f: FilaDespacho) => router.push(rutaEnvio(f.id));

  /** «Asignar domiciliario» de la cabecera: la selección o, sin selección, lo por asignar de hoy. */
  const lotePorDefecto = useMemo(
    () => ordenarDespacho(filas.filter((f) => estadoBandeja(f) === 'por_asignar' && accionesFilaDespacho(f).asignar.disponible && diaPromesa(f, timezone) <= hoy)),
    [filas, timezone, hoy],
  );
  const abrirAsignar = (lista: readonly FilaDespacho[]) => {
    const asignables = resumenSeleccion(lista).asignables;
    if (asignables.length === 0) {
      toastError(t('toast.nadaAsignable'));
      return;
    }
    setAsignar([...lista]);
  };

  const marcarListos = async (lista: readonly FilaDespacho[]) => {
    const aptos = lista.filter((f) => accionesFilaDespacho(f).listoParaSalir.disponible);
    if (aptos.length === 0) return;
    setOcupado('listos');
    let ok = 0;
    let primerError: string | null = null;
    for (const f of aptos) {
      try {
        await deliveryIntegrationService.changeStatus(f.id, 'ready_for_pickup');
        ok += 1;
      } catch (e) {
        primerError ??= e instanceof EnvioError ? e.codigo : 'ERROR';
      }
    }
    setOcupado(null);
    if (ok > 0) toastSuccess(t('toast.listos', { count: ok }));
    if (primerError) toastError(t('toast.errorEstado'), tEnvio.has(`errores.${primerError}`) ? tEnvio(`errores.${primerError}`) : undefined);
    setSeleccion(new Set());
    recargar();
  };

  const cancelar = async (f: FilaDespacho) => {
    setOcupado('cancelar');
    try {
      await deliveryIntegrationService.changeStatus(f.id, 'cancelled', { nota: t('cancelar.nota') });
      toastSuccess(t('toast.cancelado', { numero: f.numero }));
      setACancelar(null);
      recargar();
    } catch (e) {
      const codigo = e instanceof EnvioError ? e.codigo : 'ERROR';
      toastError(t('toast.errorEstado'), tEnvio.has(`errores.${codigo}`) ? tEnvio(`errores.${codigo}`) : undefined);
    } finally {
      setOcupado(null);
    }
  };

  const motivo = (m?: string) => (m ? t(`motivos.${m}`) : undefined);

  const accionesDe = (f: FilaDespacho): AccionFila[] => {
    const a = accionesFilaDespacho(f);
    return [
      { id: 'detalle', etiqueta: t('acciones.verDetalle'), icono: Eye, onSelect: () => abrir(f) },
      {
        id: 'asignar',
        etiqueta: f.domiciliarioId ? t('acciones.cambiarDomiciliario') : t('acciones.asignar'),
        icono: UserPlus,
        onSelect: () => abrirAsignar([f]),
        deshabilitada: !a.asignar.disponible,
        motivo: motivo(a.asignar.motivo),
        separadorAntes: true,
      },
      {
        id: 'listo',
        etiqueta: t('acciones.listoParaSalir'),
        icono: PackageCheck,
        onSelect: () => void marcarListos([f]),
        oculta: a.listoParaSalir.motivo === 'ya_listo',
        deshabilitada: !a.listoParaSalir.disponible,
        motivo: motivo(a.listoParaSalir.motivo),
      },
      { id: 'guia', etiqueta: t('acciones.imprimirGuia'), icono: Printer, onSelect: () => void imprimirGuias([f]) },
      { id: 'repartidor', etiqueta: t('acciones.pedirRepartidor'), icono: Send, onSelect: () => undefined, deshabilitada: true, motivo: motivo(a.pedirRepartidor.motivo) },
      { id: 'crearGuia', etiqueta: t('acciones.crearGuia'), icono: FileText, onSelect: () => undefined, deshabilitada: true, motivo: motivo(a.crearGuia.motivo) },
      { id: 'cancelar', etiqueta: t('acciones.cancelar'), icono: Ban, destructiva: true, separadorAntes: true, onSelect: () => setACancelar(f), oculta: !a.cancelar.disponible },
    ];
  };

  // ── Celdas ─────────────────────────────────────────────────────────────────
  const promesaCelda = (f: FilaDespacho) => {
    const p = promesaDe(f, ahora);
    const dia = diaPromesa(f, timezone);
    const cuando = f.promesa
      ? dia === hoy
        ? t('promesa.hoy', { hora: formatTime(f.promesa) })
        : t('promesa.otroDia', { dia: formatPlain(dia), hora: formatTime(f.promesa) })
      : f.fechaEsperada
        ? formatPlain(f.fechaEsperada)
        : t('promesa.sin');
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="text-fg">{cuando}</span>
        {p && (
          <StatusBadge
            estado={p.tipo}
            tono={p.tipo === 'tarde' ? 'peligro' : p.tipo === 'pronto' ? 'advertencia' : 'neutro'}
            etiqueta={
              p.tipo === 'tarde'
                ? t('promesa.tarde', { tiempo: duracion(p.minutos) })
                : p.tipo === 'pronto'
                  ? t('promesa.faltan', { tiempo: duracion(p.minutos) })
                  : t('promesa.en', { tiempo: duracion(p.minutos) })
            }
          />
        )}
      </div>
    );
  };
  const duracion = (minutos: number) =>
    minutos < 60 ? t('duracion.min', { n: minutos }) : minutos < 48 * 60 ? t('duracion.h', { n: Math.round(minutos / 60) }) : t('duracion.dias', { n: Math.round(minutos / 1440) });

  const pagoCelda = (f: FilaDespacho) =>
    f.contraentrega > 0 ? (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge estado="cod" tono="advertencia" apariencia="contorno" etiqueta={t('pago.contraentrega')} />
        <span className="text-xs text-warning-text tabular-nums">{fmt(f, f.contraentrega)}</span>
      </div>
    ) : (
      <StatusBadge estado="paid" etiqueta={t('pago.pagado')} />
    );

  const modoCelda = (f: FilaDespacho) => (
    <StatusBadge
      estado={String(f.modo)}
      tono={f.modo === 'own' ? 'marca' : f.modo === 'last_mile' ? 'informacion' : 'neutro'}
      apariencia="contorno"
      etiqueta={t.has(`modos.${f.modo}`) ? t(`modos.${f.modo}`) : String(f.modo)}
    />
  );

  const estadoCelda = (f: FilaDespacho) => {
    const e = estadoBandeja(f);
    const sub =
      e === 'intento_fallido' && f.motivoNovedad
        ? tEnvio.has(`motivos.${f.motivoNovedad}`)
          ? tEnvio(`motivos.${f.motivoNovedad}`)
          : f.motivoNovedad
        : f.domiciliario;
    return (
      <div className="flex min-w-0 flex-col items-start gap-1">
        <StatusBadge estado={e} tono={TONO_BANDEJA[e]} etiqueta={t(`estados.${e}`)} />
        {sub && <span className="max-w-[160px] truncate text-xs text-fg-muted">{sub}</span>}
      </div>
    );
  };

  const columnas: ColumnaTabla<FilaDespacho>[] = [
    {
      id: 'pedido',
      encabezado: t('columnas.pedido'),
      celda: (f) => {
        const Icono = ICONO_CANAL[f.canal];
        return (
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 font-medium text-fg">
              <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
              <span className="truncate">{f.pedido ?? f.numero}</span>
            </span>
            <span className="truncate text-xs text-fg-muted">{[t(`canales.${f.canal}`), formatTime(f.creado)].join(' · ')}</span>
          </div>
        );
      },
    },
    {
      id: 'cliente',
      encabezado: t('columnas.cliente'),
      ocultarDebajo: 'md',
      celda: (f) => (
        <div className="flex min-w-0 max-w-[180px] flex-col">
          <span className="truncate text-fg">{f.cliente ?? '—'}</span>
          {f.telefono && <span className="truncate text-xs text-fg-muted">{f.telefono}</span>}
        </div>
      ),
    },
    {
      id: 'direccion',
      encabezado: t('columnas.direccion'),
      ocultarDebajo: 'lg',
      celda: (f) => (
        <div className="flex min-w-0 max-w-[200px] flex-col">
          <span className="truncate text-fg">{f.direccion ?? '—'}</span>
          <span className="truncate text-xs text-fg-muted">{[f.barrio, f.ciudad].filter(Boolean).join(' · ')}</span>
        </div>
      ),
    },
    { id: 'promesa', encabezado: t('columnas.promesa'), celda: promesaCelda },
    { id: 'valor', encabezado: t('columnas.valor'), variante: 'importe', ocultarDebajo: 'md', celda: (f) => fmt(f, f.valor) },
    { id: 'pago', encabezado: t('columnas.pago'), ocultarDebajo: 'md', celda: pagoCelda },
    { id: 'modo', encabezado: t('columnas.modo'), ocultarDebajo: 'xl', celda: modoCelda },
    { id: 'estado', encabezado: t('columnas.estado'), celda: estadoCelda },
  ];

  // ── Filtros ────────────────────────────────────────────────────────────────
  const chips: ChipFiltro[] = [
    ...(filtros.estado ? [{ clave: 'estado', etiqueta: t('filtros.chipEstado', { estado: t(`estados.${filtros.estado}`) }) }] : []),
    ...(filtros.pago ? [{ clave: 'pago', etiqueta: t(`filtros.pago_${filtros.pago}`) }] : []),
    ...(filtros.canal ? [{ clave: 'canal', etiqueta: t('filtros.chipCanal', { canal: t(`canales.${filtros.canal}`) }) }] : []),
    ...(filtros.soloAtrasados ? [{ clave: 'atrasados', etiqueta: t('filtros.soloAtrasados') }] : []),
  ];
  const hayCriterios = !!(l.busqueda || chips.length);
  const sinNada = !cargando && !error && filas.length === 0;
  const estadoTabla = error === 'sin_permiso' ? 'sinPermiso' : cargando && filas.length === 0 ? 'cargando' : error ? 'error' : visibles.length === 0 ? (hayCriterios ? 'sinResultados' : 'vacio') : 'listo';
  const sustantivo = { singular: t('sustantivo.singular'), plural: t('sustantivo.plural'), genero: 'masculino' as const };

  const selectFiltro = (clave: 'estado' | 'pago' | 'canal', opciones: readonly string[], etiqueta: (v: string) => string) => (
    <FormField etiqueta={t(`filtros.${clave}`)}>
      {(cp) => (
        <Select value={l.filtros[clave] ?? 'todos'} onValueChange={(v) => l.setFiltro(clave, v === 'todos' ? null : v)}>
          <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className="h-10 border-line-strong bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">{t('filtros.todos')}</SelectItem>
            {opciones.map((o) => (
              <SelectItem key={o} value={o}>
                {etiqueta(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );

  const menuCabecera: AccionFila[] = [
    { id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: recargar },
    { id: 'seguimiento', etiqueta: t('vacio.verEnCamino'), icono: Truck, onSelect: () => router.push(RUTAS_LOGISTICA.seguimiento) },
    { id: 'domiciliarios', etiqueta: t('irDomiciliarios'), icono: Users, onSelect: () => router.push(RUTAS_LOGISTICA.domiciliarios) },
    { id: 'zonas', etiqueta: t('irZonas'), icono: Store, onSelect: () => router.push(RUTAS_LOGISTICA.zonas) },
  ];

  const loteHoja = seleccionadas.length > 0 ? seleccionadas : lotePorDefecto;
  const sinDomiciliarios = aviso === 'sin_domiciliarios';

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        icono={Truck}
        subtitulo={sede ? t('subtituloSede', { sede }) : t('subtitulo')}
        migas={[{ etiqueta: t('migas.logistica'), href: RUTAS_LOGISTICA.porDespachar }, { etiqueta: t('titulo') }]}
        debajo={<BranchBadgeActiva tamano="sm" />}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })} onClick={recargar} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario' })}
              onClick={() => imprimirHojaRuta(ordenarDespacho(seleccionadas.length > 0 ? seleccionadas : filas.filter((f) => estadoBandeja(f) === 'asignado' || estadoBandeja(f) === 'listo_para_salir')))}
              disabled={filas.length === 0}
              title={filas.length === 0 ? t('motivos.sin_seleccion') : undefined}
            >
              <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('imprimirHojaRuta')}
            </button>
            {sinDomiciliarios ? (
              <Link href={`${RUTAS_LOGISTICA.domiciliarios}?nuevo=1`} className={clasesBoton({ variante: 'primario' })}>
                <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('registrarDomiciliario')}
              </Link>
            ) : (
              <button
                type="button"
                className={clasesBoton({ variante: 'primario' })}
                onClick={() => abrirAsignar(loteHoja)}
                disabled={loteHoja.length === 0}
                title={loteHoja.length === 0 ? t('motivos.nada_por_asignar') : undefined}
              >
                <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('asignarDomiciliario')}
              </button>
            )}
            <AtajoConfigurar seccion={SECCION_CONFIGURACION_LOGISTICA} soloIcono />
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('titulo')} acciones={menuCabecera} />
          </>
        }
        movil={{ accion: <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('titulo')} acciones={menuCabecera} /> }}
      />

      <KpiStrip etiqueta={t('kpis.etiqueta')}>
        <StatCard
          etiqueta={t('kpis.porDespachar')}
          cargando={cargando && filas.length === 0}
          valor={entero(kpis.porDespachar)}
          detalle={kpis.porDespachar > 0 ? t('kpis.porDespacharDetalle', { hoy: entero(kpis.paraHoy), manana: entero(kpis.paraManana) }) : t('kpis.porDespacharVacio')}
        />
        <StatCard
          etiqueta={t('kpis.atrasados')}
          cargando={cargando && filas.length === 0}
          valor={entero(kpis.atrasados)}
          tono={kpis.atrasados > 0 ? 'peligro' : 'neutro'}
          tendencia={kpis.atrasados > 0 ? 'baja' : undefined}
          detalle={kpis.atrasados > 0 ? t('kpis.atrasadosDetalle') : t('kpis.atrasadosVacio')}
          onClick={kpis.atrasados > 0 ? () => l.setFiltro('atrasados', '1') : undefined}
        />
        <StatCard
          etiqueta={t('kpis.contraentrega')}
          cargando={cargando && filas.length === 0}
          valor={moneda.formatear(kpis.contraentregaHoy)}
          tono={kpis.enviosContraentregaHoy > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={kpis.enviosContraentregaHoy > 0 ? AlertTriangle : undefined}
          detalle={kpis.enviosContraentregaHoy > 0 ? t('kpis.contraentregaDetalle', { count: kpis.enviosContraentregaHoy }) : t('kpis.contraentregaVacio')}
          onClick={kpis.enviosContraentregaHoy > 0 ? () => l.setFiltro('pago', 'contraentrega') : undefined}
        />
        <StatCard
          etiqueta={t('kpis.sinDomiciliario')}
          cargando={cargando && filas.length === 0}
          valor={entero(kpis.sinDomiciliario)}
          tono={sinDomiciliarios ? 'peligro' : 'neutro'}
          detalle={
            sinDomiciliarios
              ? t('kpis.sinDomiciliariosRegistrados')
              : kpis.sinDomiciliario > 0
                ? t('kpis.sinDomiciliarioDetalle', { n: entero(kpis.sinDomiciliarioHoy), total: entero(kpis.saleHoy) })
                : t('kpis.sinDomiciliarioVacio')
          }
          onClick={kpis.sinDomiciliario > 0 ? () => l.setFiltro('estado', 'por_asignar') : undefined}
        />
      </KpiStrip>

      {sinDomiciliarios && (
        <AvisoTonal
          tono="advertencia"
          rol="alert"
          titulo={sede ? t('sinDomiciliarios.tituloSede', { sede }) : t('sinDomiciliarios.titulo')}
          descripcion={t('sinDomiciliarios.descripcion', { n: entero(kpis.sinDomiciliarioHoy) })}
          acciones={[
            { etiqueta: t('sinDomiciliarios.traerRrhh'), href: `${RUTAS_LOGISTICA.domiciliarios}?desde=rrhh` },
            { etiqueta: t('registrarDomiciliario'), href: `${RUTAS_LOGISTICA.domiciliarios}?nuevo=1` },
          ]}
        />
      )}
      {recortada && <AvisoTonal tono="informacion" compacto titulo={t('recortada', { n: entero(filas.length) })} />}

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        filtros={
          <FilterPanel conteo={chips.length} onLimpiar={l.limpiarFiltros} textoVerResultados={t('filtros.verN', { count: visibles.length })}>
            {selectFiltro('estado', ESTADOS_BANDEJA, (v) => t(`estados.${v}`))}
            {selectFiltro('pago', FILTROS_PAGO, (v) => t(`filtros.pago_${v}`))}
            {selectFiltro('canal', CANALES_ENVIO, (v) => t(`canales.${v}`))}
            <label className="flex items-center gap-3 text-sm text-fg">
              <Checkbox checked={filtros.soloAtrasados} onCheckedChange={(v) => l.setFiltro('atrasados', v === true ? '1' : null)} />
              {t('filtros.soloAtrasados')}
            </label>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} textoLimpiarTodo={t('filtros.limpiar')} />}
      />

      {sinNada ? (
        <EmptyState
          icono={PackageCheck}
          titulo={t('vacio.titulo')}
          descripcion={sede ? t('vacio.descripcionSede', { sede }) : t('vacio.descripcion')}
          accion={{ etiqueta: t('vacio.verCuadres'), href: RUTAS_LOGISTICA.cuadres }}
          accionSecundaria={{ etiqueta: t('vacio.verEnCamino'), href: RUTAS_LOGISTICA.seguimiento }}
        />
      ) : (
        <DataTable
          etiqueta={t('tabla')}
          columnas={columnas}
          filas={pagina}
          obtenerId={(f) => f.id}
          estado={estadoTabla}
          seleccion={seleccion}
          onSeleccionChange={setSeleccion}
          onFilaClick={abrir}
          etiquetaFila={(f) => f.pedido ?? f.numero}
          acciones={accionesDe}
          tonoFila={(f) => (promesaDe(f, ahora)?.tipo === 'tarde' ? 'peligro' : estadoBandeja(f) === 'intento_fallido' ? 'advertencia' : undefined)}
          tarjetaMovil={(f, ctx) => (
            <ListCard
              icono={ICONO_CANAL[f.canal]}
              titulo={f.pedido ?? f.numero}
              subtitulo={[f.cliente, f.barrio].filter(Boolean).join(' · ')}
              meta={promesaCelda(f)}
              valor={f.contraentrega > 0 ? fmt(f, f.contraentrega) : fmt(f, f.valor)}
              estado={estadoCelda(f)}
              acciones={accionesDe(f)}
              onClick={() => abrir(f)}
              seleccionable={ctx.modoSeleccion}
              seleccionado={ctx.seleccionado}
              onSeleccionChange={ctx.alternar}
            />
          )}
          vacio={{ icono: PackageCheck, titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
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
      )}

      <BulkActionBar
        seleccionados={seleccion.size}
        total={visibles.length}
        sustantivo={sustantivo}
        onSeleccionarTodos={() => setSeleccion(new Set(visibles.map((f) => f.id)))}
        onLimpiar={() => setSeleccion(new Set())}
        acciones={[
          {
            id: 'asignar',
            etiqueta: t('asignarDomiciliario'),
            icono: UserPlus,
            onClick: () => abrirAsignar(seleccionadas),
            deshabilitada: resumen.asignables.length === 0,
            motivo: t('motivos.estado_no_asignable'),
          },
          { id: 'guias', etiqueta: t('masivo.imprimirGuias'), icono: Printer, onClick: () => void imprimirGuias(seleccionadas) },
        ]}
        accionesSecundarias={[
          { id: 'hoja', etiqueta: t('imprimirHojaRuta'), icono: FileText, onSelect: () => imprimirHojaRuta(ordenarDespacho(seleccionadas)) },
          {
            id: 'listos',
            etiqueta: t('masivo.listos'),
            icono: PackageCheck,
            onSelect: () => void marcarListos(seleccionadas),
            deshabilitada: ocupado !== null || !seleccionadas.some((f) => accionesFilaDespacho(f).listoParaSalir.disponible),
            motivo: t('motivos.estado_no_asignable'),
          },
          { id: 'repartidor', etiqueta: t('acciones.pedirRepartidor'), icono: Send, onSelect: () => undefined, deshabilitada: true, motivo: t('motivos.requiere_tercero') },
          { id: 'crearGuia', etiqueta: t('acciones.crearGuia'), icono: FileText, onSelect: () => undefined, deshabilitada: true, motivo: t('motivos.requiere_transportadora') },
        ]}
      />

      {asignar && (
        <HojaAsignarDomiciliario
          abierto
          onAbiertoChange={(v) => !v && setAsignar(null)}
          organizationId={organizationId}
          envios={asignar}
          sede={sede}
          onImprimirGuias={(lista, dom) => void imprimirGuias(lista, dom)}
          onAsignado={() => {
            setSeleccion(new Set());
            recargar();
          }}
        />
      )}

      <ConfirmDialog
        abierto={aCancelar !== null}
        onAbiertoChange={(v) => !v && ocupado === null && setACancelar(null)}
        titulo={t('cancelar.titulo', { numero: aCancelar?.pedido ?? aCancelar?.numero ?? '' })}
        descripcion={t('cancelar.descripcion')}
        textoConfirmar={t('cancelar.confirmar')}
        textoCancelar={t('cancelar.volver')}
        tono="peligro"
        icono={Ban}
        cargando={ocupado === 'cancelar'}
        onConfirmar={() => {
          if (aCancelar) void cancelar(aCancelar);
        }}
      />
    </div>
  );
}
