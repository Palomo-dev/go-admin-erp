'use client';

/**
 * Ventas del POS — listado (Figma `329:36071`, filtros `329:111220`, selección
 * `329:111876`, menú `329:112636`, móvil `331:54670`). Paso 15 de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md.
 *
 * - Solo filas de `sales` (D1): los pedidos web sin venta viven en Pedidos online.
 * - Paginado, filtrado y ordenado en el servidor (`GET /api/pos/ventas`) con el
 *   estado en la URL (`useListadoServidor`): filtros, «atrás» y enlaces funcionan.
 * - Cifras con criterio de caja (D2, `GET /api/pos/ventas/cifras`).
 * - Acciones del menú con motivo cuando no aplican (`accionesVenta.ts`) y
 *   permisos resueltos en el servidor (`/api/pos/ventas/permisos`).
 * - Desktop sin red: la réplica local con aviso (`clienteVentas.ts`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, CircleDollarSign, Copy, Download, Eye, FileText, HandCoins, Plus, Printer, Receipt, RefreshCw, Undo2, Wallet } from 'lucide-react';
import {
  BranchBadgeActiva,
  BulkActionBar,
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
  SegmentedControl,
  StatCard,
  StatusBadge,
  inicioDeMes,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ClientePicker,
  type ColumnaTabla,
} from '@/components/kit';
import { ChipDocumento } from '@/components/kit/documento';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { guardarArchivo, imprimirDocumento } from '@/lib/documents/cliente';
import { filasACsv } from '@/lib/utils/csv';
import { listarClientes } from '@/lib/services/clientesListadoService';
import { BADGE_ESTADO_VENTA, ESTADOS_VENTA, ORIGENES_VENTA } from '@/lib/pos/ventas/estadoVenta';
import { CAMPOS_ORDEN_VENTAS } from '@/lib/pos/ventas/filtrosVentas';
import { accionesDeVenta, destinoCobro, SIN_PERMISOS_VENTAS, type DisponibilidadAccion, type PermisosVentas } from '@/lib/pos/ventas/accionesVenta';
import {
  ErrorPeticionVentas,
  pedirCifrasVentas,
  pedirExportacionVentas,
  pedirPermisosVentas,
  pedirVentas,
  type PaginaVentasCliente,
} from '@/lib/pos/ventas/clienteVentas';
import type { CifrasVentas, FilaVenta } from '@/lib/pos/ventas/listadoServidor';
import { useFechaHoraCaja, useMetodosPagoActivos } from '@/components/pos/cajas/comunesCaja';
import { useEtiquetaMetodoPago } from '@/components/pos/cajas/paymentMethodLabels';
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { AnularVentaDialog } from './AnularVentaDialog';

const RUTA = '/app/pos/ventas';
const FILTROS = ['origen', 'estado', 'metodo', 'cliente', 'cajero', 'desde', 'hasta', 'min', 'max'] as const;
const CLASE_CAMPO =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
const CLASE_ICONO =
  'flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

function variacion(actual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

export function VentasPage() {
  const t = useTranslations('posVentas');
  const router = useRouter();
  const entero = useFormatoEntero();
  const moneda = useMonedaOrganizacion();
  const { branchFilter } = useBranch();
  const { getToday } = useFormatDate();
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

  // Periodo por defecto: el mes en curso de la organización (el mismo de las cifras).
  const desde = l.filtros.desde ?? inicioDeMes(hoy);
  const hasta = l.filtros.hasta ?? hoy;

  const consulta = useMemo(() => {
    const q = new URLSearchParams();
    if (l.busqueda) q.set('q', l.busqueda);
    for (const [k, v] of Object.entries(l.filtros)) if (v) q.set(k, v);
    q.set('desde', desde);
    q.set('hasta', hasta);
    if (branchFilter) q.set('sucursal', String(branchFilter));
    q.set('orden', l.orden?.campo ?? 'fecha');
    q.set('dir', l.orden?.direccion ?? 'desc');
    q.set('pagina', String(l.pagina));
    q.set('tamano', String(l.tamano));
    return q.toString();
  }, [l.busqueda, l.filtros, l.orden, l.pagina, l.tamano, desde, hasta, branchFilter]);

  const consultaCifras = useMemo(() => {
    const q = new URLSearchParams({ desde, hasta });
    if (branchFilter) q.set('sucursal', String(branchFilter));
    return q.toString();
  }, [desde, hasta, branchFilter]);

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
    pedirCifrasVentas(new URLSearchParams(consultaCifras))
      .then((c) => vigente && setCifras(c))
      .catch(() => vigente && setCifras(null))
      .finally(() => vigente && setCargandoCifras(false));
    return () => {
      vigente = false;
    };
  }, [consultaCifras, recarga]);

  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros, s: branchFilter });
  useEffect(() => setSeleccion(new Set()), [claveCriterios]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;
  const sinRed = datos?.sinRed === true;
  const formatear = useCallback((v: number) => moneda.formatear(v), [moneda]);
  const sustantivo = { singular: t('listado.sustantivo.singular'), plural: t('listado.sustantivo.plural') };

  const numeroDe = (f: FilaVenta) => f.numero ?? t('listado.sinNumero');
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
          f.metodos.map(etiquetaMetodo).join(', '),
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

  // Sin filtro de cliente no hay nombre que buscar: con `clienteElegido` nulo y
  // el filtro sin definir, `undefined === undefined` leía `.nombre` de null.
  const nombreClienteFiltro = !l.filtros.cliente
    ? null
    : clienteElegido && clienteElegido.id === l.filtros.cliente
      ? clienteElegido.nombre
      : filas.find((f) => f.cliente?.id === l.filtros.cliente)?.cliente?.nombre ?? null;

  const chips: ChipFiltro[] = [
    l.filtros.origen ? { clave: 'origen', etiqueta: t('listado.filtros.origenChip', { origen: t(`listado.origenes.${l.filtros.origen}` as never) }) } : null,
    l.filtros.estado ? { clave: 'estado', etiqueta: t(`estados.${l.filtros.estado}` as never) } : null,
    l.filtros.metodo ? { clave: 'metodo', etiqueta: t('listado.filtros.metodoChip', { metodo: etiquetaMetodo(l.filtros.metodo) }) } : null,
    l.filtros.cliente ? { clave: 'cliente', etiqueta: nombreClienteFiltro ? t('listado.filtros.clienteChipNombre', { nombre: nombreClienteFiltro }) : t('listado.filtros.clienteChip') } : null,
    l.filtros.cajero ? { clave: 'cajero', etiqueta: t('listado.filtros.cajeroChip') } : null,
    l.filtros.min ? { clave: 'min', etiqueta: t('listado.filtros.minChip', { monto: formatear(Number(l.filtros.min)) }) } : null,
    l.filtros.max ? { clave: 'max', etiqueta: t('listado.filtros.maxChip', { monto: formatear(Number(l.filtros.max)) }) } : null,
  ].filter((c): c is ChipFiltro => c !== null);

  const badgeEstado = (f: FilaVenta) => <StatusBadge estado={BADGE_ESTADO_VENTA[f.estado]} etiqueta={t(`estados.${f.estado}`)} />;
  const badgeOrigen = (f: FilaVenta) => (
    <span className="inline-flex h-6 items-center rounded-md border border-line bg-surface-subtle px-1.5 text-xs font-medium text-fg-secondary">
      {t(`listado.origenes.${f.origen}`)}
    </span>
  );
  const documentos = (f: FilaVenta) => (
    <div className="flex flex-wrap items-center gap-1">
      {f.factura_id && f.numero && f.tipo_numero === 'factura' && (
        <ChipDocumento tipo="factura" numero={f.numero} href={`/app/finanzas/facturas-venta/${f.factura_id}`} anulado={f.estado === 'anulada'} />
      )}
      {f.cxc_id && <ChipDocumento tipo="cuentaPorCobrar" numero={t('listado.cxc')} href={`/app/finanzas/cuentas-por-cobrar/${f.cxc_id}`} />}
      {f.notas_credito > 0 && <ChipDocumento tipo="notaCredito" numero={t('listado.notasCredito', { count: f.notas_credito })} />}
      {f.web_order_id && f.tipo_numero === 'pedido' && f.numero && <ChipDocumento tipo="pedido" numero={f.numero} />}
    </div>
  );

  const columnas: ColumnaTabla<FilaVenta>[] = [
    { id: 'fecha', encabezado: t('listado.columnas.fecha'), ordenable: true, celda: (f) => <span className="whitespace-nowrap">{fechaHora(f.fecha)}</span> },
    {
      id: 'numero',
      encabezado: t('listado.columnas.numero'),
      ordenable: true,
      variante: 'mono',
      celda: (f) => <span className="font-medium text-fg">{numeroDe(f)}</span>,
    },
    { id: 'origen', encabezado: t('listado.columnas.origen'), ocultarDebajo: 'lg', celda: badgeOrigen },
    {
      id: 'cliente',
      encabezado: t('listado.columnas.cliente'),
      ordenable: true,
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{f.cliente?.nombre ?? t('listado.consumidorFinal')}</span>
          {f.cliente?.documento && <span className="truncate text-xs text-fg-secondary">{f.cliente.documento}</span>}
        </div>
      ),
    },
    { id: 'sucursal', encabezado: t('listado.columnas.sucursal'), ocultarDebajo: 'xl', celda: (f) => <span className="truncate">{f.sucursal.nombre ?? '—'}</span> },
    { id: 'cajero', encabezado: t('listado.columnas.cajero'), ocultarDebajo: 'xl', celda: (f) => <span className="truncate">{f.cajero.nombre ?? '—'}</span> },
    {
      id: 'metodos',
      encabezado: t('listado.columnas.metodos'),
      ocultarDebajo: 'lg',
      celda: (f) => <span className="truncate">{f.metodos.length ? f.metodos.map(etiquetaMetodo).join(', ') : '—'}</span>,
    },
    { id: 'documentos', encabezado: t('listado.columnas.documentos'), ocultarDebajo: 'xl', celda: documentos },
    {
      id: 'total',
      encabezado: t('listado.columnas.total'),
      ordenable: true,
      variante: 'importe',
      celda: (f) => (
        <div className="flex flex-col items-end">
          <span className={f.estado === 'anulada' ? 'text-fg-muted line-through' : 'text-fg'}>{formatear(f.total)}</span>
          {f.saldo > 0.005 && f.estado !== 'anulada' && <span className="text-xs text-warning-text">{t('listado.saldo', { monto: formatear(f.saldo) })}</span>}
        </div>
      ),
    },
    { id: 'estado', encabezado: t('listado.columnas.estado'), celda: badgeEstado },
  ];

  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? (l.hayCriterios ? 'sinResultados' : 'vacio') : 'listo';

  const actual = cifras?.actual;
  const anterior = cifras?.anterior;
  const cambioNeto = actual && anterior ? variacion(actual.neto, anterior.neto) : null;
  const detalleCambio = cambioNeto === null ? t('kpis.sinAnterior') : t('kpis.vsAnterior', { pct: `${cambioNeto > 0 ? '+' : ''}${cambioNeto}` });

  const botonExportar: AccionFila = {
    id: 'exportar',
    etiqueta: t('listado.exportar'),
    icono: Download,
    onSelect: () => void exportar(),
    deshabilitada: exportando || !permisos.exportar || sinRed,
    motivo: sinRed ? t('listado.motivos.sin_red') : !permisos.exportar ? t('listado.motivos.sin_permiso') : t('listado.exportando'),
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('listado.titulo')}
        subtitulo={t('listado.subtitulo', { n: entero(total), count: total })}
        icono={Receipt}
        cargando={cargando}
        migas={[{ etiqueta: t('listado.migas.pos'), href: '/app/pos' }, { etiqueta: t('listado.titulo') }]}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            <button type="button" onClick={recargar} aria-label={t('listado.actualizar')} title={t('listado.actualizar')} className={`${CLASE_ICONO} size-10 border border-line-strong bg-surface`}>
              <RefreshCw aria-hidden="true" className={`size-4 ${cargando ? 'animate-spin' : ''}`} strokeWidth={1.5} />
            </button>
            {permisos.vender && (
              <Link
                href="/app/pos"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('listado.nueva')}
              </Link>
            )}
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('listado.titulo')} acciones={[botonExportar]} />
          </>
        }
        movil={{
          subtitulo: t('listado.subtitulo', { n: entero(total), count: total }),
          accion: permisos.vender ? (
            <Link
              href="/app/pos"
              aria-label={t('listado.nueva')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </Link>
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
            etiqueta={t('kpis.cobrado')}
            icono={HandCoins}
            cargando={cargandoCifras}
            valor={actual ? formatear(actual.neto) : '—'}
            tendencia={cambioNeto === null ? undefined : cambioNeto >= 0 ? 'sube' : 'baja'}
            detalle={actual ? detalleCambio : undefined}
          />
          <StatCard
            etiqueta={t('kpis.cobros')}
            icono={Wallet}
            cargando={cargandoCifras}
            valor={actual ? entero(actual.num_cobros) : '—'}
            detalle={actual ? t('kpis.ventasCobradas', { n: entero(actual.ventas_cobradas), count: actual.ventas_cobradas }) : undefined}
          />
          <StatCard etiqueta={t('kpis.ticket')} icono={Receipt} cargando={cargandoCifras} valor={actual ? formatear(actual.ticket_promedio) : '—'} />
          <StatCard
            etiqueta={t('kpis.reintegros')}
            icono={Undo2}
            cargando={cargandoCifras}
            valor={actual ? formatear(actual.reintegros) : '—'}
            tono={actual && actual.reintegros > 0 ? 'advertencia' : 'neutro'}
            detalle={actual ? t('kpis.facturado', { monto: formatear(actual.facturado) }) : undefined}
          />
        </KpiStrip>
      </div>
      <KpiCompacto
        className="md:hidden"
        etiqueta={t('kpis.etiqueta')}
        cargando={cargandoCifras}
        cifras={[
          { id: 'cobrado', etiqueta: t('kpis.cobrado'), valor: actual ? formatear(actual.neto) : '—' },
          { id: 'cobros', etiqueta: t('kpis.cobros'), valor: actual ? entero(actual.num_cobros) : '—' },
          { id: 'ticket', etiqueta: t('kpis.ticket'), valor: actual ? formatear(actual.ticket_promedio) : '—' },
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
            accesorio={
              <DateRangeButton
                valor={{ desde, hasta }}
                hoy={hoy}
                max={hoy}
                etiqueta={t('listado.filtros.periodo')}
                onValorChange={(r) => l.actualizar({ filtros: { ...l.filtros, desde: r.desde, hasta: r.hasta } })}
              />
            }
          />
        }
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} textoVerResultados={t('listado.filtros.verN', { count: total, n: entero(total) })}>
            <FormField etiqueta={t('listado.filtros.origen')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={l.filtros.origen ?? 'todos'}
                  onValorChange={(v) => l.setFiltro('origen', v === 'todos' ? null : v)}
                  opciones={[
                    { valor: 'todos', etiqueta: t('listado.filtros.todos') },
                    ...ORIGENES_VENTA.map((o) => ({ valor: o, etiqueta: t(`listado.origenes.${o}`) })),
                  ]}
                />
              )}
            </FormField>
            <FormField etiqueta={t('listado.filtros.estado')}>
              {(c) => (
                <Select value={l.filtros.estado ?? 'todos'} onValueChange={(v) => l.setFiltro('estado', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('listado.filtros.todos')}</SelectItem>
                    {ESTADOS_VENTA.map((e) => (
                      <SelectItem key={e} value={e}>
                        {t(`estados.${e}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('listado.filtros.metodo')}>
              {(c) => (
                <Select value={l.filtros.metodo ?? 'todos'} onValueChange={(v) => l.setFiltro('metodo', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('listado.filtros.todos')}</SelectItem>
                    {['cash', ...metodosActivos].map((m) => (
                      <SelectItem key={m} value={m}>
                        {etiquetaMetodo(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
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
            <div className="grid grid-cols-2 gap-3">
              <FormField etiqueta={t('listado.filtros.min')}>
                {(c) => (
                  <input id={c.id} type="number" min={0} inputMode="decimal" value={l.filtros.min ?? ''} onChange={(e) => l.setFiltro('min', e.target.value || null)} className={CLASE_CAMPO} />
                )}
              </FormField>
              <FormField etiqueta={t('listado.filtros.max')}>
                {(c) => (
                  <input id={c.id} type="number" min={0} inputMode="decimal" value={l.filtros.max ?? ''} onChange={(e) => l.setFiltro('max', e.target.value || null)} className={CLASE_CAMPO} />
                )}
              </FormField>
            </div>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
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
        accionesRapidas={(f) => {
          const imprimible = accionesDeVenta(f, permisos).imprimir;
          return (
            <button
              type="button"
              disabled={!imprimible.habilitada}
              title={imprimible.habilitada ? t('listado.acciones.imprimir') : motivo(imprimible)}
              aria-label={t('listado.imprimirVenta', { numero: numeroDe(f) })}
              onClick={(e) => {
                e.stopPropagation();
                if (f.factura_id) imprimirDocumento('factura-venta', f.factura_id, { papel: '80mm' });
              }}
              className={CLASE_ICONO}
            >
              <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          );
        }}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            icono={Receipt}
            titulo={numeroDe(f)}
            subtitulo={f.cliente?.nombre ?? t('listado.consumidorFinal')}
            meta={
              <span>
                {fechaHora(f.fecha)} · {t(`listado.origenes.${f.origen}`)}
              </span>
            }
            valor={formatear(f.total)}
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
          accion: permisos.vender ? { etiqueta: t('listado.nueva'), href: '/app/pos', icono: Plus } : undefined,
        }}
        sinResultados={{ descripcion: t('listado.sinResultados') }}
        error={{ titulo: t('listado.errorCarga') }}
        sinPermiso={{ titulo: t('listado.sinPermiso.titulo'), descripcion: t('listado.sinPermiso.descripcion') }}
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
        sustantivo={sustantivo}
        acciones={[
          {
            id: 'exportar',
            etiqueta: t('listado.exportar'),
            icono: Download,
            onClick: () => void exportar(seleccion),
            cargando: exportando,
            deshabilitada: !permisos.exportar || sinRed,
            motivo: sinRed ? t('listado.motivos.sin_red') : !permisos.exportar ? t('listado.motivos.sin_permiso') : undefined,
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
