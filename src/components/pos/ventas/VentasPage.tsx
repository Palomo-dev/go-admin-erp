'use client';

/**
 * Todas las ventas — la página con que abre el módulo Ventas (Figma 24 Ventas,
 * escritorio 2896:10945, filtros 2898:207872, celular 2898:207555, aprobado el
 * 2026-11-23; antes «Historial de ventas», Figma `329:36071`, filtros
 * `329:111220`, selección `329:111876`, menú `329:112636`, móvil `331:54670`).
 *
 * - Todos los canales: columna, filtro y chips «Canal» (InsigniaCanal) con su
 *   conteo; «Abrir POS» y «Nuevo pedido manual» en la cabecera, «Exportar» en
 *   el menú «⋯». Sin gráficas: van a Reportes (enlace junto a los chips).
 * - StatCards: ventas de hoy (frente al mismo día de la semana pasada a esta
 *   misma hora), del periodo (frente al periodo anterior de días completos o,
 *   si incluye hoy, a esta misma hora; cada etiqueta dice contra qué compara),
 *   por canal y ticket promedio. Son VENTAS NETAS: la regla única de la base
 *   (`fn_ventas_netas_cifras`), la misma del widget de Ventas del Inicio.
 * - Enlaces del Inicio: `?desde=&hasta=&canal=` son filtros de siempre y
 *   `?sucursal=` elige la sede del header una vez (y se quita de la URL).
 *
 * - Solo filas de `sales` (D1): los pedidos web sin venta viven en Pedidos online.
 * - Paginado, filtrado y ordenado en el servidor (`GET /api/pos/ventas`) con el
 *   estado en la URL (`useListadoServidor`): filtros, «atrás» y enlaces funcionan.
 * - Cifras del Figma sobre las ventas listadas (`GET /api/pos/ventas/cifras`,
 *   mismos filtros): ventas del periodo, ticket, transacciones e impuestos.
 * - Filtros del Figma (`329:111220`) en dos columnas; la sucursal del panel es
 *   la MISMA del header (`useBranch`), no un filtro aparte.
 * - Acciones del menú con motivo cuando no aplican (`accionesVenta.ts`) y
 *   permisos resueltos en el servidor (`/api/pos/ventas/permisos`).
 * - Desktop sin red: la réplica local con aviso (`clienteVentas.ts`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, CircleDollarSign, Copy, Download, Eye, FileText, Globe, Landmark, Plus, Printer, Receipt, RefreshCw, ShoppingBag, ShoppingCart, Undo2 } from 'lucide-react';
import {
  BulkActionBar,
  CampoNumero,
  ChipsOpcion,
  CustomerPicker,
  DataTable,
  DateRangeButton,
  FilterChips,
  FilterPanel,
  FormField,
  KpiCompacto,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
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
import { MultiSelect } from '@/components/kit/MultiSelect';
import { simboloMoneda } from '@/components/kit/documento/documentoLineasLogica';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { guardarArchivo, imprimirDocumento } from '@/lib/documents/cliente';
import { filasACsv } from '@/lib/utils/csv';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { listarClientes } from '@/lib/services/clientesListadoService';
import { BADGE_ESTADO_VENTA, ESTADOS_VENTA } from '@/lib/pos/ventas/estadoVenta';
import { CANALES_VENTA, canalSiempreVisible, esCanalVenta, type CanalVenta } from '@/lib/pos/ventas/canalVenta';
import { mismoDiaSemanaAnterior, sucursalDeEnlace } from '@/lib/pos/ventas/filtrosVentas';
import { CAMPOS_ORDEN_VENTAS, ESTADOS_PAGO_VENTA } from '@/lib/pos/ventas/filtrosVentas';
import { formatearDocumento, lineaCliente, lineaNumero, mesaEsNumero, variacion } from '@/lib/pos/ventas/presentacionVentas';
import { accionesDeVenta, destinoCobro, SIN_PERMISOS_VENTAS, type DisponibilidadAccion, type PermisosVentas } from '@/lib/pos/ventas/accionesVenta';
import {
  ErrorPeticionVentas,
  pedirCajerosVentas,
  pedirCifrasVentas,
  pedirExportacionVentas,
  pedirPermisosVentas,
  pedirVentas,
  type PaginaVentasCliente,
} from '@/lib/pos/ventas/clienteVentas';
import type { CajeroVentas, CifrasVentas, FilaVenta } from '@/lib/pos/ventas/listadoServidor';
import { useFechaHoraCaja, useMetodosPagoActivos } from '@/components/pos/cajas/comunesCaja';
import { useEtiquetaMetodoPago } from '@/components/pos/cajas/paymentMethodLabels';
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { AnularVentaDialog } from './AnularVentaDialog';
import { InsigniaCanal, useNombreCanal } from './InsigniaCanal';
import { DialogoPedidoManual } from '@/components/pos/pedidos-online/manual/DialogoPedidoManual';
import { usePaginasModulo } from '@/lib/navigation/NavegacionVisible';
import { rutaGrupo } from '@/components/reportes/rutasReportes';
import { useMigaVentas } from '@/components/pos/useMigaVentas';
import { FiltroConteo } from '@/components/finanzas/recaudo/FiltroConteo';
import { useFiltroDelDia } from '@/components/finanzas/recaudo/useFiltroDelDia';
import { useMediosRecaudo } from '@/components/finanzas/recaudo/useMediosRecaudo';
import { leerPagosRecaudo } from '@/lib/services/recaudoService';
import { filtrarPorMedio, mediosDeCodigos, resumenRecaudo, type PagoRecaudo } from '@/lib/finanzas/recaudo/recaudoPorMedio';
import { getDateRange } from '@/lib/utils/dateRanges';

const RUTA = '/app/pos/ventas';
const FILTROS = ['canal', 'origen', 'estado', 'pago', 'metodo', 'cliente', 'cajero', 'desde', 'hasta', 'min', 'max', 'saldo', 'devolucion', 'sync'] as const;
/** Casillas del panel: en la URL como `1`. */
const CASILLAS = ['saldo', 'devolucion', 'sync'] as const;
/** «Todas las sucursales» del selector del header (`ALL_BRANCHES`). */
const TODAS = 'all' as const;

/**
 * Fecha y medio de pago recordados por persona SOLO durante el día (decisión 2, Figma
 * 3300-420477 › 07). Se aplican al entrar si la URL no trae los suyos.
 */
interface FiltroRecordadoVentas {
  desde: string;
  hasta: string;
  metodo: string;
}
const RECORDADO_POR_DEFECTO: FiltroRecordadoVentas = { desde: '', hasta: '', metodo: '' };

export function VentasPage() {
  const t = useTranslations('posVentas');
  const tv = useTranslations('ventas.todas');
  const tRec = useTranslations('recaudoMedio');
  const nombreCanal = useNombreCanal();
  const paginasVentas = usePaginasModulo('pos');
  const paginasReportes = usePaginasModulo('reports');
  const migaVentas = useMigaVentas();
  const router = useRouter();
  const entero = useFormatoEntero();
  const moneda = useMonedaOrganizacion();
  const { branchFilter, branches, canSelectAll, setSelectedBranch, isLoading: cargandoSucursales } = useBranch();
  const parametrosUrl = useSearchParams();
  const sucursalEnlace = parametrosUrl?.get('sucursal') ?? null;
  const { getToday, timezone } = useFormatDate();
  const locale = useLocaleIntl();
  const fechaHora = useFechaHoraCaja();
  const etiquetaMetodo = useEtiquetaMetodoPago();
  const metodosActivos = useMetodosPagoActivos();
  const hoy = getToday();

  const l = useListadoServidor({
    filtros: [...FILTROS],
    camposOrden: [...CAMPOS_ORDEN_VENTAS],
    ordenPorDefecto: { campo: 'fecha', direccion: 'desc' },
    tamanoPorDefecto: 20,
  });

  const [datos, setDatos] = useState<PaginaVentasCliente | null>(null);
  const [cifras, setCifras] = useState<CifrasVentas | null>(null);
  const [cargandoCifras, setCargandoCifras] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [permisos, setPermisos] = useState<PermisosVentas>(SIN_PERMISOS_VENTAS);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState(false);
  const [cobrar, setCobrar] = useState<FilaVenta | null>(null);
  const [anular, setAnular] = useState<FilaVenta | null>(null);
  const [clienteElegido, setClienteElegido] = useState<ClientePicker | null>(null);
  const [cajeros, setCajeros] = useState<CajeroVentas[]>([]);
  const [manualAbierto, setManualAbierto] = useState(false);
  const canalFiltro: CanalVenta | null = esCanalVenta(l.filtros.canal) ? l.filtros.canal : null;
  const mediosRecaudo = useMediosRecaudo();
  const [pagosRecaudo, setPagosRecaudo] = useState<PagoRecaudo[] | null>(null);
  const [errorRecaudo, setErrorRecaudo] = useState(false);

  // Recordar fecha y medio durante el día: al entrar sin ellos en la URL, se aplican los de hoy.
  const recordado = useFiltroDelDia<FiltroRecordadoVentas>('pos-ventas', RECORDADO_POR_DEFECTO);
  const [recordadoAplicado, setRecordadoAplicado] = useState(false);
  useEffect(() => {
    if (!recordado.listo || recordadoAplicado) return;
    setRecordadoAplicado(true);
    const v = recordado.valor;
    if (l.filtros.desde || l.filtros.hasta || l.filtros.metodo) return;
    const extra: Record<string, string> = {};
    if (v.desde && v.hasta) {
      extra.desde = v.desde;
      extra.hasta = v.hasta;
    }
    if (v.metodo) extra.metodo = v.metodo;
    if (Object.keys(extra).length > 0) l.actualizar({ filtros: { ...l.filtros, ...extra } });
  }, [recordado.listo, recordado.valor, recordadoAplicado, l]);
  const { setValor: guardarRecordado } = recordado;
  useEffect(() => {
    if (!recordadoAplicado) return;
    guardarRecordado({ desde: l.filtros.desde ?? '', hasta: l.filtros.hasta ?? '', metodo: l.filtros.metodo ?? '' });
  }, [recordadoAplicado, l.filtros.desde, l.filtros.hasta, l.filtros.metodo, guardarRecordado]);

  // Periodo por defecto: el mes en curso de la organización (el mismo de las cifras).
  const desde = l.filtros.desde ?? inicioDeMes(hoy);
  const hasta = l.filtros.hasta ?? hoy;
  /** Hay un periodo elegido a mano (distinto del mes en curso): se ve como chip. */
  const periodoElegido = !!(l.filtros.desde || l.filtros.hasta);

  /** Búsqueda, filtros, periodo y sucursal: lo mismo para la tabla y para las cifras. */
  const consultaFiltros = useMemo(() => {
    const q = new URLSearchParams();
    if (l.busqueda) q.set('q', l.busqueda);
    for (const [k, v] of Object.entries(l.filtros)) if (v) q.set(k, v);
    q.set('desde', desde);
    q.set('hasta', hasta);
    if (branchFilter) q.set('sucursal', String(branchFilter));
    return q.toString();
  }, [l.busqueda, l.filtros, desde, hasta, branchFilter]);

  const consulta = useMemo(() => {
    const q = new URLSearchParams(consultaFiltros);
    q.set('orden', l.orden?.campo ?? 'fecha');
    q.set('dir', l.orden?.direccion ?? 'desc');
    q.set('pagina', String(l.pagina));
    q.set('tamano', String(l.tamano));
    return q.toString();
  }, [consultaFiltros, l.orden, l.pagina, l.tamano]);

  useEffect(() => {
    let vigente = true;
    pedirCajerosVentas(new URLSearchParams(branchFilter ? { sucursal: String(branchFilter) } : {}))
      .then((c) => vigente && setCajeros(c))
      .catch(() => vigente && setCajeros([]));
    return () => {
      vigente = false;
    };
  }, [branchFilter]);

  useEffect(() => {
    let vigente = true;
    pedirPermisosVentas()
      .then((p) => vigente && setPermisos(p))
      .catch(() => vigente && setPermisos(SIN_PERMISOS_VENTAS));
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    pedirVentas(new URLSearchParams(consulta))
      .then((r) => vigente && setDatos(r))
      .catch((e) => vigente && setError(e instanceof ErrorPeticionVentas ? e.codigo : 'lectura_fallida'))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [consulta, recarga]);

  useEffect(() => {
    let vigente = true;
    setCargandoCifras(true);
    pedirCifrasVentas(new URLSearchParams(consultaFiltros))
      .then((c) => vigente && setCifras(c))
      .catch(() => vigente && setCifras(null))
      .finally(() => vigente && setCargandoCifras(false));
    return () => {
      vigente = false;
    };
  }, [consultaFiltros, recarga]);

  // Recaudado del periodo (Figma 3300-420726): pagos aprobados por su fecha de pago, con el
  // medio elegido. No es venta: incluye anticipos de contraentrega (2805) en una línea aparte.
  useEffect(() => {
    let vigente = true;
    let organizacion: number | null = null;
    try {
      organizacion = getOrganizationId();
    } catch {
      organizacion = null;
    }
    if (!organizacion) return;
    const r = getDateRange(desde, hasta, timezone);
    leerPagosRecaudo(organizacion, { desde: r.start, hasta: r.end }, branchFilter ?? null)
      .then((p) => {
        if (!vigente) return;
        setPagosRecaudo(p);
        setErrorRecaudo(false);
      })
      .catch(() => {
        if (!vigente) return;
        setPagosRecaudo(null);
        setErrorRecaudo(true);
      });
    return () => {
      vigente = false;
    };
  }, [desde, hasta, timezone, branchFilter, recarga]);

  // Enlace con sede (Inicio › «Ventas por sede»): elige esa sede en el header
  // una sola vez y se quita `sucursal` de la URL; los demás filtros se quedan.
  useEffect(() => {
    if (!sucursalEnlace || cargandoSucursales) return;
    const id = sucursalDeEnlace(sucursalEnlace, branches.map((b) => b.id).filter((x): x is number => typeof x === 'number'));
    if (id !== null && id !== branchFilter) setSelectedBranch(id);
    const q = new URLSearchParams(parametrosUrl?.toString() ?? '');
    q.delete('sucursal');
    router.replace(q.toString() ? `${RUTA}?${q.toString()}` : RUTA, { scroll: false });
  }, [sucursalEnlace, cargandoSucursales, branches, branchFilter, setSelectedBranch, parametrosUrl, router]);

  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros, s: branchFilter });
  useEffect(() => setSeleccion(new Set()), [claveCriterios]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;
  const sinRed = datos?.sinRed === true;
  const formatear = useCallback((v: number) => moneda.formatear(v), [moneda]);
  const simbolo = useMemo(() => simboloMoneda(moneda), [moneda]);
  const sustantivo = { singular: t('listado.sustantivo.singular'), plural: t('listado.sustantivo.plural') };

  const numeroDe = (f: FilaVenta) => f.numero ?? t('listado.sinNumero');
  /** «Efectivo + Tarjeta»; sin pagos y con saldo, «Crédito». */
  const metodosDe = (f: FilaVenta) =>
    f.metodos.length ? f.metodos.map(etiquetaMetodo).join(' + ') : f.saldo > 0.005 && f.estado !== 'anulada' ? t('listado.credito') : null;
  const motivo = (d: DisponibilidadAccion) => (d.motivo ? t(`listado.motivos.${d.motivo}`) : undefined);

  const accionesDe = (f: FilaVenta): AccionFila[] => {
    const a = accionesDeVenta(f, permisos);
    const destino = destinoCobro(f);
    return [
      { id: 'ver', etiqueta: t('listado.acciones.ver'), icono: Eye, onSelect: () => router.push(`${RUTA}/${f.id}`) },
      {
        id: 'factura',
        etiqueta: t('listado.acciones.verFactura'),
        icono: FileText,
        onSelect: () => f.factura_id && router.push(`/app/finanzas/facturas-venta/${f.factura_id}`),
        oculta: !f.factura_id,
      },
      {
        id: 'cxc',
        etiqueta: t('listado.acciones.verCxc'),
        icono: Landmark,
        onSelect: () => f.cxc_id && router.push(`/app/finanzas/cuentas-por-cobrar/${f.cxc_id}`),
        oculta: !f.cxc_id,
      },
      {
        id: 'cobrar',
        etiqueta: t('listado.acciones.cobrar'),
        icono: CircleDollarSign,
        onSelect: () => destino && setCobrar(f),
        oculta: !a.cobrar.visible,
        deshabilitada: !a.cobrar.habilitada,
        motivo: motivo(a.cobrar),
      },
      {
        id: 'devolver',
        etiqueta: t('listado.acciones.devolver'),
        icono: Undo2,
        onSelect: () => router.push(`${RUTA}/${f.id}?devolver=1`),
        oculta: !a.devolver.visible,
        deshabilitada: !a.devolver.habilitada,
        motivo: motivo(a.devolver),
      },
      {
        id: 'imprimir',
        etiqueta: t('listado.acciones.imprimir'),
        icono: Printer,
        onSelect: () => f.factura_id && imprimirDocumento('factura-venta', f.factura_id, { papel: '80mm' }),
        deshabilitada: !a.imprimir.habilitada,
        motivo: motivo(a.imprimir),
      },
      {
        id: 'duplicar',
        etiqueta: t('listado.acciones.duplicar'),
        icono: Copy,
        onSelect: () => router.push(`${RUTA}/nuevo?duplicar=${f.id}`),
        deshabilitada: !a.duplicar.habilitada,
        motivo: motivo(a.duplicar),
      },
      {
        id: 'anular',
        etiqueta: t('listado.acciones.anular'),
        icono: Ban,
        destructiva: true,
        separadorAntes: true,
        onSelect: () => setAnular(f),
        oculta: !a.anular.visible,
        deshabilitada: !a.anular.habilitada,
        motivo: motivo(a.anular),
      },
    ];
  };

  const exportar = async (ids?: ReadonlySet<string>) => {
    setExportando(true);
    try {
      const q = new URLSearchParams(consulta);
      q.delete('pagina');
      q.delete('tamano');
      const r = await pedirExportacionVentas(q);
      const elegidas = ids ? r.filas.filter((f) => ids.has(f.id)) : r.filas;
      const csv = filasACsv(
        [
          t('listado.columnas.fecha'),
          t('listado.columnas.numero'),
          tv('columnaCanal'),
          t('listado.columnas.cliente'),
          t('listado.columnas.documentoCliente'),
          t('listado.columnas.sucursal'),
          t('listado.columnas.cajero'),
          t('listado.columnas.metodos'),
          t('listado.columnas.total'),
          t('listado.columnas.saldo'),
          t('listado.columnas.estado'),
        ],
        elegidas.map((f) => [
          fechaHora(f.fecha),
          f.numero,
          nombreCanal(f.canal ?? 'pos'),
          f.cliente?.nombre ?? t('listado.consumidorFinal'),
          f.cliente?.documento,
          f.sucursal.nombre,
          f.cajero.nombre,
          metodosDe(f),
          f.total,
          f.saldo,
          t(`estados.${f.estado}`),
        ]),
      );
      guardarArchivo(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `ventas_${desde}_${hasta}.csv`);
      if (r.truncado) toastError(t('listado.exportarTruncado', { n: entero(r.filas.length) }));
    } catch (e) {
      toastError(e instanceof ErrorPeticionVentas && e.codigo === 'sin_permiso_exportar' ? t('listado.motivos.sin_permiso') : t('listado.exportarError'));
    } finally {
      setExportando(false);
    }
  };

  const buscarClientes = useCallback(async (texto: string, _senal: AbortSignal, _filtros: readonly string[], desde: number) => {
    const r = await listarClientes({
      organizationId: getOrganizationId(),
      branchId: null,
      criterios: { busqueda: texto },
      orden: null,
      desde,
      tamano: 10,
    });
    const items: ClientePicker[] = r.filas.map((c) => ({ id: c.id, nombre: c.full_name ?? c.company_name ?? '', documento: c.identification_number, correo: c.email, telefono: c.phone }));
    return { items, total: r.total };
  }, []);

  // Sin filtro de cliente no hay nombre que buscar: con `clienteElegido` nulo y
  // el filtro sin definir, `undefined === undefined` leía `.nombre` de null.
  const nombreClienteFiltro = !l.filtros.cliente
    ? null
    : clienteElegido && clienteElegido.id === l.filtros.cliente
      ? clienteElegido.nombre
      : filas.find((f) => f.cliente?.id === l.filtros.cliente)?.cliente?.nombre ?? null;

  const sucursalActiva = branchFilter ? branches.find((b) => b.id === branchFilter) ?? null : null;
  const nombreSucursal = sucursalActiva?.name ?? (branchFilter ? null : t('listado.todasSucursales'));
  const nombreCajeroFiltro = l.filtros.cajero ? cajeros.find((c) => c.id === l.filtros.cajero)?.nombre ?? null : null;
  const metodosFiltro = l.filtros.metodo ? l.filtros.metodo.split(',').filter(Boolean) : [];
  // El medio de los métodos elegidos (Bold = bold_link + bold_qr + Nequi/PSE cobrados por Bold).
  const mediosFiltro = mediosDeCodigos(metodosFiltro);
  const recaudo = pagosRecaudo ? resumenRecaudo(filtrarPorMedio(pagosRecaudo, mediosFiltro)) : null;
  const nombreMediosFiltro = mediosFiltro.map(mediosRecaudo.nombre).join(', ');
  const opcionesMetodo = [...new Set(['cash', ...metodosActivos, ...metodosFiltro])].map((m) => {
    const delCodigo = (pagosRecaudo ?? []).filter((p) => p.metodo === m);
    const monto = delCodigo.reduce((a, p) => a + p.monto, 0);
    return { valor: m, etiqueta: etiquetaMetodo(m), detalle: pagosRecaudo ? `${delCodigo.length} · ${formatear(monto)}` : undefined };
  });

  const chips: ChipFiltro[] = [
    periodoElegido ? { clave: 'desde', etiqueta: t('listado.filtros.periodoChip', { rango: etiquetaRango({ desde, hasta }, locale) }) } : null,
    canalFiltro ? { clave: 'canal', etiqueta: tv('filtros.canalChip', { canal: nombreCanal(canalFiltro) }) } : null,
    l.filtros.origen ? { clave: 'origen', etiqueta: t('listado.filtros.origenChip', { origen: t(`listado.origenes.${l.filtros.origen}` as never) }) } : null,
    // La sucursal del header cuenta como filtro (Figma): quitarla vuelve a «Todas».
    canSelectAll && sucursalActiva ? { clave: 'sucursal', etiqueta: t('listado.filtros.sucursalChip', { sucursal: sucursalActiva.name }) } : null,
    l.filtros.estado ? { clave: 'estado', etiqueta: t(`estados.${l.filtros.estado}` as never) } : null,
    l.filtros.pago ? { clave: 'pago', etiqueta: t('listado.filtros.pagoChip', { pago: t(`listado.pagos.${l.filtros.pago}` as never) }) } : null,
    metodosFiltro.length ? { clave: 'metodo', etiqueta: t('listado.filtros.metodoChip', { metodo: metodosFiltro.map(etiquetaMetodo).join(', ') }) } : null,
    l.filtros.cliente ? { clave: 'cliente', etiqueta: nombreClienteFiltro ? t('listado.filtros.clienteChipNombre', { nombre: nombreClienteFiltro }) : t('listado.filtros.clienteChip') } : null,
    l.filtros.cajero ? { clave: 'cajero', etiqueta: nombreCajeroFiltro ? t('listado.filtros.cajeroChipNombre', { nombre: nombreCajeroFiltro }) : t('listado.filtros.cajeroChip') } : null,
    l.filtros.min ? { clave: 'min', etiqueta: t('listado.filtros.minChip', { monto: formatear(Number(l.filtros.min)) }) } : null,
    l.filtros.max ? { clave: 'max', etiqueta: t('listado.filtros.maxChip', { monto: formatear(Number(l.filtros.max)) }) } : null,
    ...CASILLAS.map((c) => (l.filtros[c] ? { clave: c, etiqueta: t(`listado.filtros.casillas.${c}`) } : null)),
  ].filter((c): c is ChipFiltro => c !== null);

  // El chip del periodo representa `desde` y `hasta` a la vez: quitarlo vuelve al mes en curso.
  const quitarChip = (clave: string) => {
    if (clave === 'desde') l.actualizar({ filtros: Object.fromEntries(Object.entries(l.filtros).filter(([k]) => k !== 'desde' && k !== 'hasta')) });
    else if (clave === 'sucursal') setSelectedBranch(TODAS);
    else l.setFiltro(clave, null);
  };
  const limpiarFiltros = () => {
    l.limpiarFiltros();
    if (canSelectAll && sucursalActiva) setSelectedBranch(TODAS);
  };

  // Subtítulo (Figma): «1.312 ventas encontradas · 01–22 de septiembre de 2026 · Sucursal Principal».
  const textoPeriodo = etiquetaRangoLarga({ desde, hasta }, locale);
  const textoCanal = canalFiltro ? nombreCanal(canalFiltro) : tv('todosLosCanales');
  const subtitulo = [t('listado.encontradas', { n: entero(total), count: total }), textoPeriodo, nombreSucursal, textoCanal].filter(Boolean).join(' · ');
  const subtituloMovil = [t('listado.subtitulo', { n: entero(total), count: total }), nombreSucursal].filter(Boolean).join(' · ');

  const badgeEstado = (f: FilaVenta) => <StatusBadge estado={BADGE_ESTADO_VENTA[f.estado]} etiqueta={t(`estados.${f.estado}`)} />;
  const insigniaCanal = (f: FilaVenta) => <InsigniaCanal canal={f.canal ?? 'pos'} />;

  /** Segunda línea bajo el N.º (Figma): saldo, NC, «pedido web», «local-…» o el id corto. */
  const textoLineaNumero = (f: FilaVenta): { texto: string; tono?: 'advertencia' } => {
    const x = lineaNumero(f);
    switch (x.tipo) {
      case 'local':
        return { texto: x.texto };
      case 'saldo':
        return { texto: t('listado.saldoLinea', { monto: formatear(x.monto) }), tono: 'advertencia' };
      case 'notaCredito':
        return { texto: x.numero ?? t('listado.notasCredito', { count: x.cantidad }) };
      case 'pedidoWeb':
        return { texto: t('listado.pedidoWeb') };
      default:
        return { texto: x.texto };
    }
  };

  const nombreMesa = (mesa: string | null) => (mesa ? (mesaEsNumero(mesa) ? t('listado.mesaN', { n: mesa.trim() }) : mesa) : t('listado.origenes.mesa'));

  /** Segunda línea bajo el cliente (Figma): «CC 1.020.334.556», «NIT …», «Mesa 7 · Laura R.» o el teléfono. */
  const textoLineaCliente = (f: FilaVenta): string | null => {
    const x = lineaCliente(f);
    if (!x) return null;
    if (x.tipo === 'mesa') return [nombreMesa(x.mesa), x.cajero].filter(Boolean).join(' · ');
    if (x.tipo === 'documento') return [x.tipoDocumento, formatearDocumento(x.numero, entero)].filter(Boolean).join(' ');
    return x.telefono;
  };

  /**
   * Texto de columna secundaria con tope de ancho y «…» (el completo en la
   * ayuda). En una tabla `auto` un `truncate` sin tope no recorta: la columna
   * crece hasta el texto entero y la tabla desborda.
   */
  const textoCorto = (texto: string | null | undefined) =>
    texto ? (
      <span className="block max-w-[8.5rem] truncate" title={texto}>
        {texto}
      </span>
    ) : (
      <span className="text-fg-muted">—</span>
    );

  const columnas: ColumnaTabla<FilaVenta>[] = [
    {
      id: 'fecha',
      encabezado: t('listado.columnas.fecha'),
      ordenable: true,
      // Fecha y hora en dos líneas (Figma): la columna queda angosta.
      celda: (f) => (
        <div className="flex flex-col whitespace-nowrap" title={fechaHora(f.fecha)}>
          <span>{formatDateTimeInTz(f.fecha, timezone, { locale, day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
          <span className="text-xs text-fg-secondary">{formatDateTimeInTz(f.fecha, timezone, { locale, hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      ),
    },
    {
      id: 'numero',
      encabezado: t('listado.columnas.numero'),
      ordenable: true,
      // Sin partir: «FACT-0707» no se corta en el guion.
      className: 'whitespace-nowrap',
      celda: (f) => {
        const linea = textoLineaNumero(f);
        return (
          <div className="flex flex-col">
            <span className="font-mono font-medium text-fg">{numeroDe(f)}</span>
            <span className={`max-w-[8.5rem] truncate text-xs ${linea.tono === 'advertencia' ? 'text-warning-text' : 'text-fg-secondary'}`} title={linea.tono ? undefined : f.id}>
              {linea.texto}
            </span>
          </div>
        );
      },
    },
    { id: 'canal', encabezado: tv('columnaCanal'), ocultarDebajo: 'lg', celda: insigniaCanal },
    {
      id: 'cliente',
      encabezado: t('listado.columnas.cliente'),
      ordenable: true,
      celda: (f) => {
        const linea = textoLineaCliente(f);
        return (
          <div className="flex max-w-[13rem] flex-col">
            <span className="truncate text-fg">{f.cliente?.nombre ?? t('listado.consumidorFinal')}</span>
            <span className="truncate text-xs text-fg-secondary">{linea ?? '—'}</span>
          </div>
        );
      },
    },
    { id: 'sucursal', encabezado: t('listado.columnas.sucursal'), ocultarDebajo: 'xl', celda: (f) => textoCorto(f.sucursal.nombre) },
    { id: 'cajero', encabezado: t('listado.columnas.cajero'), ocultarDebajo: 'xl', celda: (f) => textoCorto(f.cajero.nombre) },
    { id: 'metodos', encabezado: t('listado.columnas.metodos'), ocultarDebajo: 'lg', celda: (f) => textoCorto(metodosDe(f)) },
    {
      id: 'total',
      encabezado: t('listado.columnas.total'),
      ordenable: true,
      variante: 'importe',
      celda: (f) => <span className={f.estado === 'anulada' ? 'text-fg-muted line-through' : 'text-fg'}>{formatear(f.total)}</span>,
    },
    { id: 'estado', encabezado: t('listado.columnas.estado'), className: 'whitespace-nowrap', celda: badgeEstado },
  ];

  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? (l.hayCriterios || chips.length > 0 ? 'sinResultados' : 'vacio') : 'listo';

  // ── KPI (Figma 24 Ventas, 2896:10952): hoy, periodo, por canal y ticket ────
  const actual = cifras?.actual;
  const cifrasHoy = cifras?.hoy ?? null;
  const cambioHoy = cifrasHoy ? variacion(cifrasHoy.ventas, cifrasHoy.anterior) : null;
  const comparacion = cifras?.comparacion ?? null;
  const cambioPeriodo = actual && cifras?.anterior ? variacion(actual.ventas, cifras.anterior.ventas) : null;
  // «+8 % vs. domingo pasado»: el día de la semana del comparativo, en el idioma de la persona.
  const [anioDia, mesDia, numDia] = mismoDiaSemanaAnterior(hoy).split('-').map(Number);
  const diaComparado = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(anioDia, mesDia - 1, numDia)));
  const detalleHoy = cifrasHoy
    ? [
        tv('kpis.hoyVentas', { n: entero(cifrasHoy.transacciones), count: cifrasHoy.transacciones }),
        // Contra qué compara: el mismo día de la semana pasada hasta esta misma hora.
        cambioHoy === null
          ? null
          : tv(cifrasHoy.aEstaHora ? 'kpis.vsDiaHora' : 'kpis.vsDia', { pct: `${cambioHoy > 0 ? '+' : ''}${cambioHoy}`, dia: diaComparado }),
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;
  // Contra qué compara el periodo: los días anteriores de igual duración (a esta hora si incluye hoy).
  const textoComparacionPeriodo =
    cambioPeriodo !== null && comparacion
      ? tv(comparacion.aEstaHora ? 'kpis.vsPeriodoHora' : 'kpis.vsPeriodo', {
          pct: `${cambioPeriodo > 0 ? '+' : ''}${cambioPeriodo}`,
          rango: etiquetaRango({ desde: comparacion.desde, hasta: comparacion.hasta }, locale),
        })
      : null;
  const detallePeriodo = actual
    ? [tv('kpis.periodoVentas', { n: entero(actual.efectivas), count: actual.efectivas }), textoComparacionPeriodo ?? etiquetaRango({ desde, hasta }, locale)].join(' · ')
    : undefined;

  // Por canal: con todos los filtros menos el de canal (chips y StatCard).
  const porCanal = cifras?.por_canal ?? [];
  const totalCanales = porCanal.reduce((suma, c) => suma + c.transacciones, 0);
  const pct = (n: number) => (totalCanales > 0 ? Math.round((n / totalCanales) * 100) : 0);
  const canalPrincipal = porCanal[0] ?? null;
  const valorPorCanal = canalPrincipal ? tv('kpis.canalPct', { canal: nombreCanal(canalPrincipal.canal), pct: pct(canalPrincipal.transacciones) }) : '—';
  const detallePorCanal = cifras
    ? porCanal.length > 1
      ? porCanal
          .slice(1)
          .map((c) => tv('kpis.canalPct', { canal: nombreCanal(c.canal), pct: pct(c.transacciones) }))
          .join(' · ')
      : porCanal.length === 1
        ? tv('kpis.unSoloCanal')
        : tv('kpis.sinVentas')
    : undefined;
  const conteoCanal = (c: CanalVenta) => porCanal.find((x) => x.canal === c)?.transacciones ?? 0;
  // Marketplace solo aparece cuando tiene ventas (decisión 9 de la lámina «Qué cambia»).
  const canalesOfrecidos = CANALES_VENTA.filter((c) => canalSiempreVisible(c) || conteoCanal(c) > 0 || c === canalFiltro);
  const opcionesCanal = [
    { valor: 'todos' as const, etiqueta: tv('chips.todos', { n: entero(totalCanales) }) },
    ...canalesOfrecidos.map((c) => ({ valor: c, etiqueta: tv('chips.canal', { canal: nombreCanal(c), n: entero(conteoCanal(c)) }) })),
  ];

  const motivoExportar = sinRed ? t('listado.motivos.sin_red') : !permisos.exportar ? t('listado.motivos.sin_permiso') : undefined;
  // «Exportar» pasa al menú «⋯» (Figma 24): sigue disponible igual que antes.
  const accionesCabecera: AccionFila[] = [
    {
      id: 'exportar',
      etiqueta: exportando ? t('listado.exportando') : t('listado.exportar'),
      icono: Download,
      onSelect: () => void exportar(),
      deshabilitada: exportando || !!motivoExportar,
      motivo: motivoExportar,
    },
    { id: 'pedidosOnline', etiqueta: t('listado.pedidosOnline'), icono: Globe, onSelect: () => router.push('/app/pos/pedidos-online') },
  ];
  // «Nuevo pedido manual» se ofrece a quien ve Pedidos online (el servidor vuelve a validar el permiso).
  const puedePedidoManual = paginasVentas === null || paginasVentas.some((p) => p.href === '/app/pos/pedidos-online');
  const verReportes = paginasReportes !== null && paginasReportes.length > 0;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('listado.titulo')}
        subtitulo={subtitulo}
        icono={Receipt}
        cargando={cargando}
        migas={[migaVentas, { etiqueta: t('listado.titulo') }]}
        acciones={
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={recargar} aria-label={t('listado.actualizar')} title={t('listado.actualizar')}>
              <RefreshCw aria-hidden="true" className={`size-4 ${cargando ? 'animate-spin' : ''}`} strokeWidth={1.5} />
            </Button>
            {puedePedidoManual && (
              <Button variant="outline" className="h-10 gap-2" onClick={() => setManualAbierto(true)}>
                <ShoppingBag aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {tv('nuevoPedidoManual')}
              </Button>
            )}
            {permisos.vender && (
              <Button asChild className="h-10 gap-2">
                <Link href="/app/pos">
                  <ShoppingCart aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {tv('abrirPos')}
                </Link>
              </Button>
            )}
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('listado.titulo')} acciones={accionesCabecera} />
          </>
        }
        movil={{
          subtitulo: subtituloMovil,
          accion: permisos.vender ? (
            <Button asChild variant="ghost" size="icon" className="size-10">
              <Link href="/app/pos" aria-label={tv('abrirPos')}>
                <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </Link>
            </Button>
          ) : undefined,
        }}
      />

      {sinRed && (
        <p role="status" className="rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-sm text-warning-text">
          {t('listado.avisoSinRed')}
        </p>
      )}

      <div className="hidden md:block">
        <KpiStrip etiqueta={t('kpis.etiqueta')}>
          <StatCard
            etiqueta={tRec('ventas.netasHoy')}
            icono={CircleDollarSign}
            cargando={cargandoCifras}
            valor={cifrasHoy ? formatear(cifrasHoy.ventas) : '—'}
            tendencia={cambioHoy === null ? undefined : cambioHoy >= 0 ? 'sube' : 'baja'}
            detalle={detalleHoy}
          />
          <StatCard
            etiqueta={tRec('ventas.netasPeriodo')}
            icono={CircleDollarSign}
            cargando={cargandoCifras}
            valor={actual ? formatear(actual.ventas) : '—'}
            tendencia={cambioPeriodo === null ? undefined : cambioPeriodo >= 0 ? 'sube' : 'baja'}
            detalle={detallePeriodo}
          />
          <StatCard
            etiqueta={mediosFiltro.length === 1 ? tRec('ventas.recaudadoPor', { medio: nombreMediosFiltro }) : tRec('ventas.recaudado')}
            icono={CircleDollarSign}
            cargando={!recaudo && !errorRecaudo}
            valor={recaudo ? formatear(recaudo.total.monto) : '—'}
            tono={errorRecaudo ? 'advertencia' : 'neutro'}
            detalle={
              errorRecaudo
                ? tRec('errorLectura')
                : recaudo && recaudo.porTipo.anticipo.monto > 0
                  ? tRec('ventas.incluyeAnticipos', { monto: formatear(recaudo.porTipo.anticipo.monto) })
                  : recaudo
                    ? tRec('ventas.recaudadoDetalle', { n: entero(recaudo.total.pagos), count: recaudo.total.pagos })
                    : undefined
            }
          />
          <StatCard etiqueta={tv('kpis.porCanal')} icono={ShoppingCart} cargando={cargandoCifras} valor={valorPorCanal} detalle={detallePorCanal} />
          <StatCard
            etiqueta={t('kpis.ticket')}
            icono={CircleDollarSign}
            cargando={cargandoCifras}
            valor={actual ? formatear(actual.ticket_promedio) : '—'}
            detalle={actual ? (canalFiltro ? tv('kpis.ticketCanal', { canal: nombreCanal(canalFiltro) }) : tv('kpis.ticketTodos')) : undefined}
          />
        </KpiStrip>
      </div>
      <KpiCompacto
        className="md:hidden"
        etiqueta={t('kpis.etiqueta')}
        cargando={cargandoCifras}
        cifras={[
          { id: 'hoy', etiqueta: tv('kpis.hoyCorto'), valor: cifrasHoy ? formatear(cifrasHoy.ventas) : '—' },
          { id: 'ventas', etiqueta: t('kpis.ventasCorto'), valor: actual ? formatear(actual.ventas) : '—' },
          { id: 'ticket', etiqueta: t('kpis.ticketCorto'), valor: actual ? formatear(actual.ticket_promedio) : '—' },
        ]}
      />

      {/* Chips de canal con su conteo (Figma 2898:13733) y el enlace a las gráficas, que viven en Reportes. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChipsOpcion<'todos' | CanalVenta>
          etiqueta={tv('chips.etiqueta')}
          opciones={opcionesCanal}
          valor={canalFiltro ?? 'todos'}
          onValorChange={(v) => l.setFiltro('canal', v === 'todos' ? null : v)}
        />
        {verReportes && (
          <Link href={rutaGrupo('ventas')} className="text-sm font-medium text-brand hover:underline">
            {tv('verEnReportes')}
          </Link>
        )}
      </div>

      <ListToolbar
        antes={
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <DateRangeButton
              valor={{ desde, hasta }}
              hoy={hoy}
              max={hoy}
              etiqueta={t('listado.filtros.periodo')}
              onValorChange={(r) => l.actualizar({ filtros: { ...l.filtros, desde: r.desde, hasta: r.hasta } })}
            />
            <FiltroConteo
              titulo={t('listado.filtros.metodo')}
              resumen={tRec('filtro.medioResumen', { valor: metodosFiltro.length > 0 ? metodosFiltro.map(etiquetaMetodo).join(', ') : tRec('filtro.todos') })}
              opciones={opcionesMetodo}
              valores={metodosFiltro}
              onAplicar={(v) => l.setFiltro('metodo', v.length ? v.join(',') : null)}
              buscador
              nota={tRec('ventas.notaMedio')}
            />
          </div>
        }
        busqueda={
          <SearchInput
            value={l.busqueda}
            onChange={l.setBusqueda}
            cargando={cargando}
            placeholder={t('listado.buscar.placeholder')}
            etiqueta={t('listado.buscar.etiqueta')}
          />
        }
        filtros={
          <FilterPanel
            ancho="amplio"
            conteo={chips.length}
            onLimpiar={limpiarFiltros}
            nota={t('listado.filtros.nota')}
            textoVerResultados={t('listado.filtros.verN', { count: total, n: entero(total) })}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField etiqueta={tv('filtros.canal')}>
                {(c) => (
                  <Select value={canalFiltro ?? 'todos'} onValueChange={(v) => l.setFiltro('canal', v === 'todos' ? null : v)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">{tv('filtros.todosLosCanales')}</SelectItem>
                      {canalesOfrecidos.map((x) => (
                        <SelectItem key={x} value={x}>
                          {nombreCanal(x)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('listado.filtros.sucursal')}>
                {(c) => (
                  <Select
                    value={branchFilter ? String(branchFilter) : TODAS}
                    onValueChange={(v) => setSelectedBranch(v === TODAS ? TODAS : Number(v))}
                    disabled={!canSelectAll && branches.length <= 1}
                  >
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(canSelectAll || !branchFilter) && <SelectItem value={TODAS}>{t('listado.todasSucursales')}</SelectItem>}
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('listado.filtros.estado')}>
                {(c) => (
                  <Select value={l.filtros.estado ?? 'todos'} onValueChange={(v) => l.setFiltro('estado', v === 'todos' ? null : v)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">{t('listado.filtros.todosEstados')}</SelectItem>
                      {ESTADOS_VENTA.map((e) => (
                        <SelectItem key={e} value={e}>
                          {t(`estados.${e}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('listado.filtros.cajero')}>
                {(c) => (
                  <Select value={l.filtros.cajero ?? 'todos'} onValueChange={(v) => l.setFiltro('cajero', v === 'todos' ? null : v)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">{t('listado.filtros.todos')}</SelectItem>
                      {l.filtros.cajero && !cajeros.some((x) => x.id === l.filtros.cajero) && (
                        <SelectItem value={l.filtros.cajero}>{t('listado.filtros.cajeroChip')}</SelectItem>
                      )}
                      {cajeros.map((x) => (
                        <SelectItem key={x.id} value={x.id}>
                          {x.nombre ?? t('listado.sinNombre')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('listado.filtros.pago')}>
                {(c) => (
                  <Select value={l.filtros.pago ?? 'todos'} onValueChange={(v) => l.setFiltro('pago', v === 'todos' ? null : v)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">{t('listado.filtros.todos')}</SelectItem>
                      {ESTADOS_PAGO_VENTA.map((p) => (
                        <SelectItem key={p} value={p}>
                          {t(`listado.pagos.${p}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('listado.filtros.metodo')} className="sm:hidden">
                {(c) => (
                  <MultiSelect
                    id={c.id}
                    aria-labelledby={c.idEtiqueta}
                    opciones={[...new Set(['cash', ...metodosActivos, ...metodosFiltro])].map((m) => ({ valor: m, etiqueta: etiquetaMetodo(m) }))}
                    valores={metodosFiltro}
                    onValoresChange={(v) => l.setFiltro('metodo', v.length ? v.join(',') : null)}
                    placeholder={t('listado.filtros.metodoPlaceholder')}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('listado.filtros.desdeHasta')} className="sm:hidden">
                {() => (
                  <DateRangeButton
                    valor={{ desde, hasta }}
                    hoy={hoy}
                    max={hoy}
                    etiqueta={t('listado.filtros.periodo')}
                    onValorChange={(r) => l.actualizar({ filtros: { ...l.filtros, desde: r.desde, hasta: r.hasta } })}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('listado.filtros.min')}>
                {(c) => (
                  <CampoNumero
                    id={c.id}
                    aria-describedby={c['aria-describedby']}
                    valor={l.filtros.min ? Number(l.filtros.min) : null}
                    onValorChange={(v) => l.setFiltro('min', v === null ? null : String(v))}
                    minimo={0}
                    prefijo={simbolo}
                  />
                )}
              </FormField>
              <div className="sm:col-span-2">
                <CustomerPicker
                  layout="campo"
                  cliente={l.filtros.cliente ? (clienteElegido?.id === l.filtros.cliente ? clienteElegido : { id: l.filtros.cliente, nombre: nombreClienteFiltro ?? t('listado.filtros.clienteChip') }) : null}
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
              </div>
            </div>
            <fieldset className="flex flex-wrap gap-x-5 gap-y-3 border-t border-line pt-4">
              <legend className="sr-only">{t('listado.filtros.casillas.titulo')}</legend>
              {CASILLAS.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                  <Checkbox checked={l.filtros[c] === '1'} onCheckedChange={(v) => l.setFiltro(c, v === true ? '1' : null)} />
                  {t(`listado.filtros.casillas.${c}`)}
                </label>
              ))}
            </fieldset>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={limpiarFiltros} />}
      />

      <DataTable
        etiqueta={t('listado.titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.id}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        onFilaClick={(f) => router.push(`${RUTA}/${f.id}`)}
        etiquetaFila={(f) => numeroDe(f)}
        acciones={accionesDe}
        tonoFila={(f) => (f.estado === 'anulada' ? 'peligro' : undefined)}
        tarjetaMovil={(f, ctx) => {
          const saldo = f.saldo > 0.005 && f.estado !== 'anulada' ? t('listado.saldoLinea', { monto: formatear(f.saldo) }) : null;
          return (
            <ListCard
              titulo={numeroDe(f)}
              insignia={insigniaCanal(f)}
              subtitulo={f.cliente?.nombre ?? t('listado.consumidorFinal')}
              meta={<span>{[fechaHora(f.fecha), metodosDe(f), saldo, f.cajero.nombre, f.sucursal.nombre].filter(Boolean).join(' · ')}</span>}
              valor={formatear(f.total)}
              estado={badgeEstado(f)}
              acciones={accionesDe(f)}
              onClick={() => router.push(`${RUTA}/${f.id}`)}
              seleccionable={ctx.modoSeleccion}
              seleccionado={ctx.seleccionado}
              onSeleccionChange={ctx.alternar}
            />
          );
        }}
        vacio={{
          titulo: t('listado.vacio.titulo'),
          descripcion: t('listado.vacio.descripcion'),
          icono: Receipt,
          accion: permisos.vender ? { etiqueta: t('listado.nueva'), href: '/app/pos', icono: Plus } : undefined,
        }}
        sinResultados={{ descripcion: t('listado.sinResultados') }}
        error={{ titulo: t('listado.errorCarga') }}
        sinPermiso={{ titulo: t('listado.sinPermiso.titulo'), descripcion: t('listado.sinPermiso.descripcion') }}
        onLimpiarFiltros={() => {
          l.limpiarTodo();
          if (canSelectAll && sucursalActiva) setSelectedBranch(TODAS);
        }}
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
        sustantivo={sustantivo}
        acciones={[
          {
            id: 'exportar',
            etiqueta: t('listado.exportar'),
            icono: Download,
            onClick: () => void exportar(seleccion),
            cargando: exportando,
            deshabilitada: !!motivoExportar,
            motivo: motivoExportar,
          },
        ]}
        onLimpiar={() => setSeleccion(new Set())}
      />

      {cobrar && destinoCobro(cobrar) && (
        <RegistrarPagoConectado
          abierto
          onAbiertoChange={(v) => !v && setCobrar(null)}
          destino={destinoCobro(cobrar)!}
          origen="venta_pos"
          onRegistrado={recargar}
        />
      )}
      {/* Se monta al abrirlo: es el mismo diálogo de Pedidos online (pedidosManualesServer), sin lógica nueva. */}
      {puedePedidoManual && manualAbierto && (
        <DialogoPedidoManual organizationId={getOrganizationId()} abierto={manualAbierto} onAbiertoChange={setManualAbierto} onCreado={recargar} />
      )}
      <AnularVentaDialog
        abierto={anular !== null}
        onAbiertoChange={(v) => !v && setAnular(null)}
        venta={anular ? { id: anular.id, numero: anular.numero, facturada: !!anular.factura_id } : null}
        onAnulada={recargar}
      />
    </div>
  );
}
