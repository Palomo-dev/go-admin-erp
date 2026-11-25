'use client';

/**
 * Logística › Envíos (`/app/logistica/envios`). Figma «21 Logística», sección 11: lista 2959:8043
 * con el menú ⋯ de la fila 2961:8643 y el panel «Filtros» 2961:8706; vacío 2966:10364 y celular
 * 2966:9806 (sección 12).
 *
 * El historial completo de envíos de todos los canales (también entregados y cancelados), con la
 * misma estructura aprobada de «Por despachar»: 4 KPI, pestañas con conteo, buscador + Filtros,
 * tabla, ⋯ por fila y barra masiva. Lee con `listarEnvios` (RLS por pertenencia; valor y pago del
 * PEDIDO, por lote). Las acciones de cada fila salen de la tabla canónica de estados
 * (`accionesFilaEnvio`) y escriben SOLO por las RPC de `deliveryIntegrationService`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Ban,
  Copy,
  CreditCard,
  Download,
  Eye,
  FileText,
  Globe,
  MapPin,
  MessageSquare,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Smartphone,
  Truck,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import {
  BranchBadgeActiva,
  BulkActionBar,
  DataTable,
  DateRangeButton,
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
  TabBar,
  clasesBoton,
  etiquetaRango,
  idPanel,
  idPestana,
  inicioDeMes,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { AtajoConfigurar } from '@/components/configuracion/AtajoConfigurar';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId, useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { addPlainDays, startOfDayInstant, toPlainDate } from '@/lib/utils/dateCore';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { shipmentsService } from '@/lib/services/shipmentsService';
import { listarEnvios, opcionesEnvios, type OpcionesEnvios } from '@/lib/services/logistica/enviosService';
import { CANALES_ENVIO, type CanalEnvio } from '@/lib/logistica/despacho';
import {
  COBROS_ENVIO,
  PESTANAS_ENVIOS,
  QUIEN_SIN_ASIGNAR,
  accionesFilaEnvio,
  cobroDeEnvio,
  contarPestanas,
  esPestanaEnvios,
  estadosCambioDisponibles,
  filtrarEnvios,
  kpisEnvios,
  ordenarEnvios,
  pestanaDeEnvio,
  type CobroEnvio,
  type FilaEnvio,
  type PestanaEnvios,
} from '@/lib/logistica/envios';
import { canonicoDeEstado, ESTADOS_ASIGNABLES, esEstadoEnvio } from '@/lib/logistica/estadosEnvio';
import {
  RUTAS_LOGISTICA,
  RUTA_NUEVO_ENVIO,
  SECCION_CONFIGURACION_LOGISTICA,
  rutaDuplicarEnvio,
  rutaEditarEnvio,
  rutaEnvio,
} from '@/lib/logistica/rutas';
import { EstadoEnvioBadge } from '../EstadoEnvioBadge';
import { HojaAsignarDomiciliario } from '../asignar/HojaAsignarDomiciliario';
import { useImpresionLogistica } from '../useImpresionLogistica';
import { DialogoCambiarEstado, DialogoCancelar, DialogoDevolver, DialogoImprimirGuias } from './DialogosEnvios';

const TAMANOS = [25, 50, 100] as const;
const FILTROS = ['pestana', 'desde', 'hasta', 'canal', 'cobro', 'quien', 'transportadora', 'viaje', 'zona'] as const;

export const ICONO_CANAL_ENVIO: Record<CanalEnvio, LucideIcon> = {
  web: Globe,
  pos: ShoppingCart,
  qr: QrCode,
  manual: MessageSquare,
  marketplace: Smartphone,
};

const TONO_COBRO: Record<CobroEnvio, { tono: 'advertencia' | 'exito' | 'neutro'; apariencia: 'contorno' | 'suave' }> = {
  contraentrega: { tono: 'advertencia', apariencia: 'contorno' },
  pagado: { tono: 'exito', apariencia: 'contorno' },
  pendiente: { tono: 'advertencia', apariencia: 'suave' },
  sin_cobro: { tono: 'neutro', apariencia: 'suave' },
};

type Dialogo =
  | { tipo: 'estado' | 'devolver' | 'cancelar' | 'guias'; envios: FilaEnvio[] }
  | { tipo: 'asignar'; envios: FilaEnvio[] }
  | null;

const esFecha = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function EnviosPage() {
  const t = useTranslations('logistica.envios');
  const tEnvio = useTranslations('logistica.envio');
  const router = useRouter();
  const locale = useLocale();
  const entero = useFormatoEntero();
  const moneda = useMonedaOrganizacion();
  const { organization } = useOrganization();
  const { branches, branchFilter } = useBranch();
  const { timezone, formatTime, formatPlain, getToday } = useFormatDate();
  const { imprimirGuias } = useImpresionLogistica();
  const organizationId = getOrganizationId();
  const hoy = getToday();

  const l = useListadoServidor({ filtros: [...FILTROS], tamanoPorDefecto: 25, tamanosPermitidos: TAMANOS });

  const rango = useMemo(() => {
    const desde = esFecha(l.filtros.desde) ? l.filtros.desde : inicioDeMes(hoy);
    const hasta = esFecha(l.filtros.hasta) ? l.filtros.hasta : hoy;
    return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde };
  }, [l.filtros.desde, l.filtros.hasta, hoy]);

  const [filas, setFilas] = useState<FilaEnvio[]>([]);
  const [recortada, setRecortada] = useState(false);
  const [opciones, setOpciones] = useState<OpcionesEnvios | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<'sin_permiso' | 'error' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [ocupado, setOcupado] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    setCargando(true);
    setError(null);
    listarEnvios(supabase, {
      organizationId,
      branchId: branchFilter,
      desde: startOfDayInstant(rango.desde, timezone).toISOString(),
      hasta: startOfDayInstant(addPlainDays(rango.hasta, 1), timezone).toISOString(),
    })
      .then((r) => {
        if (cancelado) return;
        setFilas(r.filas);
        setRecortada(r.recortada);
      })
      .catch((e: { code?: string }) => !cancelado && setError(e?.code === '42501' ? 'sin_permiso' : 'error'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [organizationId, branchFilter, rango.desde, rango.hasta, timezone, recarga]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    opcionesEnvios(supabase, organizationId)
      .then((o) => !cancelado && setOpciones(o))
      .catch(() => !cancelado && setOpciones({ domiciliarios: [], transportadoras: [], viajes: [], zonas: [], paradas: [] }));
    return () => {
      cancelado = true;
    };
  }, [organizationId]);

  const pestana: PestanaEnvios = esPestanaEnvios(l.filtros.pestana) ? l.filtros.pestana : 'todos';
  const filtros = {
    busqueda: l.busqueda,
    canal: (CANALES_ENVIO as readonly string[]).includes(l.filtros.canal ?? '') ? l.filtros.canal : null,
    cobro: (COBROS_ENVIO as readonly string[]).includes(l.filtros.cobro ?? '') ? (l.filtros.cobro as CobroEnvio) : null,
    quien: l.filtros.quien || null,
    transportadora: l.filtros.transportadora || null,
    viaje: l.filtros.viaje || null,
    zona: l.filtros.zona || null,
  };
  const claveFiltros = JSON.stringify(filtros);
  const sinPestana = useMemo(
    () => ordenarEnvios(filtrarEnvios(filas, filtros)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, claveFiltros],
  );
  const conteos = useMemo(() => contarPestanas(sinPestana), [sinPestana]);
  const visibles = useMemo(() => (pestana === 'todos' ? sinPestana : sinPestana.filter((f) => pestanaDeEnvio(f) === pestana)), [sinPestana, pestana]);
  const pagina = useMemo(() => visibles.slice((l.pagina - 1) * l.tamano, l.pagina * l.tamano), [visibles, l.pagina, l.tamano]);
  const kpis = useMemo(() => kpisEnvios(filas, hoy, timezone), [filas, hoy, timezone]);
  const porId = useMemo(() => new Map(filas.map((f) => [f.id, f])), [filas]);
  const seleccionadas = useMemo(() => Array.from(seleccion, (id) => porId.get(id)).filter((f): f is FilaEnvio => !!f), [seleccion, porId]);

  useEffect(() => setSeleccion(new Set()), [claveFiltros, pestana, branchFilter, rango.desde, rango.hasta]);

  const sede = branchFilter ? branches.find((b) => b.id === branchFilter)?.name ?? null : null;
  const fmt = (f: Pick<FilaEnvio, 'moneda'>, v: number) => (f.moneda && f.moneda !== moneda.code ? new Intl.NumberFormat(moneda.locale, { style: 'currency', currency: f.moneda }).format(v) : moneda.formatear(v));
  const porcentaje = (v: number) => `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v)} %`;
  const peso = (kg: number) => t('peso', { kg: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(kg) });

  // ── Acciones ───────────────────────────────────────────────────────────────
  const abrir = (f: FilaEnvio) => router.push(rutaEnvio(f.id));
  const abrirDialogo = (tipo: 'estado' | 'devolver' | 'cancelar' | 'guias' | 'asignar', lista: readonly FilaEnvio[]) => {
    if (lista.length === 0) return;
    setDialogo({ tipo, envios: [...lista] } as Dialogo);
  };
  const terminar = () => {
    setSeleccion(new Set());
    recargar();
  };

  const marcarPagados = async (lista: readonly FilaEnvio[]) => {
    const aptos = lista.filter((f) => accionesFilaEnvio(f).marcarPagado);
    if (aptos.length === 0) return;
    setOcupado(true);
    try {
      const r = await shipmentsService.bulkMarkPaid(aptos.map((f) => f.id));
      if (r.succeeded > 0) toastSuccess(t('toast.pagados', { count: r.succeeded }));
      if (r.failed > 0) toastError(t('toast.errorPagados', { count: r.failed }));
    } finally {
      setOcupado(false);
      terminar();
    }
  };

  const etiquetaQuien = (f: FilaEnvio) => (f.transportadora ? [f.transportadora, f.guia].filter(Boolean).join(' · ') : f.domiciliario ?? '');
  const etiquetaCobro = (c: CobroEnvio) => t(`cobro.${c}`);

  const exportar = (lista: readonly FilaEnvio[]) => {
    if (lista.length === 0) return;
    const c = (k: string) => t(`exportar.columnas.${k}`);
    const csv = aCsv([
      ['envio', 'pedido', 'canal', 'destinatario', 'telefono', 'direccion', 'barrio', 'ciudad', 'quien', 'creado', 'promesa', 'entregado', 'valor', 'cobro', 'contraentrega', 'peso', 'estado', 'sede'].map(c),
      ...lista.map((f) => [
        f.numero,
        f.pedido,
        tEnvio(`canales.${f.canal}`),
        f.cliente,
        f.telefono,
        f.direccion,
        f.barrio,
        f.ciudad,
        etiquetaQuien(f),
        `${formatPlain(toPlainDate(new Date(f.creado), timezone))} ${formatTime(f.creado)}`,
        f.promesa ? `${formatPlain(toPlainDate(new Date(f.promesa), timezone))} ${formatTime(f.promesa)}` : f.fechaEsperada ? formatPlain(f.fechaEsperada) : '',
        f.entregado ? `${formatPlain(toPlainDate(new Date(f.entregado), timezone))} ${formatTime(f.entregado)}` : '',
        f.valor,
        etiquetaCobro(cobroDeEnvio(f)),
        f.contraentrega || '',
        f.pesoKg ?? '',
        tEnvio(`estados.${canonicoDeEstado(f.status) ?? 'created'}`),
        f.sede,
      ]),
    ]);
    descargarCsv(`${t('exportar.archivo')}-${rango.desde}-${rango.hasta}.csv`, csv);
  };

  const accionesDe = (f: FilaEnvio): AccionFila[] => {
    const a = accionesFilaEnvio(f);
    return [
      { id: 'detalle', etiqueta: t('acciones.verDetalle'), icono: Eye, onSelect: () => abrir(f) },
      { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => router.push(rutaEditarEnvio(f.id)), oculta: !a.editar },
      { id: 'guia', etiqueta: t('acciones.imprimirGuia'), icono: Printer, onSelect: () => abrirDialogo('guias', [f]) },
      { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => router.push(rutaDuplicarEnvio(f.id)) },
      {
        id: 'asignar',
        etiqueta: t('acciones.asignar'),
        icono: UserCheck,
        onSelect: () => abrirDialogo('asignar', [f]),
        oculta: !a.asignar,
        separadorAntes: true,
      },
      { id: 'estado', etiqueta: t('acciones.cambiarEstado'), icono: RefreshCw, onSelect: () => abrirDialogo('estado', [f]), oculta: !a.cambiarEstado, separadorAntes: !a.asignar },
      { id: 'pagado', etiqueta: t('acciones.marcarPagado'), icono: CreditCard, onSelect: () => void marcarPagados([f]), oculta: !a.marcarPagado },
      { id: 'devolver', etiqueta: t('acciones.devolver'), icono: Package, onSelect: () => abrirDialogo('devolver', [f]), oculta: !a.devolver },
      { id: 'cancelar', etiqueta: t('acciones.cancelar'), icono: Ban, destructiva: true, separadorAntes: true, onSelect: () => abrirDialogo('cancelar', [f]), oculta: !a.cancelar },
    ];
  };

  // ── Celdas ─────────────────────────────────────────────────────────────────
  const cuando = (instante: string) => {
    const dia = toPlainDate(new Date(instante), timezone);
    if (dia === hoy) return t('fecha.hoy', { hora: formatTime(instante) });
    if (dia === addPlainDays(hoy, -1)) return t('fecha.ayer', { hora: formatTime(instante) });
    return t('fecha.dia', { dia: formatPlain(dia), hora: formatTime(instante) });
  };
  const diaDe = (instante: string | null) => (instante ? formatPlain(toPlainDate(new Date(instante), timezone)) : '');

  const segundaFecha = (f: FilaEnvio): string | null => {
    switch (f.status) {
      case 'delivered':
        return f.entregado ? t('fecha.entregado', { cuando: toPlainDate(new Date(f.entregado), timezone) === hoy ? formatTime(f.entregado) : cuando(f.entregado) }) : null;
      case 'returned':
        return t('fecha.devuelto', { dia: diaDe(f.actualizado) });
      case 'cancelled':
        return t('fecha.anulado', { dia: diaDe(f.actualizado) });
      case 'failed_attempt':
        return f.fechaEsperada ? t('fecha.reintento', { dia: formatPlain(f.fechaEsperada) }) : f.promesa ? t('fecha.promesa', { cuando: formatTime(f.promesa) }) : null;
      default:
        if (f.promesa) return t('fecha.promesa', { cuando: toPlainDate(new Date(f.promesa), timezone) === hoy ? formatTime(f.promesa) : cuando(f.promesa) });
        if (f.fechaEsperada) return t('fecha.llega', { dia: formatPlain(f.fechaEsperada) });
        return null;
    }
  };

  const subEstado = (f: FilaEnvio): string | null => {
    switch (f.status) {
      case 'picked':
      case 'dispatched':
      case 'in_transit':
      case 'out_for_delivery':
        return f.salio ? t('sub.salio', { hora: formatTime(f.salio) }) : null;
      case 'delivered':
        return f.recibio ? (f.recibioConFoto ? t('sub.recibioFoto', { nombre: f.recibio }) : t('sub.recibio', { nombre: f.recibio })) : null;
      case 'failed_attempt':
      case 'failed': {
        const motivo = f.motivoNovedad ? (tEnvio.has(`motivos.${f.motivoNovedad}`) ? tEnvio(`motivos.${f.motivoNovedad}`) : f.motivoNovedad) : null;
        return [motivo, f.intentosFallidos > 0 ? t('sub.intento', { n: f.intentosFallidos }) : null].filter(Boolean).join(' · ') || null;
      }
      case 'returned':
        return t('sub.devuelto');
      case 'cancelled':
        return f.pedidoAnulado ? t('sub.pedidoAnulado') : null;
      default:
        return null;
    }
  };

  const estadoCelda = (f: FilaEnvio) => {
    const sub = subEstado(f);
    const novedad = pestanaDeEnvio(f) === 'con_novedad';
    return (
      <div className="flex min-w-0 flex-col items-start gap-1">
        <EstadoEnvioBadge estado={f.status} />
        {sub && <span className={`max-w-[140px] text-xs ${novedad ? 'text-danger-text' : 'text-fg-muted'}`}>{sub}</span>}
      </div>
    );
  };

  const cobroCelda = (f: FilaEnvio) => {
    const c = cobroDeEnvio(f);
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="font-medium tabular-nums text-fg">{fmt(f, f.valor)}</span>
        <StatusBadge estado={c} tono={TONO_COBRO[c].tono} apariencia={TONO_COBRO[c].apariencia} etiqueta={etiquetaCobro(c)} />
      </div>
    );
  };

  const quienCelda = (f: FilaEnvio) => {
    if (f.transportadora || f.guia) {
      return (
        <div className="flex min-w-0 max-w-[160px] flex-col">
          <span className="truncate text-fg">{f.transportadora ?? tEnvio(`modos.${f.modo}`)}</span>
          {f.guia && <span className="truncate text-xs text-fg-muted">{t('quien.guia', { guia: f.guia })}</span>}
        </div>
      );
    }
    if (f.domiciliario) {
      return (
        <div className="flex min-w-0 max-w-[160px] flex-col">
          <span className="truncate text-fg">{f.domiciliario}</span>
          <span className="truncate text-xs text-fg-muted">
            {f.vehiculoTipo && tEnvio.has(`vehiculos.${f.vehiculoTipo}`) ? t('quien.domiciliarioCon', { vehiculo: tEnvio(`vehiculos.${f.vehiculoTipo}`) }) : t('quien.domiciliario')}
          </span>
        </div>
      );
    }
    if (f.modo === 'own' && esEstadoEnvio(f.status) && ESTADOS_ASIGNABLES.includes(f.status)) {
      return (
        <div className="flex flex-col items-start">
          <span className="text-fg-muted">{t('quien.sinAsignar')}</span>
          <button
            type="button"
            className="text-xs font-medium text-link hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              abrirDialogo('asignar', [f]);
            }}
          >
            {t('acciones.asignarCorto')}
          </button>
        </div>
      );
    }
    return <span className="text-fg-muted">—</span>;
  };

  const columnas: ColumnaTabla<FilaEnvio>[] = [
    {
      id: 'envio',
      encabezado: t('columnas.envio'),
      celda: (f) => {
        const Icono = ICONO_CANAL_ENVIO[f.canal];
        const origen = [f.pedido && f.pedido !== f.numero ? f.pedido : null, f.canal === 'pos' && f.sede ? t('canalSede', { canal: tEnvio(`canales.${f.canal}`), sede: f.sede }) : tEnvio(`canales.${f.canal}`)];
        return (
          <div className="flex min-w-0 max-w-[170px] flex-col">
            <span className="flex items-center gap-1.5 font-medium text-link">
              <Icono aria-hidden="true" className="size-3.5 shrink-0 text-fg-muted" strokeWidth={1.5} />
              <span className="truncate">{f.numero}</span>
            </span>
            <span className="text-xs text-fg-muted">{origen.filter(Boolean).join(' · ')}</span>
          </div>
        );
      },
    },
    {
      id: 'destinatario',
      encabezado: t('columnas.destinatario'),
      ocultarDebajo: 'md',
      celda: (f) => (
        <div className="flex min-w-0 max-w-[160px] flex-col">
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
        <div className="flex min-w-0 max-w-[180px] flex-col">
          <span className="truncate text-fg">{f.direccion ?? '—'}</span>
          <span className="truncate text-xs text-fg-muted">{[f.barrio, f.ciudad].filter(Boolean).join(' · ')}</span>
        </div>
      ),
    },
    { id: 'quien', encabezado: t('columnas.quien'), ocultarDebajo: 'lg', celda: quienCelda },
    {
      id: 'fechas',
      encabezado: t('columnas.fechas'),
      ocultarDebajo: 'md',
      celda: (f) => {
        const segunda = segundaFecha(f);
        return (
          <div className="flex min-w-0 max-w-[130px] flex-col">
            <span className="text-fg">{cuando(f.creado)}</span>
            {segunda && <span className="text-xs text-fg-muted">{segunda}</span>}
          </div>
        );
      },
    },
    { id: 'valor', encabezado: t('columnas.valor'), celda: cobroCelda },
    { id: 'peso', encabezado: t('columnas.peso'), ocultarDebajo: 'xl', alinear: 'derecha', celda: (f) => <span className="tabular-nums text-fg">{f.pesoKg != null ? peso(f.pesoKg) : '—'}</span> },
    { id: 'estado', encabezado: t('columnas.estado'), celda: estadoCelda },
  ];

  // ── Filtros ────────────────────────────────────────────────────────────────
  const nombreDe = (lista: readonly { id: string; nombre: string }[] | undefined, id: string | null) => (id ? lista?.find((o) => o.id === id)?.nombre ?? id : '');
  const rangoPorDefecto = rango.desde === inicioDeMes(hoy) && rango.hasta === hoy;
  const chips: ChipFiltro[] = [
    ...(!rangoPorDefecto ? [{ clave: 'fechas', etiqueta: t('filtros.chipFechas', { rango: etiquetaRango(rango, locale) }) }] : []),
    ...(filtros.canal ? [{ clave: 'canal', etiqueta: t('filtros.chipCanal', { canal: tEnvio(`canales.${filtros.canal}`) }) }] : []),
    ...(filtros.cobro ? [{ clave: 'cobro', etiqueta: t('filtros.chipCobro', { cobro: etiquetaCobro(filtros.cobro) }) }] : []),
    ...(filtros.quien
      ? [{ clave: 'quien', etiqueta: filtros.quien === QUIEN_SIN_ASIGNAR ? t('quien.sinAsignar') : t('filtros.chipQuien', { nombre: nombreDe(opciones?.domiciliarios, filtros.quien) }) }]
      : []),
    ...(filtros.transportadora ? [{ clave: 'transportadora', etiqueta: t('filtros.chipTransportadora', { nombre: nombreDe(opciones?.transportadoras, filtros.transportadora) }) }] : []),
    ...(filtros.viaje ? [{ clave: 'viaje', etiqueta: t('filtros.chipViaje', { nombre: nombreDe(opciones?.viajes, filtros.viaje) }) }] : []),
    ...(filtros.zona ? [{ clave: 'zona', etiqueta: t('filtros.chipZona', { nombre: nombreDe(opciones?.zonas, filtros.zona) }) }] : []),
  ];
  const quitarChip = (clave: string) => {
    if (clave === 'fechas') l.actualizar({ filtros: { ...l.filtros, desde: '', hasta: '' } });
    else l.setFiltro(clave, null);
  };
  const limpiarFiltros = () => l.actualizar({ filtros: pestana === 'todos' ? {} : { pestana } });
  const hayCriterios = !!(l.busqueda || chips.length);
  const sinNada = !cargando && !error && filas.length === 0 && !hayCriterios;
  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && filas.length === 0 ? 'cargando' : error ? 'error' : visibles.length === 0 ? (hayCriterios || pestana !== 'todos' ? 'sinResultados' : 'vacio') : 'listo';
  const sustantivo = { singular: t('sustantivo.singular'), plural: t('sustantivo.plural'), genero: 'masculino' as const };

  const selectFiltro = (clave: 'canal' | 'cobro' | 'quien' | 'transportadora' | 'viaje' | 'zona', opcionesSelect: readonly { valor: string; etiqueta: string }[], todos: string) => (
    <FormField etiqueta={t(`filtros.${clave}`)}>
      {(cp) => (
        <Select value={l.filtros[clave] ?? 'todos'} onValueChange={(v) => l.setFiltro(clave, v === 'todos' ? null : v)}>
          <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className="h-10 border-line-strong bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">{todos}</SelectItem>
            {opcionesSelect.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>
                {o.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );

  const menuCabecera: AccionFila[] = [
    { id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: recargar },
    { id: 'exportar', etiqueta: t('exportar.todo'), icono: Download, onSelect: () => exportar(visibles), deshabilitada: visibles.length === 0, motivo: t('exportar.sinFilas') },
    { id: 'porDespachar', etiqueta: t('ir.porDespachar'), icono: PackageCheck, onSelect: () => router.push(RUTAS_LOGISTICA.porDespachar), separadorAntes: true },
    { id: 'seguimiento', etiqueta: t('ir.seguimiento'), icono: Truck, onSelect: () => router.push(RUTAS_LOGISTICA.seguimiento) },
    { id: 'zonas', etiqueta: t('ir.zonas'), icono: MapPin, onSelect: () => router.push(RUTAS_LOGISTICA.zonas) },
  ];

  const pestanas = PESTANAS_ENVIOS.map((p) => ({ valor: p, etiqueta: t(`pestanas.${p}`), contador: conteos[p] }));

  const disponibleEn = (lista: readonly FilaEnvio[], k: 'asignar' | 'cambiarEstado' | 'devolver' | 'cancelar' | 'marcarPagado') => lista.filter((f) => accionesFilaEnvio(f)[k]);
  const motivoDeshabilitada = t('masivo.ningunoPuede');

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        icono={Truck}
        subtitulo={sede ? t('subtituloSede', { sede }) : t('subtitulo')}
        cargando={cargando && filas.length === 0}
        migas={[{ etiqueta: t('migas.logistica'), href: RUTAS_LOGISTICA.porDespachar }, { etiqueta: t('titulo') }]}
        debajo={<BranchBadgeActiva tamano="sm" />}
        acciones={
          <>
            <AtajoConfigurar seccion={SECCION_CONFIGURACION_LOGISTICA} />
            <button type="button" className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })} onClick={recargar} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => exportar(visibles)} disabled={visibles.length === 0} title={visibles.length === 0 ? t('exportar.sinFilas') : undefined}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('exportar.boton')}
            </button>
            <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => router.push(RUTA_NUEVO_ENVIO)}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nuevo')}
            </button>
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('titulo')} acciones={menuCabecera.filter((a) => a.id !== 'actualizar' && a.id !== 'exportar')} />
          </>
        }
        movil={{
          accion: (
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={[{ id: 'nuevo', etiqueta: t('nuevo'), icono: Plus, onSelect: () => router.push(RUTA_NUEVO_ENVIO) }, ...menuCabecera]}
            />
          ),
        }}
      />

      {sinNada ? (
        <EmptyState
          icono={Package}
          titulo={t('vacio.titulo')}
          descripcion={t('vacio.descripcion')}
          accion={{ etiqueta: t('nuevo'), icono: Plus, onClick: () => router.push(RUTA_NUEVO_ENVIO) }}
          accionSecundaria={{ etiqueta: t('vacio.zonas'), icono: MapPin, href: RUTAS_LOGISTICA.zonas }}
        />
      ) : (
        <>
          <KpiStrip etiqueta={t('kpis.etiqueta')}>
            <StatCard
              etiqueta={t('kpis.periodo')}
              cargando={cargando && filas.length === 0}
              valor={entero(kpis.total)}
              detalle={t('kpis.periodoDetalle', { rango: etiquetaRango(rango, locale), hoy: entero(kpis.creadosHoy) })}
            />
            <StatCard
              etiqueta={t('kpis.entregados')}
              cargando={cargando && filas.length === 0}
              valor={entero(kpis.entregados)}
              tono={kpis.pctEntregados !== null ? 'exito' : 'neutro'}
              tendencia={kpis.pctEntregados !== null ? 'sube' : undefined}
              detalle={
                kpis.pctEntregados === null
                  ? t('kpis.entregadosVacio')
                  : kpis.pctPrimerIntento === null
                    ? porcentaje(kpis.pctEntregados)
                    : t('kpis.entregadosDetalle', { pct: porcentaje(kpis.pctEntregados), primer: porcentaje(kpis.pctPrimerIntento) })
              }
              onClick={kpis.entregados > 0 ? () => l.setFiltro('pestana', 'entregados') : undefined}
            />
            <StatCard
              etiqueta={t('kpis.enCamino')}
              cargando={cargando && filas.length === 0}
              valor={entero(kpis.enCamino)}
              tono={kpis.conNovedad > 0 ? 'advertencia' : 'neutro'}
              iconoDetalle={kpis.conNovedad > 0 ? AlertTriangle : undefined}
              detalle={
                kpis.conNovedad > 0
                  ? kpis.motivoNovedad
                    ? t('kpis.novedadesMotivo', { count: kpis.conNovedad, motivo: tEnvio.has(`motivos.${kpis.motivoNovedad}`) ? tEnvio(`motivos.${kpis.motivoNovedad}`).toLowerCase() : kpis.motivoNovedad })
                    : t('kpis.novedades', { count: kpis.conNovedad })
                  : t('kpis.enCaminoDetalle')
              }
              onClick={kpis.conNovedad > 0 ? () => l.setFiltro('pestana', 'con_novedad') : kpis.enCamino > 0 ? () => l.setFiltro('pestana', 'en_camino') : undefined}
            />
            <StatCard
              etiqueta={t('kpis.contraentrega')}
              cargando={cargando && filas.length === 0}
              valor={moneda.formatear(kpis.contraentregaPorCobrar)}
              detalle={
                kpis.enviosContraentrega > 0
                  ? t('kpis.contraentregaDetalle', { count: kpis.enviosContraentrega, domiciliarios: kpis.domiciliariosContraentrega })
                  : t('kpis.contraentregaVacio')
              }
              onClick={kpis.enviosContraentrega > 0 ? () => l.setFiltro('cobro', 'contraentrega') : undefined}
            />
          </KpiStrip>

          {recortada && <AvisoTonal tono="informacion" compacto titulo={t('recortada', { n: entero(filas.length) })} />}

          <TabBar id="envios" etiqueta={t('pestanas.etiqueta')} pestanas={pestanas} valor={pestana} onValorChange={(v) => l.setFiltro('pestana', v === 'todos' ? null : v)} />

          <div role="tabpanel" id={idPanel('envios', pestana)} aria-labelledby={idPestana('envios', pestana)} className="flex flex-col gap-4 lg:gap-5">
            <ListToolbar
              busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
              filtros={
                <FilterPanel conteo={chips.length} onLimpiar={limpiarFiltros} textoVerResultados={t('filtros.verN', { count: visibles.length })}>
                  <FormField etiqueta={t('filtros.fechas')}>
                    {() => (
                      <DateRangeButton
                        valor={rango}
                        hoy={hoy}
                        etiqueta={t('filtros.fechas')}
                        onValorChange={(r) => l.actualizar({ filtros: { ...l.filtros, desde: r.desde, hasta: r.hasta } })}
                        onLimpiar={() => l.actualizar({ filtros: { ...l.filtros, desde: '', hasta: '' } })}
                        className="w-full"
                      />
                    )}
                  </FormField>
                  {selectFiltro('canal', CANALES_ENVIO.map((c) => ({ valor: c, etiqueta: tEnvio(`canales.${c}`) })), t('filtros.todosCanales'))}
                  {selectFiltro('cobro', COBROS_ENVIO.map((c) => ({ valor: c, etiqueta: etiquetaCobro(c) })), t('filtros.todos'))}
                  {selectFiltro(
                    'quien',
                    [{ valor: QUIEN_SIN_ASIGNAR, etiqueta: t('quien.sinAsignar') }, ...(opciones?.domiciliarios ?? []).map((d) => ({ valor: d.id, etiqueta: d.nombre }))],
                    t('filtros.todos'),
                  )}
                  {(opciones?.transportadoras.length ?? 0) > 0 &&
                    selectFiltro('transportadora', (opciones?.transportadoras ?? []).map((c) => ({ valor: c.id, etiqueta: c.nombre })), t('filtros.todas'))}
                  {(opciones?.viajes.length ?? 0) > 0 &&
                    selectFiltro('viaje', (opciones?.viajes ?? []).map((v) => ({ valor: v.id, etiqueta: [v.nombre, v.detalle].filter(Boolean).join(' · ') })), t('filtros.todosViajes'))}
                  {(opciones?.zonas.length ?? 0) > 0 && selectFiltro('zona', (opciones?.zonas ?? []).map((z) => ({ valor: z.id, etiqueta: z.nombre })), t('filtros.todasZonas'))}
                </FilterPanel>
              }
              chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={limpiarFiltros} textoLimpiarTodo={t('filtros.limpiar')} />}
            />

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
              tonoFila={(f) => (pestanaDeEnvio(f) === 'con_novedad' ? 'advertencia' : undefined)}
              tarjetaMovil={(f, ctx) => (
                <ListCard
                  icono={ICONO_CANAL_ENVIO[f.canal]}
                  titulo={f.numero}
                  subtitulo={[f.pedido && f.pedido !== f.numero ? f.pedido : null, tEnvio(`canales.${f.canal}`)].filter(Boolean).join(' · ')}
                  meta={
                    <span className="flex flex-col">
                      <span>{[f.cliente, f.direccion && [f.direccion, f.barrio ?? f.ciudad].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</span>
                      <span>{[etiquetaQuien(f) || (pestanaDeEnvio(f) === 'por_asignar' ? t('quien.sinAsignar') : null), segundaFecha(f)].filter(Boolean).join(' · ')}</span>
                    </span>
                  }
                  valor={fmt(f, f.valor)}
                  estado={<EstadoEnvioBadge estado={f.status} />}
                  acciones={accionesDe(f)}
                  onClick={() => abrir(f)}
                  seleccionable={ctx.modoSeleccion}
                  seleccionado={ctx.seleccionado}
                  onSeleccionChange={ctx.alternar}
                />
              )}
              vacio={{ icono: Package, titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
              sinResultados={{ descripcion: t('sinResultados') }}
              error={{ titulo: t('errorCarga') }}
              sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
              onLimpiarFiltros={() => l.actualizar({ busqueda: '', filtros: {} })}
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
          </div>
        </>
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
            etiqueta: t('masivo.asignar'),
            icono: UserCheck,
            onClick: () => abrirDialogo('asignar', disponibleEn(seleccionadas, 'asignar')),
            deshabilitada: disponibleEn(seleccionadas, 'asignar').length === 0,
            motivo: motivoDeshabilitada,
          },
          { id: 'guias', etiqueta: t('masivo.guias'), icono: Printer, onClick: () => abrirDialogo('guias', seleccionadas) },
          {
            id: 'estado',
            etiqueta: t('masivo.estado'),
            icono: RefreshCw,
            onClick: () => abrirDialogo('estado', seleccionadas),
            deshabilitada: !seleccionadas.some((f) => estadosCambioDisponibles(f.status).length > 0),
            motivo: motivoDeshabilitada,
          },
        ]}
        accionesSecundarias={[
          {
            id: 'devolver',
            etiqueta: t('masivo.devolver'),
            icono: RotateCcw,
            onSelect: () => abrirDialogo('devolver', seleccionadas),
            deshabilitada: disponibleEn(seleccionadas, 'devolver').length === 0,
            motivo: motivoDeshabilitada,
          },
          {
            id: 'pagado',
            etiqueta: t('masivo.pagado'),
            icono: CreditCard,
            onSelect: () => void marcarPagados(seleccionadas),
            deshabilitada: ocupado || disponibleEn(seleccionadas, 'marcarPagado').length === 0,
            motivo: t('masivo.soloManuales'),
          },
          { id: 'exportar', etiqueta: t('masivo.exportar'), icono: FileText, onSelect: () => exportar(seleccionadas) },
          {
            id: 'cancelar',
            etiqueta: t('masivo.cancelar'),
            icono: Ban,
            destructiva: true,
            separadorAntes: true,
            onSelect: () => abrirDialogo('cancelar', seleccionadas),
            deshabilitada: disponibleEn(seleccionadas, 'cancelar').length === 0,
            motivo: motivoDeshabilitada,
          },
        ]}
      />

      {dialogo?.tipo === 'asignar' && (
        <HojaAsignarDomiciliario
          abierto
          onAbiertoChange={(v) => !v && setDialogo(null)}
          organizationId={organizationId}
          envios={dialogo.envios}
          sede={sede}
          onImprimirGuias={(lista, dom) => void imprimirGuias(lista, dom)}
          onAsignado={terminar}
        />
      )}
      <DialogoCambiarEstado abierto={dialogo?.tipo === 'estado'} onAbiertoChange={(v) => !v && setDialogo(null)} envios={dialogo?.tipo === 'estado' ? dialogo.envios : []} onHecho={terminar} />
      <DialogoDevolver abierto={dialogo?.tipo === 'devolver'} onAbiertoChange={(v) => !v && setDialogo(null)} envios={dialogo?.tipo === 'devolver' ? dialogo.envios : []} onHecho={terminar} />
      <DialogoCancelar abierto={dialogo?.tipo === 'cancelar'} onAbiertoChange={(v) => !v && setDialogo(null)} envios={dialogo?.tipo === 'cancelar' ? dialogo.envios : []} onHecho={terminar} />
      <DialogoImprimirGuias
        abierto={dialogo?.tipo === 'guias'}
        onAbiertoChange={(v) => !v && setDialogo(null)}
        envios={dialogo?.tipo === 'guias' ? dialogo.envios : []}
        organizacion={organization?.name ?? null}
        onImprimir={async (opciones) => {
          if (dialogo?.tipo !== 'guias') return;
          await imprimirGuias(dialogo.envios, null, opciones);
          setSeleccion(new Set());
        }}
      />
    </div>
  );
}
