'use client';

/**
 * Facturas de venta — listado (Figma `421:167503` y estados; móvil `421:171523`).
 *
 * Paginado, filtrado y ordenado en el servidor (`GET /api/facturas-venta` →
 * `fn_facturas_venta_listado`) con el estado en la URL (`useListadoServidor`).
 * KPIs del periodo; «Vencido» filtra. Registrar pago abre el diálogo único
 * (`/api/pagos`); imprimir y PDF van por el motor de documentos.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  BedDouble,
  CalendarClock,
  CircleDollarSign,
  Copy,
  Download,
  Eye,
  FileText,
  Plus,
  Printer,
  Receipt,
  Upload,
  WalletCards,
} from 'lucide-react';
import {
  BranchBadgeActiva,
  BulkActionBar,
  DataTable,
  DateRangeButton,
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
  inicioDeMes,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda, formatNumeroMoneda } from '@/lib/utils/moneda';
import { imprimirDocumento, abrirDocumento } from '@/lib/documents/cliente';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { estadoPagoFactura } from '@/lib/finanzas/ventas/reglasFactura';
import {
  CAMPOS_ORDEN_FACTURAS,
  FILTROS_FACTURAS,
  ordenFacturasRpc,
  type FilaFacturaListado,
  type RespuestaListadoFacturas,
} from '@/lib/finanzas/ventas/listadoFacturas';
import { pedirListadoFacturas } from '@/lib/finanzas/ventas/clienteFacturas';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { ImportarCSVDialog } from '../ImportarCSVDialog';

const RUTA = '/app/finanzas/facturas-venta';

export function ListadoFacturasVenta() {
  const t = useTranslations('facturasVenta');
  const router = useRouter();
  const entero = useFormatoEntero();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const { branchFilter } = useBranch();
  const { formatDate, getToday } = useFormatDate();
  const hoy = getToday();

  const l = useListadoServidor({
    filtros: [...FILTROS_FACTURAS],
    camposOrden: [...CAMPOS_ORDEN_FACTURAS],
    ordenPorDefecto: { campo: 'emision', direccion: 'desc' },
    tamanoPorDefecto: 25,
  });

  const [datos, setDatos] = useState<RespuestaListadoFacturas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [pagarId, setPagarId] = useState<string | null>(null);
  const [importar, setImportar] = useState(false);
  const [exportando, setExportando] = useState(false);

  // Periodo de los KPIs y del filtro de emisión: por defecto el mes en curso.
  const desde = l.filtros.desde ?? inicioDeMes(hoy);
  const hasta = l.filtros.hasta ?? hoy;

  const consulta = useMemo(() => {
    const q = new URLSearchParams();
    if (l.busqueda) q.set('q', l.busqueda);
    for (const [k, v] of Object.entries(l.filtros)) if (v) q.set(k, v);
    if (!l.filtros.desde) q.set('desde', desde);
    if (!l.filtros.hasta) q.set('hasta', hasta);
    if (branchFilter) q.set('sucursal', String(branchFilter));
    q.set('orden', ordenFacturasRpc(l.orden?.campo, l.orden?.direccion));
    q.set('pagina', String(l.pagina));
    q.set('tamano', String(l.tamano));
    return q.toString();
  }, [l.busqueda, l.filtros, l.orden, l.pagina, l.tamano, desde, hasta, branchFilter]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    pedirListadoFacturas(new URLSearchParams(consulta))
      .then((r) => !cancelado && setDatos(r))
      .catch((e: { codigo?: string }) => !cancelado && setError(e?.codigo ?? 'error_desconocido'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [consulta, recarga]);

  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros });
  useEffect(() => setSeleccion(new Set()), [claveCriterios]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;
  const kpi = datos?.kpis.find((k) => k.moneda === moneda.code) ?? datos?.kpis[0] ?? null;
  const fmtKpi = useMemo(() => crearFormateadorMoneda(moneda.paraDocumento(kpi?.moneda)), [moneda, kpi?.moneda]);
  const fmtFila = useCallback((f: FilaFacturaListado, v: number) => crearFormateadorMoneda(moneda.paraDocumento(f.moneda))(v), [moneda]);
  const sustantivo = { singular: t('listado.sustantivo.singular'), plural: t('listado.sustantivo.plural') };

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

  const puedePagar = (f: FilaFacturaListado) => permisos.crear && f.saldo > 0 && ['issued', 'partial', 'paid'].includes(f.estado);

  const accionesDe = (f: FilaFacturaListado): AccionFila[] => [
    { id: 'ver', etiqueta: t('listado.acciones.ver'), icono: Eye, onSelect: () => router.push(`${RUTA}/${f.id}`) },
    { id: 'pagar', etiqueta: t('acciones.registrarPago'), icono: CircleDollarSign, onSelect: () => setPagarId(f.id), oculta: !puedePagar(f) },
    { id: 'imprimir', etiqueta: t('acciones.imprimir'), icono: Printer, onSelect: () => imprimirDocumento('factura-venta', f.id) },
    { id: 'pdf', etiqueta: t('acciones.verPdf'), icono: FileText, onSelect: () => abrirDocumento('factura-venta', f.id) },
    { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => router.push(`${RUTA}/nuevo?duplicar=${f.id}`), oculta: !permisos.crear },
  ];

  const exportar = async (ids?: ReadonlySet<string>) => {
    setExportando(true);
    try {
      const todas: FilaFacturaListado[] = [];
      const base = new URLSearchParams(consulta);
      base.set('tamano', '200');
      for (let pagina = 1; pagina <= 25; pagina++) {
        base.set('pagina', String(pagina));
        const r = await pedirListadoFacturas(base);
        todas.push(...r.filas);
        if (todas.length >= r.total || r.filas.length === 0) break;
      }
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
          t('listado.columnas.estado'),
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
          t(`listado.estadoPago.${estadoPago(f)}`),
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

  const chips: ChipFiltro[] = [
    l.filtros.estado_doc ? { clave: 'estado_doc', etiqueta: t(`listado.filtros.doc.${l.filtros.estado_doc}` as never) } : null,
    l.filtros.estado_pago ? { clave: 'estado_pago', etiqueta: t(`listado.estadoPago.${l.filtros.estado_pago}` as never) } : null,
    l.filtros.fe ? { clave: 'fe', etiqueta: t('listado.filtros.feChip', { estado: l.filtros.fe === 'sin' ? t('dian.sinFe') : t(`dian.estados.${l.filtros.fe}` as never) }) } : null,
    l.filtros.cliente ? { clave: 'cliente', etiqueta: t('listado.filtros.clienteChip') } : null,
    l.filtros.monto_min ? { clave: 'monto_min', etiqueta: t('listado.filtros.montoMinChip', { monto: l.filtros.monto_min }) } : null,
    l.filtros.monto_max ? { clave: 'monto_max', etiqueta: t('listado.filtros.montoMaxChip', { monto: l.filtros.monto_max }) } : null,
  ].filter((c): c is ChipFiltro => c !== null);

  const columnas: ColumnaTabla<FilaFacturaListado>[] = [
    {
      id: 'numero',
      encabezado: t('listado.columnas.numero'),
      ordenable: true,
      variante: 'mono',
      celda: (f) => (
        <span className="flex items-center gap-1.5 font-medium text-fg">
          {f.numero ?? t('detalle.sinNumero')}
          {f.pms && <BedDouble aria-label={t('listado.pms')} className="size-3.5 text-fg-muted" strokeWidth={1.5} />}
        </span>
      ),
    },
    {
      id: 'cliente',
      encabezado: t('listado.columnas.cliente'),
      ordenable: true,
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{f.cliente ?? t('detalle.sinCliente')}</span>
          {f.cliente_doc && <span className="truncate text-xs text-fg-secondary">{f.cliente_doc}</span>}
        </div>
      ),
    },
    { id: 'emision', encabezado: t('listado.columnas.emision'), ordenable: true, ocultarDebajo: 'lg', celda: (f) => <span className="whitespace-nowrap">{formatDate(f.emision)}</span> },
    {
      id: 'vencimiento',
      encabezado: t('listado.columnas.vencimiento'),
      ordenable: true,
      ocultarDebajo: 'md',
      celda: (f) => <span className={f.dias_vencida > 0 ? 'whitespace-nowrap text-danger-text' : 'whitespace-nowrap'}>{formatDate(f.vencimiento)}</span>,
    },
    { id: 'total', encabezado: t('listado.columnas.total'), ordenable: true, variante: 'importe', celda: (f) => fmtFila(f, f.total) },
    {
      id: 'saldo',
      encabezado: t('listado.columnas.saldo'),
      ordenable: true,
      variante: 'importe',
      celda: (f) => <span className={f.saldo > 0 ? 'font-medium text-fg' : 'text-fg-muted'}>{fmtFila(f, f.saldo)}</span>,
    },
    { id: 'estado', encabezado: t('listado.columnas.estado'), celda: badgeEstado },
    {
      id: 'fe',
      encabezado: t('listado.columnas.fe'),
      ocultarDebajo: 'xl',
      celda: (f) => (f.fe ? <StatusBadge estado={f.fe} etiqueta={t(`dian.estados.${f.fe}` as never)} /> : <span className="text-fg-muted">—</span>),
    },
  ];

  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? (l.hayCriterios ? 'sinResultados' : 'vacio') : 'listo';

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('migas.facturasVenta')}
        subtitulo={t('listado.subtitulo', { n: entero(total), count: total })}
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
          subtitulo: t('listado.subtitulo', { n: entero(total), count: total }),
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
        <StatCard etiqueta={t('listado.kpis.facturado')} icono={Receipt} cargando={!datos} valor={fmtKpi(kpi?.facturado ?? 0)} detalle={t('listado.kpis.periodo')} />
        <StatCard
          etiqueta={t('listado.kpis.porCobrar')}
          icono={WalletCards}
          cargando={!datos}
          valor={fmtKpi(kpi?.por_cobrar ?? 0)}
          onClick={() => l.setFiltro('estado_pago', 'abiertas')}
        />
        <StatCard
          etiqueta={t('listado.kpis.vencido')}
          icono={AlertTriangle}
          cargando={!datos}
          valor={fmtKpi(kpi?.vencido ?? 0)}
          tono={kpi && kpi.vencido > 0 ? 'peligro' : 'neutro'}
          detalle={kpi ? t('listado.kpis.vencidasDetalle', { count: kpi.facturas_vencidas, n: entero(kpi.facturas_vencidas) }) : undefined}
          onClick={() => l.setFiltro('estado_pago', 'vencida')}
        />
        <StatCard etiqueta={t('listado.kpis.vence15')} icono={CalendarClock} cargando={!datos} valor={fmtKpi(kpi?.vence_15 ?? 0)} />
      </KpiStrip>

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
            <FormField etiqueta={t('listado.filtros.fe')}>
              {(c) => (
                <Select value={l.filtros.fe ?? 'todos'} onValueChange={(v) => l.setFiltro('fe', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('listado.filtros.todos')}</SelectItem>
                    <SelectItem value="sin">{t('dian.sinFe')}</SelectItem>
                    {(['pending', 'sent', 'accepted', 'rejected', 'failed'] as const).map((e) => (
                      <SelectItem key={e} value={e}>
                        {t(`dian.estados.${e}`)}
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
                    className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
                    className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  />
                )}
              </FormField>
            </div>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
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
        tonoFila={(f) => (f.dias_vencida > 0 ? 'peligro' : undefined)}
        accionesRapidas={(f) => (
          <div className="flex items-center">
            {puedePagar(f) && (
              <button
                type="button"
                title={t('acciones.registrarPago')}
                aria-label={t('listado.pagarFactura', { numero: f.numero ?? '' })}
                onClick={(e) => {
                  e.stopPropagation();
                  setPagarId(f.id);
                }}
                className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <CircleDollarSign aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
            )}
            <button
              type="button"
              title={t('acciones.imprimir')}
              aria-label={t('listado.imprimirFactura', { numero: f.numero ?? '' })}
              onClick={(e) => {
                e.stopPropagation();
                imprimirDocumento('factura-venta', f.id);
              }}
              className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
        sustantivo={sustantivo}
        acciones={[{ id: 'exportar', etiqueta: t('listado.exportar'), icono: Download, onClick: () => void exportar(seleccion), cargando: exportando }]}
        onLimpiar={() => setSeleccion(new Set())}
      />

      {pagarId && (
        <RegistrarPagoConectado
          abierto={pagarId !== null}
          onAbiertoChange={(v) => !v && setPagarId(null)}
          destino={{ tipo: 'factura', id: pagarId }}
          origen="factura_venta"
          onRegistrado={recargar}
        />
      )}
      {importar && <ImportarCSVDialog isOpen={importar} onClose={() => setImportar(false)} onImportComplete={recargar} />}
    </div>
  );
}
