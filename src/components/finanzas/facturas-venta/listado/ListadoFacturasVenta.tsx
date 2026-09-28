'use client';

/**
 * Facturas de venta — listado (Figma B.1 `421:167503` «listo», estados
 * `421:168188…421:170742`, selección y acciones en lote; móvil `421:171523`).
 *
 * Paginado, filtrado y ordenado en el servidor (`GET /api/facturas-venta` →
 * `fn_facturas_venta_listado`) con el estado en la URL (`useListadoServidor`).
 *
 * - El periodo (por defecto el mes en curso, en el día de la organización) va
 *   en el subtítulo y se elige dentro de «Filtros»; manda en el KPI «Facturado
 *   en el periodo» (`kpi_desde`/`kpi_hasta`) y limita el listado por emisión
 *   salvo `periodo=todo` (lo pone el KPI «Vencido», que mira toda la cartera).
 * - Acciones en lote sobre las rutas que ya existen: registrar pago (reparto
 *   del cliente, solo facturas de UN cliente), imprimir, exportar, descargar PDF
 *   y anular con motivo (regla L4 por factura; las que no se pueden, se dicen).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Banknote,
  BedDouble,
  CircleDollarSign,
  Copy,
  DollarSign,
  Download,
  Eye,
  FileDown,
  FileText,
  Layers,
  Plus,
  Printer,
  Receipt,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  BranchBadgeActiva,
  BulkActionBar,
  CustomerPicker,
  DataTable,
  DateRangeButton,
  DialogoMotivo,
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
  SegmentedControl,
  StatCard,
  StatusBadge,
  etiquetaRango,
  etiquetaRangoLarga,
  inicioDeMes,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ClientePicker,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess, toastWarning } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId, useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda, formatNumeroMoneda } from '@/lib/utils/moneda';
import { descargarDocumento, imprimirDocumento, abrirDocumento } from '@/lib/documents/cliente';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { estadoPagoFactura } from '@/lib/finanzas/ventas/reglasFactura';
import {
  CAMPOS_ORDEN_FACTURAS,
  FILTROS_PANTALLA_FACTURAS,
  ordenFacturasRpc,
  type FilaFacturaListado,
  type RespuestaListadoFacturas,
} from '@/lib/finanzas/ventas/listadoFacturas';
import { MAX_IMPRESION_LOTE, anularEnLote, elegibilidadPagoLote, filaCobrable, repartirAnulacion } from '@/lib/finanzas/ventas/loteFacturas';
import { ErrorPeticionFactura, anularFacturaVenta, pedirListadoFacturas } from '@/lib/finanzas/ventas/clienteFacturas';
import { listarClientes } from '@/lib/services/clientesListadoService';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { RegistrarPagoConectado, type DestinoPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { ImportarCSVDialog } from '../ImportarCSVDialog';

const RUTA = '/app/finanzas/facturas-venta';
const ESTADOS_FE = ['pending', 'processing', 'sent', 'accepted', 'rejected', 'failed', 'cancelled'] as const;
/** Tope de «Seleccionar las N» y de la exportación: 25 páginas de 200. */
const PAGINAS_MAX = 25;

const CLASE_ACCION_RAPIDA =
  'flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';
const CLASE_CAMPO =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

/** Copia de los filtros de la URL sin esas claves. */
function sinClaves(filtros: Record<string, string>, claves: readonly string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(filtros).filter(([k]) => !claves.includes(k)));
}

export function ListadoFacturasVenta() {
  const t = useTranslations('facturasVenta');
  const tDoc = useTranslations('documentos');
  const tAvisos = useTranslations('posCobroServidor.avisos');
  const router = useRouter();
  const entero = useFormatoEntero();
  const locale = useLocaleIntl();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const { organization } = useOrganization();
  const { branchFilter, branches } = useBranch();
  const { formatDate, getToday } = useFormatDate();
  const hoy = getToday();

  const l = useListadoServidor({
    filtros: [...FILTROS_PANTALLA_FACTURAS],
    camposOrden: [...CAMPOS_ORDEN_FACTURAS],
    ordenPorDefecto: { campo: 'emision', direccion: 'desc' },
    tamanoPorDefecto: 25,
  });

  const [datos, setDatos] = useState<RespuestaListadoFacturas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  /** Filas vistas o traídas con «Seleccionar las N»: las acciones en lote las leen de aquí. */
  const [conocidas, setConocidas] = useState<Map<string, FilaFacturaListado>>(new Map());
  const [seleccionandoTodas, setSeleccionandoTodas] = useState(false);
  const [pago, setPago] = useState<DestinoPagoConectado | null>(null);
  const [importar, setImportar] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [anularAbierto, setAnularAbierto] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);
  const [clienteElegido, setClienteElegido] = useState<ClientePicker | null>(null);

  // Periodo: el de la URL o el mes en curso (día de la organización).
  const periodo = useMemo(() => ({ desde: l.filtros.desde ?? inicioDeMes(hoy), hasta: l.filtros.hasta ?? hoy }), [l.filtros.desde, l.filtros.hasta, hoy]);
  const todasLasFechas = l.filtros.periodo === 'todo';
  const periodoElegido = !!(l.filtros.desde || l.filtros.hasta);

  const consulta = useMemo(() => {
    const q = new URLSearchParams();
    if (l.busqueda) q.set('q', l.busqueda);
    for (const [k, v] of Object.entries(l.filtros)) if (v && k !== 'periodo' && k !== 'desde' && k !== 'hasta') q.set(k, v);
    if (!todasLasFechas) {
      q.set('desde', periodo.desde);
      q.set('hasta', periodo.hasta);
    }
    q.set('kpi_desde', periodo.desde);
    q.set('kpi_hasta', periodo.hasta);
    if (branchFilter) q.set('sucursal', String(branchFilter));
    q.set('orden', ordenFacturasRpc(l.orden?.campo, l.orden?.direccion));
    q.set('pagina', String(l.pagina));
    q.set('tamano', String(l.tamano));
    return q.toString();
  }, [l.busqueda, l.filtros, l.orden, l.pagina, l.tamano, periodo, todasLasFechas, branchFilter]);

  const recordar = useCallback((filas: readonly FilaFacturaListado[]) => {
    if (filas.length === 0) return;
    setConocidas((prev) => {
      const m = new Map(prev);
      for (const f of filas) m.set(f.id, f);
      return m;
    });
  }, []);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    pedirListadoFacturas(new URLSearchParams(consulta))
      .then((r) => {
        if (cancelado) return;
        setDatos(r);
        recordar(r.filas);
      })
      .catch((e: { codigo?: string }) => !cancelado && setError(e?.codigo ?? 'error_desconocido'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [consulta, recarga, recordar]);

  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros, s: branchFilter });
  useEffect(() => setSeleccion(new Set()), [claveCriterios]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const limpiarSeleccion = () => setSeleccion(new Set());
  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;
  const kpi = datos?.kpis.find((k) => k.moneda === moneda.code) ?? datos?.kpis[0] ?? null;
  const fmtKpi = useMemo(() => crearFormateadorMoneda(moneda.paraDocumento(kpi?.moneda)), [moneda, kpi?.moneda]);
  const fmtFila = useCallback((f: FilaFacturaListado, v: number) => crearFormateadorMoneda(moneda.paraDocumento(f.moneda))(v), [moneda]);
  const sustantivo = {
    singular: t('listado.sustantivo.singular'),
    plural: t('listado.sustantivo.plural'),
    genero: t('listado.sustantivo.genero') === 'femenino' ? ('femenino' as const) : ('masculino' as const),
  };

  // ── Subtítulo: «organización · sucursal · periodo» ─────────────────────────
  const nombreSucursal =
    branchFilter === null || branchFilter === undefined
      ? t('listado.todasLasSucursales')
      : branches.find((b) => b.id === branchFilter)?.name ?? null;
  const textoPeriodo = todasLasFechas ? t('listado.todasLasFechas') : etiquetaRangoLarga(periodo, locale);
  const subtitulo = [organization?.name, nombreSucursal, textoPeriodo].filter(Boolean).join(' · ');

  const estadoPago = (f: FilaFacturaListado) =>
    estadoPagoFactura({ status: f.estado, total: f.total, balance: f.saldo, dias_vencida: f.dias_vencida });

  const badgeEstado = (f: FilaFacturaListado) => {
    const e = estadoPago(f);
    if (e === 'vencida') return <StatusBadge estado="overdue" etiqueta={t('estados.vencidaDias', { dias: f.dias_vencida })} />;
    if (e === 'borrador') return <StatusBadge estado="draft" />;
    if (e === 'anulada') return <StatusBadge estado="void" />;
    if (e === 'pagada') return <StatusBadge estado="paid" />;
    if (e === 'parcial') return <StatusBadge estado="partial" />;
    return <StatusBadge estado="pending" etiqueta={t('estados.pendiente')} />;
  };

  const badgeFe = (f: FilaFacturaListado) =>
    f.fe ? (
      <StatusBadge estado={f.fe} etiqueta={t.has(`listado.fe.${f.fe}`) ? t(`listado.fe.${f.fe}` as never) : f.fe} />
    ) : (
      <StatusBadge estado="sin fe" etiqueta={t('listado.fe.sin')} />
    );

  /** Método: traducido si es de los conocidos; si no, el nombre del catálogo o el código. */
  const textoMetodo = (f: FilaFacturaListado) => {
    if (!f.metodo) return t('listado.metodoSinDefinir');
    const clave = `metodosPago.${f.metodo.toLowerCase()}`;
    return tDoc.has(clave) ? tDoc(clave as never) : f.metodo_nombre ?? f.metodo;
  };

  const puedePagar = (f: FilaFacturaListado) => permisos.crear && filaCobrable(f);
  const pagarFactura = (f: FilaFacturaListado) => setPago({ tipo: 'factura', id: f.id });

  const accionesDe = (f: FilaFacturaListado): AccionFila[] => [
    { id: 'ver', etiqueta: t('listado.acciones.ver'), icono: Eye, onSelect: () => router.push(`${RUTA}/${f.id}`) },
    { id: 'pagar', etiqueta: t('acciones.registrarPago'), icono: CircleDollarSign, onSelect: () => pagarFactura(f), oculta: !puedePagar(f) },
    { id: 'imprimir', etiqueta: t('acciones.imprimir'), icono: Printer, onSelect: () => imprimirDocumento('factura-venta', f.id) },
    { id: 'pdf', etiqueta: t('acciones.verPdf'), icono: FileText, onSelect: () => abrirDocumento('factura-venta', f.id) },
    { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => router.push(`${RUTA}/nuevo?duplicar=${f.id}`), oculta: !permisos.crear },
  ];

  // ── Todas las filas del filtro (exportar y «Seleccionar las N») ────────────
  const traerTodas = async (): Promise<FilaFacturaListado[]> => {
    const todas: FilaFacturaListado[] = [];
    const base = new URLSearchParams(consulta);
    base.set('tamano', '200');
    for (let pagina = 1; pagina <= PAGINAS_MAX; pagina++) {
      base.set('pagina', String(pagina));
      const r = await pedirListadoFacturas(base);
      todas.push(...r.filas);
      if (todas.length >= r.total || r.filas.length === 0) break;
    }
    recordar(todas);
    return todas;
  };

  const seleccionarTodas = async () => {
    setSeleccionandoTodas(true);
    try {
      const todas = await traerTodas();
      setSeleccion(new Set(todas.map((f) => f.id)));
    } catch {
      toastError(t('listado.lote.errorSeleccionarTodas'));
    } finally {
      setSeleccionandoTodas(false);
    }
  };

  const exportar = async (ids?: ReadonlySet<string>) => {
    setExportando(true);
    try {
      const todas = await traerTodas();
      const elegidas = ids ? todas.filter((f) => ids.has(f.id)) : todas;
      const csv = aCsv([
        [
          t('listado.columnas.numero'),
          t('listado.columnas.cliente'),
          t('detalle.documento'),
          t('listado.columnas.emision'),
          t('listado.columnas.vencimiento'),
          t('listado.columnas.moneda'),
          t('listado.columnas.total'),
          t('listado.columnas.saldo'),
          t('listado.columnas.metodo'),
          t('listado.columnas.estado'),
          t('listado.columnas.fe'),
          t('listado.columnas.sucursal'),
        ],
        ...elegidas.map((f) => [
          f.numero,
          f.cliente,
          f.cliente_doc,
          formatDate(f.emision),
          formatDate(f.vencimiento),
          f.moneda,
          formatNumeroMoneda(f.total, moneda.paraDocumento(f.moneda)),
          formatNumeroMoneda(f.saldo, moneda.paraDocumento(f.moneda)),
          textoMetodo(f),
          t(`listado.estadoPago.${estadoPago(f)}`),
          f.fe ? (t.has(`listado.fe.${f.fe}`) ? t(`listado.fe.${f.fe}` as never) : f.fe) : t('listado.fe.sin'),
          f.sucursal,
        ]),
      ]);
      descargarCsv(`${t('listado.archivoExportacion')}_${hoy}.csv`, csv);
    } catch {
      toastError(t('listado.exportarError'));
    } finally {
      setExportando(false);
    }
  };

  // ── Selección y acciones en lote ───────────────────────────────────────────
  const seleccionadas = useMemo(
    () => Array.from(seleccion, (id) => conocidas.get(id)).filter((f): f is FilaFacturaListado => !!f),
    [seleccion, conocidas],
  );
  const pagoLote = elegibilidadPagoLote(seleccionadas, permisos.crear);
  const repartoAnulacion = useMemo(() => repartirAnulacion(seleccionadas), [seleccionadas]);

  const imprimirLote = () => {
    // Dentro del clic: el navegador solo deja abrir pestañas en respuesta al usuario.
    for (const f of seleccionadas) imprimirDocumento('factura-venta', f.id);
    toastSuccess(t('listado.lote.impresionAbierta', { count: seleccionadas.length, n: entero(seleccionadas.length) }), t('listado.lote.impresionAyuda'));
  };

  const descargarLote = async () => {
    setDescargando(true);
    let fallidas = 0;
    for (const f of seleccionadas) {
      try {
        await descargarDocumento('factura-venta', f.id);
      } catch {
        fallidas++;
      }
    }
    setDescargando(false);
    if (fallidas > 0) toastError(t('pdf.error'));
  };

  const anularLote = async (motivo: string) => {
    setAnulando(true);
    setErrorAnular(null);
    try {
      const r = await anularEnLote(repartoAnulacion.anulables, motivo, anularFacturaVenta, (e) =>
        e instanceof ErrorPeticionFactura ? String(e.codigo) : 'error_desconocido',
      );
      if (r.anuladas.length > 0) {
        toastSuccess(t('listado.lote.anuladas', { count: r.anuladas.length, n: entero(r.anuladas.length) }));
        if (r.avisos.includes('comision_ya_pagada')) toastWarning(tAvisos('comision_ya_pagada'));
      }
      recargar();
      if (r.fallidas.length > 0) {
        setSeleccion(new Set(r.fallidas.map((x) => x.id)));
        setErrorAnular(
          t('listado.lote.anularFallidas', {
            count: r.fallidas.length,
            n: entero(r.fallidas.length),
            detalle: r.fallidas
              .map((x) => `${x.numero ?? t('detalle.sinNumero')}: ${t.has(`errores.${x.codigo}`) ? t(`errores.${x.codigo}` as never) : t('errores.error_desconocido')}`)
              .join(' · '),
          }),
        );
      } else {
        setAnularAbierto(false);
        limpiarSeleccion();
      }
    } finally {
      setAnulando(false);
    }
  };

  const motivoPagoLote = pagoLote.ok ? undefined : pagoLote.motivo === 'vacio' ? undefined : t(`listado.lote.motivosPago.${pagoLote.motivo}`);
  const accionesLote = [
    {
      id: 'pagar',
      etiqueta: t('acciones.registrarPago'),
      icono: DollarSign,
      onClick: () => pagoLote.ok && setPago({ tipo: 'tercero', customerId: pagoLote.clienteId, facturaIds: pagoLote.facturaIds }),
      deshabilitada: !pagoLote.ok,
      motivo: motivoPagoLote,
    },
    {
      id: 'imprimir',
      etiqueta: t('acciones.imprimir'),
      icono: Printer,
      onClick: imprimirLote,
      deshabilitada: seleccionadas.length > MAX_IMPRESION_LOTE,
      motivo: t('listado.lote.maximoImpresion', { max: MAX_IMPRESION_LOTE }),
    },
    { id: 'exportar', etiqueta: t('listado.lote.exportar'), icono: Layers, onClick: () => void exportar(seleccion), cargando: exportando },
    {
      id: 'anular',
      etiqueta: t('listado.lote.anular'),
      icono: Trash2,
      destructiva: true,
      onClick: () => {
        setErrorAnular(null);
        setAnularAbierto(true);
      },
      deshabilitada: !permisos.anular,
      motivo: t('listado.lote.sinPermisoAnular'),
    },
  ];
  const accionesLoteSecundarias: AccionFila[] = [
    {
      id: 'pdf',
      etiqueta: t('acciones.descargarPdf'),
      icono: FileDown,
      onSelect: () => void descargarLote(),
      deshabilitada: descargando || seleccionadas.length > MAX_IMPRESION_LOTE,
      motivo: descargando ? t('listado.exportando') : t('listado.lote.maximoImpresion', { max: MAX_IMPRESION_LOTE }),
    },
  ];

  // ── Filtros y chips ────────────────────────────────────────────────────────
  const buscarClientes = useCallback(async (texto: string): Promise<ClientePicker[]> => {
    const r = await listarClientes({
      organizationId: getOrganizationId(),
      branchId: null,
      criterios: { busqueda: texto },
      orden: null,
      desde: 0,
      tamano: 10,
    });
    return r.filas.map((c) => ({ id: c.id, nombre: c.full_name ?? c.company_name ?? '', documento: c.identification_number, correo: c.email, telefono: c.phone }));
  }, []);

  const nombreClienteFiltro =
    !l.filtros.cliente
      ? null
      : clienteElegido?.id === l.filtros.cliente
        ? clienteElegido.nombre
        : filas.find((f) => f.cliente_id === l.filtros.cliente)?.cliente ?? null;

  const etiquetaFe = (v: string) => (v === 'sin' ? t('listado.fe.sin') : t(`listado.fe.${v}` as never));
  const chips: ChipFiltro[] = [
    todasLasFechas ? { clave: 'periodo', etiqueta: t('listado.filtros.todasFechasChip') } : null,
    !todasLasFechas && periodoElegido ? { clave: 'desde', etiqueta: t('listado.filtros.periodoChip', { rango: etiquetaRango(periodo, locale) }) } : null,
    l.filtros.estado_doc ? { clave: 'estado_doc', etiqueta: t('listado.filtros.estadoChip', { estado: t(`listado.filtros.doc.${l.filtros.estado_doc}` as never) }) } : null,
    l.filtros.estado_pago ? { clave: 'estado_pago', etiqueta: t('listado.filtros.pagoChip', { estado: t(`listado.estadoPago.${l.filtros.estado_pago}` as never) }) } : null,
    l.filtros.fe ? { clave: 'fe', etiqueta: t('listado.filtros.feChip', { estado: etiquetaFe(l.filtros.fe) }) } : null,
    l.filtros.cliente
      ? { clave: 'cliente', etiqueta: nombreClienteFiltro ? t('listado.filtros.clienteChipNombre', { nombre: nombreClienteFiltro }) : t('listado.filtros.clienteChip') }
      : null,
    l.filtros.monto_min ? { clave: 'monto_min', etiqueta: t('listado.filtros.montoMinChip', { monto: fmtKpi(Number(l.filtros.monto_min)) }) } : null,
    l.filtros.monto_max ? { clave: 'monto_max', etiqueta: t('listado.filtros.montoMaxChip', { monto: fmtKpi(Number(l.filtros.monto_max)) }) } : null,
  ].filter((c): c is ChipFiltro => c !== null);

  const quitarChip = (clave: string) => {
    if (clave === 'desde') l.actualizar({ filtros: sinClaves(l.filtros, ['desde', 'hasta']) });
    else l.setFiltro(clave, null);
  };

  /** KPI que filtra: mira toda la cartera, así que quita el límite de emisión. */
  const filtrarCartera = (estado: 'vencida' | 'abiertas') => l.actualizar({ filtros: { ...l.filtros, estado_pago: estado, periodo: 'todo' } });

  // ── Columnas (orden y estilo del Figma 421:167503) ─────────────────────────
  const columnas: ColumnaTabla<FilaFacturaListado>[] = [
    {
      id: 'numero',
      encabezado: t('listado.columnas.numero'),
      ordenable: true,
      celda: (f) => (
        <Link
          href={`${RUTA}/${f.id}`}
          onClick={(e) => e.stopPropagation()}
          className="whitespace-nowrap font-medium text-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {f.numero ?? t('detalle.sinNumero')}
        </Link>
      ),
    },
    {
      id: 'cliente',
      encabezado: t('listado.columnas.cliente'),
      ordenable: true,
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{f.cliente ?? t('detalle.sinCliente')}</span>
          {f.cliente_doc && <span className="truncate text-xs text-fg-muted">{f.cliente_doc}</span>}
        </div>
      ),
    },
    { id: 'emision', encabezado: t('listado.columnas.emision'), ordenable: true, ocultarDebajo: 'lg', celda: (f) => <span className="whitespace-nowrap tabular-nums">{formatDate(f.emision)}</span> },
    {
      id: 'vencimiento',
      encabezado: t('listado.columnas.vencimiento'),
      ordenable: true,
      ocultarDebajo: 'md',
      celda: (f) => <span className={f.dias_vencida > 0 ? 'whitespace-nowrap tabular-nums text-danger-text' : 'whitespace-nowrap tabular-nums'}>{formatDate(f.vencimiento)}</span>,
    },
    { id: 'total', encabezado: t('listado.columnas.total'), ordenable: true, variante: 'importe', celda: (f) => fmtFila(f, f.total) },
    {
      id: 'saldo',
      encabezado: t('listado.columnas.saldo'),
      ordenable: true,
      variante: 'importe',
      celda: (f) => {
        const e = estadoPago(f);
        const clase = e === 'anulada' ? 'text-fg-muted' : f.saldo > 0 ? 'text-danger-text' : 'text-success-text';
        return <span className={clase}>{fmtFila(f, f.saldo)}</span>;
      },
    },
    { id: 'metodo', encabezado: t('listado.columnas.metodo'), ocultarDebajo: 'xl', celda: (f) => <span className="whitespace-nowrap text-fg-secondary">{textoMetodo(f)}</span> },
    { id: 'estado', encabezado: t('listado.columnas.estado'), alinear: 'centro', celda: badgeEstado },
    { id: 'fe', encabezado: t('listado.columnas.fe'), alinear: 'centro', ocultarDebajo: 'lg', celda: badgeFe },
    {
      id: 'pms',
      encabezado: t('listado.columnas.pms'),
      alinear: 'centro',
      ocultarDebajo: 'xl',
      celda: (f) =>
        f.pms ? (
          <BedDouble role="img" aria-label={t('listado.pms')} className="mx-auto size-4 text-brand" strokeWidth={1.5} />
        ) : (
          <span aria-label={t('listado.sinPms')} className="text-fg-muted">
            —
          </span>
        ),
    },
  ];

  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? (l.hayCriterios ? 'sinResultados' : 'vacio') : 'listo';

  const cuantasTexto = (n: number) => entero(n);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('migas.facturasVenta')}
        subtitulo={subtitulo}
        icono={Receipt}
        cargando={cargando}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.facturacion') }, { etiqueta: t('migas.facturasVenta') }]}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            {permisos.crear && (
              <button
                type="button"
                onClick={() => setImportar(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('listado.importar')}
              </button>
            )}
            {permisos.crear && (
              <Link
                href={`${RUTA}/nuevo`}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('listado.nueva')}
              </Link>
            )}
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('migas.facturasVenta')}
              acciones={[{ id: 'exportar', etiqueta: t('listado.exportar'), icono: Download, onSelect: () => void exportar(), deshabilitada: exportando, motivo: t('listado.exportando') }]}
            />
          </>
        }
        movil={{
          subtitulo: textoPeriodo,
          accion: permisos.crear ? (
            <Link
              href={`${RUTA}/nuevo`}
              aria-label={t('listado.nueva')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </Link>
          ) : undefined,
        }}
      />

      <KpiStrip etiqueta={t('listado.kpis.etiqueta')}>
        <StatCard
          etiqueta={t('listado.kpis.facturado')}
          icono={DollarSign}
          cargando={!datos}
          valor={fmtKpi(kpi?.facturado ?? 0)}
          detalle={t('listado.kpis.emitidas', { count: kpi?.facturas_emitidas ?? 0, n: cuantasTexto(kpi?.facturas_emitidas ?? 0) })}
        />
        <StatCard
          etiqueta={t('listado.kpis.porCobrar')}
          icono={DollarSign}
          cargando={!datos}
          valor={fmtKpi(kpi?.por_cobrar ?? 0)}
          tono={kpi && kpi.facturas_con_saldo > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={kpi && kpi.facturas_con_saldo > 0 ? AlertTriangle : undefined}
          detalle={t('listado.kpis.conSaldo', { count: kpi?.facturas_con_saldo ?? 0, n: cuantasTexto(kpi?.facturas_con_saldo ?? 0) })}
          onClick={() => filtrarCartera('abiertas')}
        />
        <StatCard
          etiqueta={t('listado.kpis.vencido')}
          icono={DollarSign}
          cargando={!datos}
          valor={fmtKpi(kpi?.vencido ?? 0)}
          tono={kpi && kpi.vencido > 0 ? 'peligro' : 'neutro'}
          resaltada={!!kpi && kpi.vencido > 0}
          tendencia={kpi && kpi.vencido > 0 ? 'baja' : undefined}
          detalle={t('listado.kpis.vencidasFiltrar', { count: kpi?.facturas_vencidas ?? 0, n: cuantasTexto(kpi?.facturas_vencidas ?? 0) })}
          onClick={() => filtrarCartera('vencida')}
        />
        <StatCard
          etiqueta={t('listado.kpis.vence15')}
          icono={DollarSign}
          cargando={!datos}
          valor={fmtKpi(kpi?.vence_15 ?? 0)}
          tono={kpi && kpi.facturas_vence_15 > 0 ? 'exito' : 'neutro'}
          tendencia={kpi && kpi.facturas_vence_15 > 0 ? 'sube' : undefined}
          detalle={t('listado.kpis.nFacturas', { count: kpi?.facturas_vence_15 ?? 0, n: cuantasTexto(kpi?.facturas_vence_15 ?? 0) })}
        />
      </KpiStrip>

      <ListToolbar
        busqueda={
          <SearchInput
            value={l.busqueda}
            onChange={l.setBusqueda}
            cargando={cargando}
            placeholder={t('listado.buscar.placeholder')}
            etiqueta={t('listado.buscar.etiqueta')}
            pistaAtajo={false}
          />
        }
        filtros={
          <FilterPanel conteo={chips.length} onLimpiar={l.limpiarFiltros} textoVerResultados={t('listado.filtros.verN', { count: total, n: entero(total) })}>
            <FormField etiqueta={t('listado.filtros.periodo')}>
              {() => (
                <div className="flex flex-col gap-2">
                  <DateRangeButton
                    valor={periodo}
                    hoy={hoy}
                    max={hoy}
                    etiqueta={t('listado.filtros.periodo')}
                    onValorChange={(r) => l.actualizar({ filtros: { ...sinClaves(l.filtros, ['periodo']), desde: r.desde, hasta: r.hasta } })}
                  />
                  <label className="flex items-center gap-2 text-sm text-fg">
                    <Checkbox checked={todasLasFechas} onCheckedChange={(v) => l.setFiltro('periodo', v === true ? 'todo' : null)} />
                    {t('listado.filtros.todasLasFechas')}
                  </label>
                </div>
              )}
            </FormField>
            <FormField etiqueta={t('listado.filtros.documento')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={l.filtros.estado_doc ?? 'todos'}
                  onValorChange={(v) => l.setFiltro('estado_doc', v === 'todos' ? null : v)}
                  opciones={[
                    { valor: 'todos', etiqueta: t('listado.filtros.todos') },
                    { valor: 'borrador', etiqueta: t('listado.filtros.doc.borrador') },
                    { valor: 'emitida', etiqueta: t('listado.filtros.doc.emitida') },
                    { valor: 'anulada', etiqueta: t('listado.filtros.doc.anulada') },
                  ]}
                />
              )}
            </FormField>
            <FormField etiqueta={t('listado.filtros.pago')}>
              {(c) => (
                <Select value={l.filtros.estado_pago ?? 'todos'} onValueChange={(v) => l.setFiltro('estado_pago', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('listado.filtros.todos')}</SelectItem>
                    {(['abiertas', 'pendiente', 'parcial', 'vencida', 'pagada'] as const).map((e) => (
                      <SelectItem key={e} value={e}>
                        {t(`listado.estadoPago.${e}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <CustomerPicker
              layout="campo"
              cliente={
                l.filtros.cliente
                  ? clienteElegido?.id === l.filtros.cliente
                    ? clienteElegido
                    : { id: l.filtros.cliente, nombre: nombreClienteFiltro ?? t('listado.filtros.clienteChip') }
                  : null
              }
              etiqueta={t('listado.filtros.cliente')}
              buscar={buscarClientes}
              onCambiar={(c) => {
                setClienteElegido(c);
                l.setFiltro('cliente', c.id);
              }}
              onQuitar={() => {
                setClienteElegido(null);
                l.setFiltro('cliente', null);
              }}
            />
            <FormField etiqueta={t('listado.filtros.fe')}>
              {(c) => (
                <Select value={l.filtros.fe ?? 'todos'} onValueChange={(v) => l.setFiltro('fe', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('listado.filtros.todos')}</SelectItem>
                    <SelectItem value="sin">{t('listado.fe.sin')}</SelectItem>
                    {ESTADOS_FE.map((e) => (
                      <SelectItem key={e} value={e}>
                        {t(`listado.fe.${e}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField etiqueta={t('listado.filtros.montoMin')}>
                {(c) => (
                  <input
                    id={c.id}
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={l.filtros.monto_min ?? ''}
                    onChange={(e) => l.setFiltro('monto_min', e.target.value || null)}
                    className={CLASE_CAMPO}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('listado.filtros.montoMax')}>
                {(c) => (
                  <input
                    id={c.id}
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={l.filtros.monto_max ?? ''}
                    onChange={(e) => l.setFiltro('monto_max', e.target.value || null)}
                    className={CLASE_CAMPO}
                  />
                )}
              </FormField>
            </div>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={l.limpiarFiltros} textoLimpiarTodo={t('listado.filtros.limpiar')} />}
      />

      <DataTable
        etiqueta={t('migas.facturasVenta')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.id}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        onFilaClick={(f) => router.push(`${RUTA}/${f.id}`)}
        etiquetaFila={(f) => f.numero ?? t('detalle.sinNumero')}
        acciones={accionesDe}
        accionesRapidas={(f) => (
          <div className="flex items-center">
            <button
              type="button"
              title={puedePagar(f) ? t('acciones.registrarPago') : t('listado.pagoNoDisponible')}
              aria-label={t('listado.pagarFactura', { numero: f.numero ?? '' })}
              disabled={!puedePagar(f)}
              onClick={(e) => {
                e.stopPropagation();
                pagarFactura(f);
              }}
              className={CLASE_ACCION_RAPIDA}
            >
              <Banknote aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              title={t('acciones.imprimir')}
              aria-label={t('listado.imprimirFactura', { numero: f.numero ?? '' })}
              onClick={(e) => {
                e.stopPropagation();
                imprimirDocumento('factura-venta', f.id);
              }}
              className={CLASE_ACCION_RAPIDA}
            >
              <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          </div>
        )}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            icono={Receipt}
            titulo={f.numero ?? t('detalle.sinNumero')}
            subtitulo={f.cliente ?? t('detalle.sinCliente')}
            meta={
              <span className={f.dias_vencida > 0 ? 'text-danger-text' : undefined}>
                {t('listado.venceEl', { fecha: formatDate(f.vencimiento) })}
              </span>
            }
            valor={fmtFila(f, f.saldo > 0 ? f.saldo : f.total)}
            estado={badgeEstado(f)}
            acciones={accionesDe(f)}
            onClick={() => router.push(`${RUTA}/${f.id}`)}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
          />
        )}
        vacio={{
          titulo: t('listado.vacio.titulo'),
          descripcion: t('listado.vacio.descripcion'),
          icono: Receipt,
          accion: permisos.crear ? { etiqueta: t('listado.nueva'), href: `${RUTA}/nuevo`, icono: Plus } : undefined,
        }}
        sinResultados={{ descripcion: t('listado.sinResultados') }}
        error={{ titulo: t('listado.errorCarga') }}
        sinPermiso={{ titulo: t('detalle.sinPermiso'), descripcion: t('detalle.sinPermisoDescripcion') }}
        onLimpiarFiltros={l.limpiarTodo}
        onReintentar={recargar}
        termino={l.busqueda}
        pie={
          <Pagination
            pagina={l.pagina}
            tamano={l.tamano}
            total={total}
            onPaginaChange={l.setPagina}
            onTamanoChange={l.setTamano}
            sustantivo={sustantivo}
            cargando={cargando}
          />
        }
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={total}
        onSeleccionarTodos={seleccionandoTodas ? undefined : () => void seleccionarTodas()}
        sustantivo={sustantivo}
        acciones={accionesLote}
        accionesSecundarias={accionesLoteSecundarias}
        onLimpiar={limpiarSeleccion}
      />

      <DialogoMotivo
        abierto={anularAbierto}
        onAbiertoChange={(v) => {
          if (!anulando) {
            setErrorAnular(null);
            setAnularAbierto(v);
          }
        }}
        titulo={t('listado.lote.anularTitulo', { count: repartoAnulacion.anulables.length, n: entero(repartoAnulacion.anulables.length) })}
        descripcion={t('listado.lote.anularDescripcion')}
        textoConfirmar={t('listado.lote.anularConfirmar', { count: repartoAnulacion.anulables.length, n: entero(repartoAnulacion.anulables.length) })}
        onConfirmar={anularLote}
        tituloConsecuencias={t('anular.consecuenciasTitulo')}
        consecuencias={[t('anular.consecuencias.cartera'), t('anular.consecuencias.asiento'), t('anular.consecuencias.inventario')]}
        motivosRapidos={[t('anular.rapidos.error'), t('anular.rapidos.cliente'), t('anular.rapidos.duplicada')]}
        cargando={anulando}
        error={errorAnular}
        bloqueo={repartoAnulacion.anulables.length === 0 ? t('listado.lote.ningunaAnulable') : null}
      >
        {repartoAnulacion.excluidas.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-subtle px-3 py-2.5 text-[13px]">
            <p className="font-medium text-fg">
              {t('listado.lote.excluidasTitulo', { count: repartoAnulacion.excluidas.length, n: entero(repartoAnulacion.excluidas.length) })}
            </p>
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-fg-secondary">
              {repartoAnulacion.excluidas.map(({ fila, motivo }) => (
                <li key={fila.id}>
                  <span className="font-medium text-fg">{fila.numero ?? t('detalle.sinNumero')}</span> · {t(`anular.bloqueos.${motivo}`)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogoMotivo>

      {pago && (
        <RegistrarPagoConectado
          abierto={pago !== null}
          onAbiertoChange={(v) => !v && setPago(null)}
          destino={pago}
          origen="factura_venta"
          onRegistrado={() => {
            recargar();
            if (pago.tipo === 'tercero') limpiarSeleccion();
          }}
        />
      )}
      {importar && <ImportarCSVDialog isOpen={importar} onClose={() => setImportar(false)} onImportComplete={recargar} />}
    </div>
  );
}
