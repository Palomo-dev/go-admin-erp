'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, BookOpen, CheckCircle2, Download, FileDown, History, RefreshCw, Scale } from 'lucide-react';
import {
  BranchBadgeActiva,
  DataTable,
  DateRangeButton,
  Dialogo,
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
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { MultiSelect } from '@/components/kit/MultiSelect';
import { BadgeOrigenMovimiento, useDocumentosMovimiento } from '@/components/kit/inventario';
import { useEtiquetaRango } from '@/components/kit/useIdiomaKit';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId, getOrganizationName } from '@/lib/hooks/useOrganization';
import type { LoteDisponible } from '@/lib/inventario/nucleo/tipos';
import { ORIGENES_MOVIMIENTO_STOCK, metaOrigen } from '@/lib/inventario/origenesMovimientoStock';
import { usePermisosInventario } from '@/lib/inventario/usePermisosInventario';
import { filasACsv } from '@/lib/utils/csv';
import { listarKardex, type FiltrosKardex, type RespuestaKardex } from '@/lib/services/kardexService';
import { listarStock, type MovimientoFila, type StockFila } from '@/lib/services/stockService';
import { cn } from '@/utils/Utils';
import { lotesDeProducto } from '../lotes/LotesService';
import { CeldaCantidad, CeldaDocumento, CeldaFecha, useAccionesMovimiento } from '../movimientos/piezas';
import { SelectorProductoStock } from '../stock/SelectorProductoStock';
import { nombreArchivo } from '../stock/logica';
import { useAlcanceSucursales, useCantidadStock, useMensajeErrorInventario } from '../stock/useInventarioB1';
import { DialogoDescuadres } from './DialogoDescuadres';

const LIMITE_EXPORTAR = 20000;
type AlcanceExportar = 'filtros' | 'pagina' | 'historico';

/**
 * Kardex (Figma «Kardex» 516:270497): entradas y salidas con el saldo corrido
 * por producto, calculado en el servidor sobre toda la historia del alcance
 * (`fn_kardex_saldo_corrido`), y el cuadre contra las existencias
 * (`fn_kardex_descuadres`). Ya no exige `?producto=`: sin producto muestra el
 * kardex de todos, cada fila con el saldo de su producto.
 */
export function KardexPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations('inventarioKardex');
  const to = useTranslations('inventario.origenes');
  const tp = useTranslations('inventario.permisos');
  const td = useTranslations('inventario.documentos');
  const tv = useTranslations('inventario.vencimiento');
  const tm = useTranslations('inventarioMovimientos');
  const cantidad = useCantidadStock();
  const moneda = useMonedaOrganizacion();
  const etiquetaRango = useEtiquetaRango();
  const { getToday, formatDate, formatTime, formatPlain } = useFormatDate();
  const mensajeError = useMensajeErrorInventario();
  const permisos = usePermisosInventario();
  const alcance = useAlcanceSucursales();
  const organizacionId = getOrganizationId();
  const hoy = getToday();

  const l = useListadoServidor({
    filtros: ['producto', 'lote', 'desde', 'hasta', 'origen', 'usuario', 'direccion'],
    camposOrden: ['fecha'],
    ordenPorDefecto: { campo: 'fecha', direccion: 'desc' },
    tamanoPorDefecto: 25,
  });

  const [datos, setDatos] = useState<RespuestaKardex | null>(null);
  const [cargando, setCargando] = useState(true);
  const [estadoError, setEstadoError] = useState<'error' | 'sinPermiso' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [productoFila, setProductoFila] = useState<StockFila | null>(null);
  const [lotes, setLotes] = useState<LoteDisponible[]>([]);
  const [verDescuadres, setVerDescuadres] = useState(() => params?.get('descuadres') === '1');
  const [exportarAbierto, setExportarAbierto] = useState(false);
  const [alcanceExportar, setAlcanceExportar] = useState<AlcanceExportar>('filtros');
  const [exportando, setExportando] = useState(false);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  const producto = /^\d+$/.test(l.filtros.producto ?? '') ? Number(l.filtros.producto) : undefined;
  const lote = /^\d+$/.test(l.filtros.lote ?? '') ? Number(l.filtros.lote) : undefined;
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(l.filtros.desde ?? '') ? l.filtros.desde : undefined;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(l.filtros.hasta ?? '') ? l.filtros.hasta : undefined;
  const origenes = (l.filtros.origen ?? '').split(',').filter((o) => (ORIGENES_MOVIMIENTO_STOCK as readonly string[]).includes(o));
  const usuario = /^[0-9a-f-]{36}$/i.test(l.filtros.usuario ?? '') ? l.filtros.usuario : undefined;
  const direccion = l.filtros.direccion === 'in' || l.filtros.direccion === 'out' ? l.filtros.direccion : undefined;

  const filtrosServidor = useMemo<FiltrosKardex>(
    () => ({
      busqueda: l.busqueda || undefined,
      sucursales: alcance.sucursales,
      producto,
      lote,
      desde,
      hasta,
      origenes: origenes.length ? origenes : undefined,
      usuario,
      direccion,
      direccion_orden: l.orden?.direccion ?? 'desc',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [l.busqueda, alcance.sucursales, producto, lote, desde, hasta, l.filtros.origen, usuario, direccion, l.orden?.direccion],
  );
  const clave = JSON.stringify({ ...filtrosServidor, d: l.rango.desde, t: l.tamano });
  const listo = permisos.resueltos && !alcance.cargando && !alcance.sinSucursal;

  useEffect(() => {
    if (!listo) return;
    if (!permisos.ver) {
      setEstadoError('sinPermiso');
      setCargando(false);
      return;
    }
    let vivo = true;
    setCargando(true);
    listarKardex(organizacionId, filtrosServidor, l.rango.desde, l.tamano)
      .then((r) => {
        if (!vivo) return;
        setDatos(r);
        setEstadoError(null);
      })
      .catch((e: { code?: string }) => {
        if (vivo) setEstadoError(e?.code === '42501' ? 'sinPermiso' : 'error');
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, recarga, listo, permisos.ver]);

  // Producto del filtro: nombre, SKU y lotes (para el filtro «Lote»).
  useEffect(() => {
    if (!producto || !listo || !permisos.ver) {
      setProductoFila(null);
      setLotes([]);
      return;
    }
    let vivo = true;
    listarStock(organizacionId, { producto, agrupar: false, sucursales: alcance.sucursales }, 0, 50)
      .then((r) => vivo && setProductoFila(r.filas.find((f) => f.product_id === producto) ?? r.filas[0] ?? null))
      .catch(() => undefined);
    lotesDeProducto(organizacionId, producto, null)
      .then((l2) => vivo && setLotes(l2))
      .catch(() => vivo && setLotes([]));
    return () => {
      vivo = false;
    };
  }, [producto, organizacionId, listo, permisos.ver, alcance.sucursales]);

  const filas = useMemo(() => datos?.filas ?? [], [datos]);
  const total = datos?.total ?? 0;
  const kpis = datos?.kpis ?? null;
  const cuadre = datos?.cuadre ?? null;
  const verCostos = datos?.costos ?? false;

  const refs = useMemo(() => filas.map((f) => ({ source: f.source, source_id: f.source_id, product_id: f.product_id })), [filas]);
  const docs = useDocumentosMovimiento(organizacionId, refs);
  const accionesBase = useAccionesMovimiento(permisos, { onSoloUsuario: (f) => f.usuario_id && l.setFiltro('usuario', f.usuario_id) });
  const acciones = (f: MovimientoFila): AccionFila[] => [
    ...accionesBase(f, docs.de(f)).filter((a) => a.id !== 'kardex' || !producto),
    {
      id: 'exportarProducto',
      etiqueta: t('acciones.exportarProducto'),
      icono: FileDown,
      onSelect: () => void exportarCsv({ ...filtrosServidor, producto: f.product_id }),
    },
  ];

  const exportarCsv = async (filtros: FiltrosKardex, soloPagina = false) => {
    setExportando(true);
    try {
      const r = soloPagina ? { filas } : await listarKardex(organizacionId, filtros, 0, LIMITE_EXPORTAR);
      if (r.filas.length === 0) {
        toast({ title: t('exportar.sinDatos') });
        return;
      }
      const csv = filasACsv(
        [t('csv.fecha'), t('csv.hora'), t('csv.producto'), t('csv.sku'), t('csv.tipo'), t('csv.documento'), t('csv.sucursal'), t('csv.lote'), t('csv.entrada'), t('csv.salida'), t('csv.saldo'), t('csv.costo'), t('csv.costoPromedio'), t('csv.usuario'), t('csv.nota')],
        r.filas.map((f) => [
          formatDate(f.fecha),
          formatTime(f.fecha),
          f.nombre,
          f.sku ?? '',
          to.has(f.source) ? to(f.source) : f.source,
          docs.de(f).numero ?? f.source_id ?? '',
          f.sucursal,
          f.lote ?? '',
          f.direccion === 'in' ? f.cantidad : '',
          f.direccion === 'out' ? f.cantidad : '',
          f.saldo ?? '',
          f.costo_unitario ?? '',
          f.costo_promedio_tras ?? '',
          f.usuario ?? '',
          f.nota ?? '',
        ]),
      );
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = nombreArchivo(filtros.producto ? `kardex_${filtros.producto}` : 'kardex', hoy);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: t('exportar.listo', { count: r.filas.length }) });
      setExportarAbierto(false);
    } catch (e) {
      toast({ variant: 'destructive', title: t('exportar.error'), description: mensajeError(e) });
    } finally {
      setExportando(false);
    }
  };

  const confirmarExportar = () => {
    if (alcanceExportar === 'pagina') void exportarCsv(filtrosServidor, true);
    else if (alcanceExportar === 'historico') void exportarCsv({ sucursales: alcance.sucursales, producto });
    else void exportarCsv(filtrosServidor);
  };

  const nombreProducto = productoFila?.nombre ?? filas.find((f) => f.product_id === producto)?.nombre;
  const chips: ChipFiltro[] = [
    ...(producto ? [{ clave: 'producto', etiqueta: t('chips.producto', { nombre: nombreProducto ?? `#${producto}` }) }] : []),
    ...(lote ? [{ clave: 'lote', etiqueta: t('chips.lote', { codigo: lotes.find((x) => x.lot_id === lote)?.lot_code ?? `#${lote}` }) }] : []),
    ...(desde && hasta ? [{ clave: 'periodo', etiqueta: t('chips.periodo', { rango: etiquetaRango({ desde, hasta }) }) }] : []),
    ...(origenes.length ? [{ clave: 'origen', etiqueta: t('chips.tipo', { tipos: origenes.map((o) => to(o)).join(', ') }) }] : []),
    ...(direccion ? [{ clave: 'direccion', etiqueta: direccion === 'in' ? tm('filtros.entradas') : tm('filtros.salidas') }] : []),
    ...(usuario ? [{ clave: 'usuario', etiqueta: t('chips.usuario', { nombre: filas.find((f) => f.usuario_id === usuario)?.usuario ?? '…' }) }] : []),
  ];
  const quitarChip = (c: string) => {
    if (c === 'periodo') l.actualizar({ filtros: { ...l.filtros, desde: '', hasta: '' } });
    else if (c === 'producto') l.actualizar({ filtros: { ...l.filtros, producto: '', lote: '' } });
    else l.setFiltro(c, null);
  };

  const columnas: ColumnaTabla<MovimientoFila>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), ordenable: true, campoOrden: 'fecha', celda: (f) => <CeldaFecha fecha={f.fecha} /> },
    {
      id: 'tipo',
      encabezado: t('columnas.tipo'),
      celda: (f) => <BadgeOrigenMovimiento origen={f.source} direccion={metaOrigen(f.source)?.direccion === 'ambas' ? f.direccion : null} />,
    },
    { id: 'documento', encabezado: t('columnas.documento'), celda: (f) => <CeldaDocumento fila={f} documento={docs.de(f)} cargando={docs.cargando} /> },
    ...(!producto || (productoFila?.variantes ?? 0) > 0
      ? [
          {
            id: 'producto',
            encabezado: t('columnas.producto'),
            ocultarDebajo: 'lg' as const,
            celda: (f: MovimientoFila) => (
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-fg">{f.nombre}</span>
                {(f.sku || f.atributos) && <span className="truncate text-xs text-fg-secondary">{[f.sku, f.atributos].filter(Boolean).join(' · ')}</span>}
              </div>
            ),
          },
        ]
      : []),
    { id: 'sucursal', encabezado: t('columnas.sucursal'), ocultarDebajo: 'md', celda: (f) => <span className="truncate text-fg">{f.sucursal}</span> },
    { id: 'lote', encabezado: t('columnas.lote'), ocultarDebajo: 'lg', celda: (f) => <span className="font-medium text-fg">{f.lote ?? '—'}</span> },
    { id: 'entrada', encabezado: t('columnas.entrada'), alinear: 'derecha', celda: (f) => <CeldaCantidad fila={f} direccion="in" /> },
    { id: 'salida', encabezado: t('columnas.salida'), alinear: 'derecha', celda: (f) => <CeldaCantidad fila={f} direccion="out" /> },
    {
      id: 'saldo',
      encabezado: t('columnas.saldo'),
      alinear: 'derecha',
      celda: (f) => (
        <span className={cn('font-semibold tabular-nums', (f.saldo ?? 0) < 0 ? 'text-danger-text' : 'text-fg')} title={(f.saldo ?? 0) < 0 ? t('saldoNegativo') : undefined}>
          {cantidad(f.saldo ?? 0)}
        </span>
      ),
    },
    ...(verCostos
      ? [
          {
            id: 'costo',
            encabezado: t('columnas.costo'),
            alinear: 'derecha' as const,
            ocultarDebajo: 'xl' as const,
            celda: (f: MovimientoFila) => <span className="tabular-nums text-fg-secondary">{f.costo_unitario ? moneda.formatear(f.costo_unitario) : '—'}</span>,
          },
        ]
      : []),
  ];

  const estadoTabla: EstadoTabla = cargando
    ? 'cargando'
    : estadoError === 'sinPermiso'
      ? 'sinPermiso'
      : estadoError
        ? 'error'
        : filas.length === 0 && l.hayCriterios
          ? 'sinResultados'
          : 'listo';

  const sustantivo = { singular: t('sustantivo.singular'), plural: t('sustantivo.plural') };
  const subtitulo = producto
    ? [nombreProducto, productoFila?.sku ? t('sku', { sku: productoFila.sku }) : null, t('nMovimientos', { count: total, n: cantidad(total) }), t('saldoPorSucursal')]
        .filter(Boolean)
        .join(' · ')
    : [getOrganizationName(), t('nMovimientos', { count: total, n: cantidad(total) })].filter(Boolean).join(' · ');

  const menuCabecera: AccionFila[] = [
    { id: 'descuadres', etiqueta: t('menu.descuadres'), icono: Scale, onSelect: () => setVerDescuadres(true) },
    { id: 'movimientos', etiqueta: t('menu.movimientos'), icono: History, onSelect: () => router.push('/app/inventario/movimientos') },
    ...(producto
      ? [{ id: 'producto', etiqueta: t('menu.producto'), icono: BookOpen, onSelect: () => router.push(`/app/inventario/productos/${productoFila?.parent_id ?? producto}`) }]
      : []),
  ];

  const cabecera = (
    <PageHeader
      titulo={t('titulo')}
      subtitulo={subtitulo}
      icono={BookOpen}
      cargando={cargando && estadoError === null && !alcance.sinSucursal}
      migas={[{ etiqueta: t('migas.inventario'), href: '/app/inventario' }, { etiqueta: t('migas.movimientos'), href: '/app/inventario/movimientos' }]}
      debajo={<BranchBadgeActiva />}
      acciones={
        alcance.sinSucursal || estadoError === 'sinPermiso' ? undefined : (
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={recargar} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </Button>
            <Button variant="outline" className="h-10 gap-2" onClick={() => setExportarAbierto(true)} disabled={estadoError !== null}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('exportar.boton')}
            </Button>
            <RowActionsMenu orientacion="horizontal" titulo={t('titulo')} acciones={menuCabecera} className="size-10" />
          </>
        )
      }
      movil={{
        subtitulo: producto ? t('subtituloMovil', { nombre: nombreProducto ?? '', n: cantidad(total) }) : t('nMovimientos', { count: total, n: cantidad(total) }),
        accion:
          alcance.sinSucursal || estadoError === 'sinPermiso' ? undefined : (
            <Button variant="ghost" size="icon" className="size-10" onClick={() => setExportarAbierto(true)} aria-label={t('exportar.boton')}>
              <Download aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </Button>
          ),
      }}
    />
  );

  if (alcance.sinSucursal) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        {cabecera}
        <EmptyState variante="sinSucursal" />
      </div>
    );
  }
  if (estadoError === 'sinPermiso') {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        {cabecera}
        <EmptyState variante="forbidden" titulo={tp('sinPermisoTitulo')} descripcion={tp('sinPermisoDescripcion')} />
      </div>
    );
  }

  const cuadra = cuadre ? cuadre.total === 0 : null;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {cabecera}

      <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
        <StatCard
          etiqueta={t('kpis.entradas')}
          cargando={!kpis}
          valor={kpis ? tm('uds', { n: cantidad(kpis.entradas) }) : '—'}
          tono="exito"
          tendencia="sube"
          detalle={t('kpis.entradasDetalle')}
        />
        <StatCard
          etiqueta={t('kpis.salidas')}
          cargando={!kpis}
          valor={kpis ? tm('uds', { n: cantidad(kpis.salidas) }) : '—'}
          tono="peligro"
          tendencia="baja"
          detalle={t('kpis.salidasDetalle')}
        />
        <StatCard
          etiqueta={t('kpis.saldoCierre')}
          cargando={!kpis}
          valor={kpis ? tm('uds', { n: cantidad(kpis.saldo_cierre) }) : '—'}
          tono={cuadra === false ? 'peligro' : 'neutro'}
          tendencia={cuadra === false ? 'baja' : undefined}
          detalle={kpis ? t('kpis.contraExistencias', { n: cantidad(kpis.existencias) }) : undefined}
        />
        <StatCard
          etiqueta={t('kpis.valor')}
          cargando={!kpis}
          valor={kpis ? (kpis.valor === null ? '—' : moneda.formatear(kpis.valor)) : '—'}
          detalle={kpis?.valor === null ? t('kpis.sinPermisoCostos') : t('kpis.valorDetalle')}
        />
      </KpiStrip>

      {cuadre && (
        <div
          role="status"
          className={cn(
            'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center lg:max-w-3xl',
            cuadra ? 'border-line-success bg-success-subtle' : 'border-line-danger bg-danger-subtle',
          )}
        >
          {cuadra ? (
            <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-success-text" strokeWidth={1.75} />
          ) : (
            <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-danger-text" strokeWidth={1.75} />
          )}
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-medium', cuadra ? 'text-success-text' : 'text-danger-text')}>{cuadra ? t('cuadre.cuadra') : t('cuadre.noCuadra')}</p>
            <p className="text-[13px] text-fg-secondary">
              {t('cuadre.detalle', { kardex: cantidad(cuadre.saldo_kardex), existencias: cantidad(cuadre.existencias) })}
              {!cuadra &&
                ` ${
                  cuadre.diferencia_total > 0
                    ? t('cuadre.faltan', { n: cantidad(cuadre.diferencia_total) })
                    : t('cuadre.sobran', { n: cantidad(Math.abs(cuadre.diferencia_total)) })
                } ${t('cuadre.causa')}`}
            </p>
          </div>
          <Button variant="link" className="h-auto p-0 text-brand" onClick={() => setVerDescuadres(true)}>
            {cuadra ? t('cuadre.verDetalle') : t('cuadre.verN', { count: cuadre.total, n: cantidad(cuadre.total) })}
          </Button>
        </div>
      )}

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} nota={t('filtros.nota')} textoVerResultados={t('filtros.verN', { count: total, n: cantidad(total) })}>
            <FormField etiqueta={t('filtros.producto')} ayuda={t('filtros.productoAyuda')}>
              {(c) => (
                <SelectorProductoStock
                  id={c.id}
                  organizacionId={organizacionId}
                  sucursalId={null}
                  valor={productoFila}
                  etiqueta={t('filtros.producto')}
                  onCambiar={(f) => {
                    setProductoFila(f);
                    l.actualizar({ filtros: { ...l.filtros, producto: String(f.product_id), lote: '' } });
                  }}
                />
              )}
            </FormField>
            <FormField etiqueta={t('filtros.tipo')} ayuda={t('filtros.tipoAyuda')}>
              {(c) => (
                <MultiSelect
                  id={c.id}
                  aria-labelledby={c.idEtiqueta}
                  opciones={ORIGENES_MOVIMIENTO_STOCK.map((o) => ({ valor: o, etiqueta: to(o) }))}
                  valores={origenes}
                  onValoresChange={(v) => l.setFiltro('origen', v)}
                  placeholder={tm('filtros.todosTipos', { n: ORIGENES_MOVIMIENTO_STOCK.length })}
                />
              )}
            </FormField>
            <FormField etiqueta={t('filtros.periodo')} ayuda={t('filtros.periodoAyuda')}>
              {() => (
                <DateRangeButton
                  hoy={hoy}
                  etiqueta={t('filtros.periodo')}
                  valor={{ desde: desde ?? '', hasta: hasta ?? '' }}
                  onValorChange={(r) => l.actualizar({ filtros: { ...l.filtros, desde: r.desde || '', hasta: r.hasta || '' } })}
                  onLimpiar={() => l.actualizar({ filtros: { ...l.filtros, desde: '', hasta: '' } })}
                />
              )}
            </FormField>
            <FormField etiqueta={t('filtros.lote')} ayuda={t('filtros.loteAyuda')}>
              {(c) => (
                <Select value={lote ? String(lote) : 'todos'} onValueChange={(v) => l.setFiltro('lote', v === 'todos' ? null : v)} disabled={!producto || lotes.length === 0}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('filtros.todosLotes')}</SelectItem>
                    {lotes.map((x) => (
                      <SelectItem key={x.lot_id} value={String(x.lot_id)}>
                        {`${x.lot_code} · ${x.expiry_date ? formatPlain(x.expiry_date) : tv('sin_vencimiento')}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={l.limpiarFiltros} />}
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => String(f.id)}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        onFilaClick={(f) => {
          const d = docs.de(f);
          if (d.ruta) router.push(d.ruta);
        }}
        etiquetaFila={(f) => tm('etiquetaFila', { producto: f.nombre, fecha: formatDate(f.fecha) })}
        acciones={acciones}
        tarjetaMovil={(f) => {
          const d = docs.de(f);
          const tipo = td.has(d.tipo) ? td(d.tipo) : td('otro');
          return (
            <ListCard
              titulo={d.numero ?? (f.source_id ? tipo : tm('sinDocumento'))}
              insignia={<BadgeOrigenMovimiento origen={f.source} />}
              valor={<span className="text-sm font-semibold text-fg">{t('saldoCorto', { n: cantidad(f.saldo ?? 0) })}</span>}
              subtitulo={f.nombre}
              meta={
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs text-fg-secondary">
                    {[`${formatDate(f.fecha)} · ${formatTime(f.fecha)}`, f.sucursal, f.lote ? tm('loteCorto', { codigo: f.lote }) : null].filter(Boolean).join(' · ')}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={f.direccion === 'in' ? 'text-sm font-semibold text-success-text' : 'text-sm font-semibold text-danger-text'}>
                      {f.direccion === 'in' ? '+' : '−'}
                      {tm('uds', { n: cantidad(f.cantidad) })}
                    </span>
                    {verCostos && f.costo_unitario ? <span className="text-xs text-fg-secondary">{tm('porUnidad', { costo: moneda.formatear(f.costo_unitario) })}</span> : null}
                  </span>
                </span>
              }
              acciones={acciones(f)}
              onClick={d.ruta ? () => router.push(d.ruta!) : undefined}
            />
          );
        }}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), icono: BookOpen }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('errorCarga') }}
        sinPermiso={{ titulo: tp('sinPermisoTitulo'), descripcion: tp('sinPermisoDescripcion') }}
        onLimpiarFiltros={l.limpiarTodo}
        onReintentar={recargar}
        termino={l.busqueda}
        pie={<Pagination pagina={l.pagina} tamano={l.tamano} total={total} onPaginaChange={l.setPagina} onTamanoChange={l.setTamano} sustantivo={sustantivo} cargando={cargando} />}
      />

      <Dialogo
        abierto={exportarAbierto}
        onAbiertoChange={setExportarAbierto}
        titulo={t('exportar.titulo')}
        descripcion={t('exportar.descripcion')}
        icono={Download}
        primario={{ etiqueta: t('exportar.confirmar'), onClick: confirmarExportar, cargando: exportando }}
      >
        <div className="flex flex-col gap-4">
          <RadioGroup value={alcanceExportar} onValueChange={(v) => setAlcanceExportar(v as AlcanceExportar)} className="flex flex-col gap-3">
            {(['filtros', 'pagina', 'historico'] as const).map((a) => (
              <div key={a} className="flex items-start gap-3">
                <RadioGroupItem value={a} id={`kardex-exportar-${a}`} className="mt-0.5" disabled={a === 'historico' && !producto} />
                <Label htmlFor={`kardex-exportar-${a}`} className="flex flex-col gap-0.5 font-normal">
                  <span className="text-sm text-fg">{t(`exportar.alcance.${a}`, { n: cantidad(a === 'pagina' ? filas.length : total) })}</span>
                  {a === 'historico' && !producto && <span className="text-xs text-fg-muted">{t('exportar.historicoSinProducto')}</span>}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <p className="text-xs text-fg-muted">{t('exportar.formato')}</p>
        </div>
      </Dialogo>

      <DialogoDescuadres
        abierto={verDescuadres}
        onAbiertoChange={setVerDescuadres}
        organizacionId={organizacionId}
        sucursales={alcance.sucursales}
        producto={producto}
        onVerProducto={(id) => {
          setVerDescuadres(false);
          l.actualizar({ filtros: { ...l.filtros, producto: String(id), lote: '' } });
        }}
      />
    </div>
  );
}

export default KardexPage;
