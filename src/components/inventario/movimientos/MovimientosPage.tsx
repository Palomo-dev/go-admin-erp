'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Download, History, RefreshCw } from 'lucide-react';
import {
  BranchBadgeActiva,
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
  SearchInput,
  SegmentedControl,
  StatCard,
  inicioDeMes,
  useListadoServidor,
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { MultiSelect } from '@/components/kit/MultiSelect';
import { BadgeOrigenMovimiento, useDocumentosMovimiento } from '@/components/kit/inventario';
import { useEtiquetaRango } from '@/components/kit/useIdiomaKit';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId, getOrganizationName } from '@/lib/hooks/useOrganization';
import { ORIGENES_MOVIMIENTO_STOCK, metaOrigen } from '@/lib/inventario/origenesMovimientoStock';
import { usePermisosInventario } from '@/lib/inventario/usePermisosInventario';
import { filasACsv } from '@/lib/utils/csv';
import { listarMovimientos, type FiltrosMovimientos, type KpisMovimientos, type MovimientoFila } from '@/lib/services/stockService';
import { DialogoRegistrarMovimiento } from '../stock/DialogoRegistrarMovimiento';
import { MenuNuevoMovimiento } from '../stock/MenuNuevoMovimiento';
import { nombreArchivo } from '../stock/logica';
import { useAlcanceSucursales, useCantidadStock, useMensajeErrorInventario } from '../stock/useInventarioB1';
import { CeldaCantidad, CeldaDocumento, CeldaFecha, useAccionesMovimiento } from './piezas';

const LIMITE_EXPORTAR = 10000;
/** Desde el 2026-09-23 el CHECK admite todos los orígenes (migración 20260923100000). */
const FECHA_ORIGENES_COMPLETOS = '2026-09-23';

/**
 * Movimientos (Figma «Existencias — Movimientos» 586:286574): la bitácora de
 * todo lo que entra y sale, con su tipo (`BadgeOrigenMovimiento`, el único mapa
 * de orígenes) y el documento que lo explica (`EnlaceDocumento`, resuelto en una
 * llamada por página con `fn_inv_documentos`). Paginado y filtrado en el servidor
 * (`fn_movimientos_listado`), período en días de la organización.
 */
export function MovimientosPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioMovimientos');
  const to = useTranslations('inventario.origenes');
  const tp = useTranslations('inventario.permisos');
  const td = useTranslations('inventario.documentos');
  const cantidad = useCantidadStock();
  const moneda = useMonedaOrganizacion();
  const etiquetaRango = useEtiquetaRango();
  const { getToday, formatDate, formatTime } = useFormatDate();
  const mensajeError = useMensajeErrorInventario();
  const permisos = usePermisosInventario();
  const alcance = useAlcanceSucursales();
  const organizacionId = getOrganizationId();
  const hoy = getToday();

  const l = useListadoServidor({
    filtros: ['desde', 'hasta', 'direccion', 'origen', 'producto', 'lote', 'usuario', 'ingredientes', 'sinDocumento'],
    camposOrden: ['fecha'],
    ordenPorDefecto: { campo: 'fecha', direccion: 'desc' },
    tamanoPorDefecto: 25,
  });

  const [filas, setFilas] = useState<MovimientoFila[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<KpisMovimientos | null>(null);
  const [verCostos, setVerCostos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [estadoError, setEstadoError] = useState<'error' | 'sinPermiso' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [dialogo, setDialogo] = useState<'in' | 'out' | null>(null);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  // Período: el del filtro o, sin él, el mes en curso (Figma: «Periodo: 1–23 sep»).
  const sinPeriodo = l.filtros.desde === 'todo';
  const desde = sinPeriodo ? undefined : /^\d{4}-\d{2}-\d{2}$/.test(l.filtros.desde ?? '') ? l.filtros.desde : inicioDeMes(hoy);
  const hasta = sinPeriodo ? undefined : /^\d{4}-\d{2}-\d{2}$/.test(l.filtros.hasta ?? '') ? l.filtros.hasta : hoy;
  const direccion = l.filtros.direccion === 'in' || l.filtros.direccion === 'out' ? l.filtros.direccion : undefined;
  const origenes = (l.filtros.origen ?? '').split(',').filter((o) => (ORIGENES_MOVIMIENTO_STOCK as readonly string[]).includes(o));
  const producto = /^\d+$/.test(l.filtros.producto ?? '') ? Number(l.filtros.producto) : undefined;
  const lote = /^\d+$/.test(l.filtros.lote ?? '') ? Number(l.filtros.lote) : undefined;
  const usuario = /^[0-9a-f-]{36}$/i.test(l.filtros.usuario ?? '') ? l.filtros.usuario : undefined;
  const ingredientes = l.filtros.ingredientes === '1';
  const sinDocumento = l.filtros.sinDocumento === '1';

  const filtrosServidor = useMemo<FiltrosMovimientos>(
    () => ({
      busqueda: l.busqueda || undefined,
      sucursales: alcance.sucursales,
      desde,
      hasta,
      direccion,
      origenes: origenes.length ? origenes : undefined,
      producto,
      lote,
      usuario,
      solo_ingredientes: ingredientes || undefined,
      sin_documento: sinDocumento || undefined,
      direccion_orden: l.orden?.direccion ?? 'desc',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [l.busqueda, alcance.sucursales, desde, hasta, direccion, l.filtros.origen, producto, lote, usuario, ingredientes, sinDocumento, l.orden?.direccion],
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
    listarMovimientos(organizacionId, filtrosServidor, l.rango.desde, l.tamano)
      .then((r) => {
        if (!vivo) return;
        setFilas(r.filas);
        setTotal(r.total);
        setKpis(r.kpis);
        setVerCostos(r.costos);
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

  const refs = useMemo(() => filas.map((f) => ({ source: f.source, source_id: f.source_id, product_id: f.product_id })), [filas]);
  const docs = useDocumentosMovimiento(organizacionId, refs);
  const accionesDe = useAccionesMovimiento(permisos, { onSoloUsuario: (f) => f.usuario_id && l.setFiltro('usuario', f.usuario_id) });
  const acciones = (f: MovimientoFila) => accionesDe(f, docs.de(f));

  const exportar = async () => {
    setExportando(true);
    try {
      const r = await listarMovimientos(organizacionId, filtrosServidor, 0, Math.min(Math.max(total, 1), LIMITE_EXPORTAR));
      if (r.filas.length === 0) {
        toast({ title: t('exportar.sinDatos') });
        return;
      }
      const csv = filasACsv(
        [t('csv.fecha'), t('csv.hora'), t('csv.producto'), t('csv.sku'), t('csv.tipo'), t('csv.documento'), t('csv.sucursal'), t('csv.lote'), t('csv.entrada'), t('csv.salida'), t('csv.costo'), t('csv.usuario'), t('csv.nota')],
        r.filas.map((f) => [
          formatDate(f.fecha),
          formatTime(f.fecha),
          f.nombre,
          f.sku ?? '',
          to.has(f.source) ? to(f.source) : f.source,
          f.source_id ?? '',
          f.sucursal,
          f.lote ?? '',
          f.direccion === 'in' ? f.cantidad : '',
          f.direccion === 'out' ? f.cantidad : '',
          f.costo_unitario ?? '',
          f.usuario ?? '',
          f.nota ?? '',
        ]),
      );
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = nombreArchivo('movimientos', hoy);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: t('exportar.listo', { count: r.filas.length }) });
    } catch (e) {
      toast({ variant: 'destructive', title: t('exportar.error'), description: mensajeError(e) });
    } finally {
      setExportando(false);
    }
  };

  const chips: ChipFiltro[] = [
    ...(desde && hasta ? [{ clave: 'periodo', etiqueta: t('chips.periodo', { rango: etiquetaRango({ desde, hasta }) }) }] : []),
    ...(direccion ? [{ clave: 'direccion', etiqueta: direccion === 'in' ? t('filtros.entradas') : t('filtros.salidas') }] : []),
    ...(origenes.length ? [{ clave: 'origen', etiqueta: t('chips.tipo', { tipos: origenes.map((o) => to(o)).join(', ') }) }] : []),
    ...(producto ? [{ clave: 'producto', etiqueta: t('chips.producto', { nombre: filas.find((f) => f.product_id === producto)?.nombre ?? `#${producto}` }) }] : []),
    ...(lote ? [{ clave: 'lote', etiqueta: t('chips.lote', { codigo: filas.find((f) => f.lot_id === lote)?.lote ?? `#${lote}` }) }] : []),
    ...(usuario ? [{ clave: 'usuario', etiqueta: t('chips.usuario', { nombre: filas.find((f) => f.usuario_id === usuario)?.usuario ?? '…' }) }] : []),
    ...(ingredientes ? [{ clave: 'ingredientes', etiqueta: t('filtros.ingredientes') }] : []),
    ...(sinDocumento ? [{ clave: 'sinDocumento', etiqueta: t('chips.sinDocumento') }] : []),
  ];
  const quitarChip = (c: string) => {
    if (c === 'periodo') l.actualizar({ filtros: { ...l.filtros, desde: 'todo', hasta: '' } });
    else l.setFiltro(c, null);
  };

  const columnas: ColumnaTabla<MovimientoFila>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), ordenable: true, campoOrden: 'fecha', celda: (f) => <CeldaFecha fecha={f.fecha} /> },
    {
      id: 'producto',
      encabezado: t('columnas.producto'),
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{f.nombre}</span>
          <span className="truncate text-xs text-fg-secondary">{[f.sku ? t('sku', { sku: f.sku }) : null, f.atributos].filter(Boolean).join(' · ')}</span>
        </div>
      ),
    },
    {
      id: 'tipo',
      encabezado: t('columnas.tipo'),
      celda: (f) => <BadgeOrigenMovimiento origen={f.source} direccion={metaOrigen(f.source)?.direccion === 'ambas' ? f.direccion : null} />,
    },
    { id: 'documento', encabezado: t('columnas.documento'), ocultarDebajo: 'md', celda: (f) => <CeldaDocumento fila={f} documento={docs.de(f)} cargando={docs.cargando} /> },
    {
      id: 'sucursal',
      encabezado: t('columnas.sucursalLote'),
      ocultarDebajo: 'lg',
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{f.sucursal}</span>
          <span className="truncate text-xs text-fg-secondary">{f.lote ?? t('sinLote')}</span>
        </div>
      ),
    },
    { id: 'entrada', encabezado: t('columnas.entrada'), alinear: 'derecha', celda: (f) => <CeldaCantidad fila={f} direccion="in" /> },
    { id: 'salida', encabezado: t('columnas.salida'), alinear: 'derecha', celda: (f) => <CeldaCantidad fila={f} direccion="out" /> },
    ...(verCostos
      ? [
          {
            id: 'costo',
            encabezado: t('columnas.costo'),
            alinear: 'derecha' as const,
            ocultarDebajo: 'xl' as const,
            celda: (f: MovimientoFila) =>
              f.costo_unitario ? <span className="tabular-nums text-fg">{moneda.formatear(f.costo_unitario)}</span> : <span className="text-fg-muted">{t('sinCosto')}</span>,
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
        : filas.length === 0 && (l.hayCriterios || !!desde)
          ? 'sinResultados'
          : 'listo';

  const sustantivo = { singular: t('sustantivo.singular'), plural: t('sustantivo.plural') };
  const cabecera = (
    <PageHeader
      titulo={t('titulo')}
      subtitulo={[getOrganizationName(), kpis ? t('subtitulo', { count: total, n: cantidad(total) }) : null].filter(Boolean).join(' · ')}
      icono={History}
      cargando={cargando && estadoError === null && !alcance.sinSucursal}
      migas={[{ etiqueta: t('migas.inventario'), href: '/app/inventario' }, { etiqueta: t('migas.existencias') }]}
      debajo={<BranchBadgeActiva />}
      acciones={
        alcance.sinSucursal || estadoError === 'sinPermiso' ? undefined : (
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={recargar} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </Button>
            <Button variant="outline" className="h-10 gap-2" onClick={() => void exportar()} disabled={exportando || estadoError !== null}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('exportar.boton')}
            </Button>
            <MenuNuevoMovimiento permisos={permisos} sucursalId={alcance.sucursalActiva} onEntrada={() => setDialogo('in')} onSalida={() => setDialogo('out')} />
          </>
        )
      }
      movil={{
        subtitulo: kpis ? t('subtituloMovil', { n: cantidad(total), rango: desde && hasta ? etiquetaRango({ desde, hasta }) : t('todoElHistorial') }) : undefined,
        accion:
          alcance.sinSucursal || estadoError === 'sinPermiso' ? undefined : (
            <MenuNuevoMovimiento compacto permisos={permisos} sucursalId={alcance.sucursalActiva} onEntrada={() => setDialogo('in')} onSalida={() => setDialogo('out')} />
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

  const muestraAvisoHistorico = !desde || desde < FECHA_ORIGENES_COMPLETOS;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {cabecera}

      <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
        <StatCard
          etiqueta={t('kpis.entradas')}
          cargando={!kpis}
          valor={kpis ? t('uds', { n: cantidad(kpis.entradas) }) : '—'}
          tono="exito"
          tendencia="sube"
          detalle={t('kpis.entradasDetalle')}
          onClick={() => l.setFiltro('direccion', 'in')}
        />
        <StatCard
          etiqueta={t('kpis.salidas')}
          cargando={!kpis}
          valor={kpis ? t('uds', { n: cantidad(kpis.salidas) }) : '—'}
          tono="peligro"
          tendencia="baja"
          detalle={t('kpis.salidasDetalle')}
          onClick={() => l.setFiltro('direccion', 'out')}
        />
        <StatCard
          etiqueta={t('kpis.valorSalidas')}
          cargando={!kpis}
          valor={kpis ? (kpis.valor_salidas === null ? '—' : moneda.formatear(kpis.valor_salidas)) : '—'}
          detalle={kpis?.valor_salidas === null ? t('kpis.sinPermisoCostos') : t('kpis.valorSalidasDetalle')}
        />
        <StatCard
          etiqueta={t('kpis.sinDocumento')}
          cargando={!kpis}
          valor={kpis ? cantidad(kpis.sin_documento) : '—'}
          tono={kpis && kpis.sin_documento > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={kpis && kpis.sin_documento > 0 ? AlertTriangle : undefined}
          detalle={t('kpis.sinDocumentoDetalle')}
          onClick={() => l.setFiltro('sinDocumento', '1')}
        />
      </KpiStrip>

      {muestraAvisoHistorico && (
        <div role="note" className="flex flex-col gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4 sm:flex-row sm:items-center">
          <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-warning-text" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-warning-text">{t('avisoHistorico.titulo', { fecha: formatDate(`${FECHA_ORIGENES_COMPLETOS}T12:00:00Z`) })}</p>
            <p className="hidden text-[13px] text-fg-secondary sm:block">{t('avisoHistorico.descripcion')}</p>
          </div>
          <Button asChild variant="outline" className="h-9 bg-surface">
            <Link href="/app/inventario/kardex?descuadres=1">{t('avisoHistorico.verDescuadres')}</Link>
          </Button>
        </div>
      )}

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} nota={t('filtros.nota')} textoVerResultados={t('filtros.verN', { count: total, n: cantidad(total) })}>
            <FormField etiqueta={t('filtros.periodo')} ayuda={t('filtros.periodoAyuda')}>
              {() => (
                <DateRangeButton
                  hoy={hoy}
                  etiqueta={t('filtros.periodo')}
                  valor={{ desde: desde ?? '', hasta: hasta ?? '' }}
                  onValorChange={(r) => l.actualizar({ filtros: { ...l.filtros, desde: r.desde || 'todo', hasta: r.hasta || '' } })}
                  onLimpiar={() => l.actualizar({ filtros: { ...l.filtros, desde: 'todo', hasta: '' } })}
                />
              )}
            </FormField>
            <FormField etiqueta={t('filtros.direccion')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  valor={direccion ?? 'todas'}
                  onValorChange={(v) => l.setFiltro('direccion', v === 'todas' ? null : v)}
                  opciones={[
                    { valor: 'todas', etiqueta: t('filtros.todas') },
                    { valor: 'in', etiqueta: t('filtros.entradas') },
                    { valor: 'out', etiqueta: t('filtros.salidas') },
                  ]}
                  anchoCompleto
                  tamano="sm"
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
                  placeholder={t('filtros.todosTipos', { n: ORIGENES_MOVIMIENTO_STOCK.length })}
                />
              )}
            </FormField>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="mov-ingredientes" className="flex flex-col text-sm text-fg">
                {t('filtros.ingredientes')}
                <span className="text-xs text-fg-secondary">{t('filtros.ingredientesAyuda')}</span>
              </label>
              <Switch id="mov-ingredientes" checked={ingredientes} onCheckedChange={(v) => l.setFiltro('ingredientes', v ? '1' : null)} />
            </div>
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
        etiquetaFila={(f) => t('etiquetaFila', { producto: f.nombre, fecha: formatDate(f.fecha) })}
        acciones={acciones}
        tarjetaMovil={(f) => {
          const d = docs.de(f);
          const tipo = td.has(d.tipo) ? td(d.tipo) : td('otro');
          return (
            <ListCard
              titulo={f.nombre}
              estado={<BadgeOrigenMovimiento origen={f.source} />}
              subtitulo={[d.numero ? `${tipo} ${d.numero}` : f.source_id ? tipo : t('sinDocumento'), f.usuario ? t('por', { nombre: f.usuario }) : null, f.lote ? t('loteCorto', { codigo: f.lote }) : null]
                .filter(Boolean)
                .join(' · ')}
              meta={
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs text-fg-secondary">{`${formatDate(f.fecha)} ${formatTime(f.fecha)} · ${f.sucursal}`}</span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={f.direccion === 'in' ? 'text-sm font-semibold text-success-text' : 'text-sm font-semibold text-danger-text'}>
                      {f.direccion === 'in' ? '+' : '−'}
                      {t('uds', { n: cantidad(f.cantidad) })}
                    </span>
                    {verCostos && f.costo_unitario ? <span className="text-xs text-fg-secondary">{t('porUnidad', { costo: moneda.formatear(f.costo_unitario) })}</span> : null}
                  </span>
                </span>
              }
              acciones={acciones(f)}
              onClick={d.ruta ? () => router.push(d.ruta!) : undefined}
            />
          );
        }}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), icono: History }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('errorCarga') }}
        sinPermiso={{ titulo: tp('sinPermisoTitulo'), descripcion: tp('sinPermisoDescripcion') }}
        onLimpiarFiltros={l.limpiarTodo}
        onReintentar={recargar}
        termino={l.busqueda}
        pie={<Pagination pagina={l.pagina} tamano={l.tamano} total={total} onPaginaChange={l.setPagina} onTamanoChange={l.setTamano} sustantivo={sustantivo} cargando={cargando} />}
      />

      <DialogoRegistrarMovimiento
        abierto={dialogo !== null}
        onAbiertoChange={(v) => !v && setDialogo(null)}
        direccion={dialogo ?? 'in'}
        organizacionId={organizacionId}
        verCostos={verCostos}
        onRegistrado={recargar}
      />
    </div>
  );
}

export default MovimientosPage;
