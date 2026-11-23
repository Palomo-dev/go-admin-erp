'use client';

/**
 * Ventas del POS — listado (Figma `329:36071`, filtros `329:111220`, selección
 * `329:111876`, menú `329:112636`, móvil `331:54670`). Paso 15 de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md.
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
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Ban, CircleDollarSign, Copy, Download, Eye, FileText, Globe, Landmark, Percent, Plus, Printer, Receipt, RefreshCw, Undo2 } from 'lucide-react';
import {
  BulkActionBar,
  CampoNumero,
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
import { Badge } from '@/components/ui/badge';
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
import { BADGE_ESTADO_VENTA, ESTADOS_VENTA, ORIGENES_VENTA, TONO_ORIGEN_VENTA } from '@/lib/pos/ventas/estadoVenta';
import { CAMPOS_ORDEN_VENTAS, ESTADOS_PAGO_VENTA } from '@/lib/pos/ventas/filtrosVentas';
import { formatearDocumento, lineaCliente, lineaNumero, mesaEsNumero, nombreImpuesto, partesTransacciones, variacion } from '@/lib/pos/ventas/presentacionVentas';
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
import type { CajeroVentas, CifrasVentas, FilaVenta, ImpuestoVentas } from '@/lib/pos/ventas/listadoServidor';
import { useFechaHoraCaja, useMetodosPagoActivos } from '@/components/pos/cajas/comunesCaja';
import { useEtiquetaMetodoPago } from '@/components/pos/cajas/paymentMethodLabels';
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { AnularVentaDialog } from './AnularVentaDialog';
import { useMigaVentas } from '@/components/pos/useMigaVentas';

const RUTA = '/app/pos/ventas';
const FILTROS = ['origen', 'estado', 'pago', 'metodo', 'cliente', 'cajero', 'desde', 'hasta', 'min', 'max', 'saldo', 'devolucion', 'sync'] as const;
/** Casillas del panel: en la URL como `1`. */
const CASILLAS = ['saldo', 'devolucion', 'sync'] as const;
/** «Todas las sucursales» del selector del header (`ALL_BRANCHES`). */
const TODAS = 'all' as const;

export function VentasPage() {
  const t = useTranslations('posVentas');
  const migaVentas = useMigaVentas();
  const router = useRouter();
  const entero = useFormatoEntero();
  const moneda = useMonedaOrganizacion();
  const { branchFilter, branches, canSelectAll, setSelectedBranch } = useBranch();
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
          t('listado.columnas.origen'),
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
          t(`listado.origenes.${f.origen}`),
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

  const chips: ChipFiltro[] = [
    periodoElegido ? { clave: 'desde', etiqueta: t('listado.filtros.periodoChip', { rango: etiquetaRango({ desde, hasta }, locale) }) } : null,
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
  const subtitulo = [t('listado.encontradas', { n: entero(total), count: total }), textoPeriodo, nombreSucursal].filter(Boolean).join(' · ');
  const subtituloMovil = [t('listado.subtitulo', { n: entero(total), count: total }), nombreSucursal].filter(Boolean).join(' · ');

  const badgeEstado = (f: FilaVenta) => <StatusBadge estado={BADGE_ESTADO_VENTA[f.estado]} etiqueta={t(`estados.${f.estado}`)} />;
  const badgeOrigen = (f: FilaVenta) => (
    <Badge tono={TONO_ORIGEN_VENTA[f.origen]} apariencia="suave" tamano="sm">
      {t(`listado.origenes.${f.origen}`)}
    </Badge>
  );

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
    { id: 'origen', encabezado: t('listado.columnas.origen'), ocultarDebajo: 'lg', celda: badgeOrigen },
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

  // ── KPI (Figma `329:36071`): sobre las ventas listadas ─────────────────────
  const actual = cifras?.actual;
  const anterior = cifras?.anterior ?? null;
  const cambio = actual ? variacion(actual.ventas, anterior?.ventas) : null;
  const detalleCambio = cambio === null ? t('kpis.sinAnterior') : t('kpis.vsAnterior', { pct: `${cambio > 0 ? '+' : ''}${cambio}` });
  const detalleTransacciones = actual
    ? partesTransacciones(actual)
        .map((p) => t(`kpis.partes.${p.clave}`, { n: entero(p.n), count: p.n }))
        .join(' · ')
    : undefined;
  const nombreDeImpuesto = (i: ImpuestoVentas) => {
    const n = nombreImpuesto(i);
    if (n.clase === 'tipoTasa') return t('kpis.impuestoTasa', { tipo: n.tipo, tasa: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n.tasa) });
    if (n.clase === 'nombre') return n.nombre;
    return t('kpis.impuestoSinDetalle');
  };
  const detalleImpuestos =
    actual && actual.impuestos_detalle.length > 0
      ? actual.impuestos_detalle.map((i) => `${nombreDeImpuesto(i)} ${formatear(i.monto)}`).join(' · ')
      : actual
        ? t('kpis.sinImpuestos')
        : undefined;

  const motivoExportar = sinRed ? t('listado.motivos.sin_red') : !permisos.exportar ? t('listado.motivos.sin_permiso') : undefined;
  const accionesCabecera: AccionFila[] = [
    { id: 'pedidosOnline', etiqueta: t('listado.pedidosOnline'), icono: Globe, onSelect: () => router.push('/app/pos/pedidos-online') },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('listado.titulo')}
        subtitulo={subtitulo}
        icono={Receipt}
        cargando={cargando}
        migas={[migaVentas, { etiqueta: t('listado.migas.ventas') }]}
        acciones={
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={recargar} aria-label={t('listado.actualizar')} title={t('listado.actualizar')}>
              <RefreshCw aria-hidden="true" className={`size-4 ${cargando ? 'animate-spin' : ''}`} strokeWidth={1.5} />
            </Button>
            <Button
              variant="outline"
              className="h-10 gap-2"
              onClick={() => void exportar()}
              disabled={exportando || !!motivoExportar}
              title={motivoExportar}
            >
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {exportando ? t('listado.exportando') : t('listado.exportar')}
            </Button>
            {permisos.vender && (
              <Button asChild className="h-10 gap-2">
                <Link href="/app/pos">
                  <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('listado.nueva')}
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
              <Link href="/app/pos" aria-label={t('listado.nueva')}>
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
            etiqueta={t('kpis.ventas')}
            icono={CircleDollarSign}
            cargando={cargandoCifras}
            valor={actual ? formatear(actual.ventas) : '—'}
            tendencia={cambio === null ? undefined : cambio >= 0 ? 'sube' : 'baja'}
            detalle={actual ? detalleCambio : undefined}
          />
          <StatCard
            etiqueta={t('kpis.ticket')}
            icono={Receipt}
            cargando={cargandoCifras}
            valor={actual ? formatear(actual.ticket_promedio) : '—'}
            detalle={actual ? t('kpis.sobreTransacciones', { n: entero(actual.efectivas), count: actual.efectivas }) : undefined}
          />
          <StatCard
            etiqueta={t('kpis.transacciones')}
            icono={ArrowLeftRight}
            cargando={cargandoCifras}
            valor={actual ? entero(actual.transacciones) : '—'}
            detalle={detalleTransacciones}
          />
          <StatCard etiqueta={t('kpis.impuestos')} icono={Percent} cargando={cargandoCifras} valor={actual ? formatear(actual.impuestos) : '—'} detalle={detalleImpuestos} />
        </KpiStrip>
      </div>
      <KpiCompacto
        className="md:hidden"
        etiqueta={t('kpis.etiqueta')}
        cargando={cargandoCifras}
        cifras={[
          { id: 'ventas', etiqueta: t('kpis.ventasCorto'), valor: actual ? formatear(actual.ventas) : '—' },
          { id: 'ticket', etiqueta: t('kpis.ticketCorto'), valor: actual ? formatear(actual.ticket_promedio) : '—' },
          { id: 'transacciones', etiqueta: t('kpis.transaccionesCorto'), valor: actual ? entero(actual.transacciones) : '—' },
        ]}
      />

      <ListToolbar
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
              <FormField etiqueta={t('listado.filtros.origen')}>
                {(c) => (
                  <Select value={l.filtros.origen ?? 'todos'} onValueChange={(v) => l.setFiltro('origen', v === 'todos' ? null : v)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">{t('listado.filtros.todos')}</SelectItem>
                      {ORIGENES_VENTA.map((o) => (
                        <SelectItem key={o} value={o}>
                          {t(`listado.origenes.${o}`)}
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
              <FormField etiqueta={t('listado.filtros.metodo')}>
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
              <FormField etiqueta={t('listado.filtros.desdeHasta')}>
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
              insignia={badgeOrigen(f)}
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
      <AnularVentaDialog
        abierto={anular !== null}
        onAbiertoChange={(v) => !v && setAnular(null)}
        venta={anular ? { id: anular.id, numero: anular.numero, facturada: !!anular.factura_id } : null}
        onAnulada={recargar}
      />
    </div>
  );
}
