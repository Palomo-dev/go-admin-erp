'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, FileDown, History } from 'lucide-react';
import {
  DataTable,
  DateRangeButton,
  FilterChips,
  FilterPanel,
  FormField,
  ListCard,
  Pagination,
  SegmentedControl,
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
  type RangoFechas,
} from '@/components/kit';
import { BadgeOrigenMovimiento, useDocumentosMovimiento } from '@/components/kit/inventario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useEtiquetaRango, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { ORIGENES_MOVIMIENTO_STOCK, metaOrigen } from '@/lib/inventario/origenesMovimientoStock';
import { usePermisosInventario } from '@/lib/inventario/usePermisosInventario';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { listarKardex, type FiltrosKardex, type KpisKardex } from '@/lib/services/kardexService';
import type { MovimientoFila } from '@/lib/services/stockService';
import { cn } from '@/utils/Utils';
import { CeldaCantidad, CeldaDocumento, useAccionesMovimiento } from '../../../movimientos/piezas';
import { useProductoDetalle } from '../ContextoProducto';
import { BotonInventario } from './stock/BotonInventario';
import { PAGINA_EXPORTAR_KARDEX, TOPE_EXPORTAR_KARDEX, armarCsv, nombreArchivoKardex, rutaKardexCompleto } from './stock/logicaInventario';
import { useCantidad } from './stock/useFormatoInventario';

type Direccion = 'todas' | 'in' | 'out';
const TODAS = 'todas';

/**
 * Inventario › Kardex del producto (Figma 525:64176, móvil 525:65718): los
 * movimientos del producto y sus variantes con el saldo corrido calculado en el
 * servidor (`fn_kardex_saldo_corrido`), el tipo con `BadgeOrigenMovimiento` (el
 * único mapa de orígenes) y el documento con `EnlaceDocumento` (resuelto en una
 * llamada por página). Resumen de entradas, salidas, saldo y costo promedio;
 * filtros de sucursal, fechas (días de la organización), dirección y origen;
 * exportación del filtro a CSV.
 */
export function KardexProducto() {
  const t = useTranslations('productoDetalle.inventario');
  const tc = useTranslations('productoDetalle.comun');
  const td = useTranslations('inventarioKardex.detalle');
  const to = useTranslations('inventario.origenes');
  const { producto, organizacionId, resumen, sucursalActiva, fechas, moneda, mensajeError } = useProductoDetalle();
  const { toast } = useToast();
  const permisos = usePermisosInventario();
  const cantidad = useCantidad(producto);
  const localeIntl = useLocaleIntl();
  const etiquetaRango = useEtiquetaRango();
  const hoy = fechas.getToday();

  const [branchId, setBranchId] = useState<number | null>(sucursalActiva);
  const [rango, setRango] = useState<RangoFechas | null>(null);
  const [direccion, setDireccion] = useState<Direccion>(TODAS);
  const [origen, setOrigen] = useState<string>(TODAS);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [filas, setFilas] = useState<MovimientoFila[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<KpisKardex | null>(null);
  const [verCostos, setVerCostos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const turno = useRef(0);

  // El selector global de sucursal manda sobre el filtro local.
  useEffect(() => {
    setBranchId(sucursalActiva);
    setPagina(1);
  }, [sucursalActiva]);

  const filtros = useMemo<FiltrosKardex>(
    () => ({
      producto: producto.id,
      sucursales: branchId ? [branchId] : undefined,
      desde: rango?.desde,
      hasta: rango?.hasta,
      direccion: direccion === TODAS ? undefined : direccion,
      origenes: origen === TODAS ? undefined : [origen],
    }),
    [producto.id, branchId, rango, direccion, origen],
  );

  const cargar = useCallback(async () => {
    const mio = ++turno.current;
    setCargando(true);
    try {
      const r = await listarKardex(organizacionId, filtros, (pagina - 1) * tamano, tamano);
      if (mio !== turno.current) return;
      setFilas(r.filas);
      setTotal(r.total);
      setKpis(r.kpis);
      setVerCostos(r.costos);
      setError(null);
    } catch (e) {
      if (mio === turno.current) setError(mensajeError(e));
    } finally {
      if (mio === turno.current) setCargando(false);
    }
  }, [organizacionId, filtros, pagina, tamano, mensajeError]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const refs = useMemo(() => filas.map((f) => ({ source: f.source, source_id: f.source_id, product_id: f.product_id })), [filas]);
  const docs = useDocumentosMovimiento(organizacionId, refs);
  const accionesDe = useAccionesMovimiento(permisos);

  const cambiar = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPagina(1);
  };

  const fechaHora = useCallback(
    (v: string) =>
      formatDateTimeInTz(v, fechas.timezone, { locale: localeIntl, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    [fechas.timezone, localeIntl],
  );
  const etiquetaOrigen = useCallback((o: string) => (to.has(o) ? to(o) : o || tc('desconocido')), [to, tc]);

  const sucursales = resumen?.sucursales ?? [];
  const nombreSucursal = (id: number | null) => sucursales.find((s) => s.branch_id === id)?.nombre ?? tc('desconocido');

  // ── Exportar ─────────────────────────────────────────────────────────────
  const exportar = async () => {
    setExportando(true);
    try {
      const todas: MovimientoFila[] = [];
      let totalServidor = Number.POSITIVE_INFINITY;
      for (let desde = 0; desde < Math.min(totalServidor, TOPE_EXPORTAR_KARDEX); desde += PAGINA_EXPORTAR_KARDEX) {
        const r = await listarKardex(organizacionId, filtros, desde, PAGINA_EXPORTAR_KARDEX);
        totalServidor = r.total;
        todas.push(...r.filas);
        if (r.filas.length < PAGINA_EXPORTAR_KARDEX) break;
      }
      const recortadas = todas.slice(0, TOPE_EXPORTAR_KARDEX);
      const csv = armarCsv([
        [
          t('kardex.columnas.fecha'),
          t('kardex.columnas.documento'),
          t('kardex.columnas.origen'),
          tc('sucursal'),
          t('kardex.columnas.variante'),
          t('kardex.columnas.sku'),
          td('lote'),
          t('kardex.columnas.entrada'),
          t('kardex.columnas.salida'),
          t('kardex.columnas.costoUnitario'),
          t('kardex.columnas.costoTotal'),
          t('kardex.columnas.saldo'),
          t('kardex.columnas.usuario'),
          t('kardex.columnas.nota'),
        ],
        ...recortadas.map((m) => [
          fechaHora(m.fecha),
          docs.de(m).numero ?? m.source_id ?? '',
          etiquetaOrigen(m.source),
          m.sucursal,
          m.parent_id ? m.nombre : '',
          m.sku ?? '',
          m.lote ?? '',
          m.direccion === 'in' ? m.cantidad : '',
          m.direccion === 'out' ? m.cantidad : '',
          m.costo_unitario ?? '',
          m.costo_total ?? '',
          m.saldo ?? '',
          m.usuario ?? '',
          m.nota ?? '',
        ]),
      ]);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombreArchivoKardex(producto.sku, hoy);
      enlace.click();
      URL.revokeObjectURL(url);
      toast({
        title: t('kardex.exportado'),
        description:
          totalServidor > TOPE_EXPORTAR_KARDEX
            ? t('kardex.exportadoTope', { count: recortadas.length, total: totalServidor })
            : t('kardex.exportadoDetalle', { count: recortadas.length }),
      });
    } catch (e) {
      toast({ variant: 'destructive', title: t('kardex.errorExportar'), description: mensajeError(e) });
    } finally {
      setExportando(false);
    }
  };

  // ── Filtros activos ──────────────────────────────────────────────────────
  const chips: ChipFiltro[] = [
    ...(rango ? [{ clave: 'rango', etiqueta: t('kardex.chips.fechas', { rango: etiquetaRango(rango) }) }] : []),
    ...(direccion !== TODAS
      ? [{ clave: 'direccion', etiqueta: t('kardex.chips.direccion', { valor: direccion === 'in' ? t('kardex.entradas') : t('kardex.salidas') }) }]
      : []),
    ...(origen !== TODAS ? [{ clave: 'origen', etiqueta: t('kardex.chips.origen', { valor: etiquetaOrigen(origen) }) }] : []),
  ];
  const quitarChip = (clave: string) => {
    if (clave === 'rango') setRango(null);
    if (clave === 'direccion') setDireccion(TODAS);
    if (clave === 'origen') setOrigen(TODAS);
    setPagina(1);
  };
  const limpiar = () => {
    setRango(null);
    setDireccion(TODAS);
    setOrigen(TODAS);
    setPagina(1);
  };
  const hayFiltros = chips.length > 0 || branchId !== null;
  const conVariantes = (producto.children ?? []).length > 0;

  const columnas: ColumnaTabla<MovimientoFila>[] = [
    { id: 'fecha', encabezado: t('kardex.columnas.fecha'), celda: (m) => <span className="whitespace-nowrap">{fechaHora(m.fecha)}</span> },
    {
      id: 'origen',
      encabezado: t('kardex.columnas.origen'),
      celda: (m) => <BadgeOrigenMovimiento origen={m.source} direccion={metaOrigen(m.source)?.direccion === 'ambas' ? m.direccion : null} />,
    },
    { id: 'documento', encabezado: t('kardex.columnas.documento'), celda: (m) => <CeldaDocumento fila={m} documento={docs.de(m)} cargando={docs.cargando} /> },
    { id: 'sucursal', encabezado: tc('sucursal'), ocultarDebajo: 'lg', celda: (m) => m.sucursal },
    ...(conVariantes
      ? [
          {
            id: 'variante',
            encabezado: t('kardex.columnas.variante'),
            ocultarDebajo: 'lg',
            celda: (m: MovimientoFila) =>
              m.parent_id ? (
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-fg">{m.atributos ?? m.nombre}</span>
                  <span className="truncate font-mono text-xs text-fg-secondary">{m.sku}</span>
                </div>
              ) : (
                <span className="text-fg-muted">{tc('sinDatos')}</span>
              ),
          } satisfies ColumnaTabla<MovimientoFila>,
        ]
      : []),
    { id: 'lote', encabezado: td('lote'), ocultarDebajo: 'md', celda: (m) => <span className="font-medium text-fg">{m.lote ?? '—'}</span> },
    { id: 'entrada', encabezado: t('kardex.columnas.entrada'), variante: 'importe', celda: (m) => <CeldaCantidad fila={m} direccion="in" /> },
    { id: 'salida', encabezado: t('kardex.columnas.salida'), variante: 'importe', celda: (m) => <CeldaCantidad fila={m} direccion="out" /> },
    {
      id: 'saldo',
      encabezado: t('kardex.columnas.saldo'),
      variante: 'importe',
      celda: (m) => <span className={cn('font-semibold', (m.saldo ?? 0) < 0 && 'text-danger-text')}>{cantidad(m.saldo ?? 0)}</span>,
    },
    ...(verCostos
      ? [
          {
            id: 'costoUnitario',
            encabezado: t('kardex.columnas.costoUnitario'),
            variante: 'importe',
            ocultarDebajo: 'xl',
            celda: (m: MovimientoFila) => (m.costo_unitario ? moneda.formatear(m.costo_unitario) : <span className="text-fg-muted">{tc('sinDatos')}</span>),
          } satisfies ColumnaTabla<MovimientoFila>,
        ]
      : []),
  ];

  const estado: EstadoTabla = cargando && filas.length === 0 ? 'cargando' : error ? 'error' : filas.length === 0 && hayFiltros ? 'sinResultados' : 'listo';
  const opcionesDireccion = [
    { valor: TODAS as Direccion, etiqueta: t('kardex.todas') },
    { valor: 'in' as Direccion, etiqueta: t('kardex.entradas') },
    { valor: 'out' as Direccion, etiqueta: t('kardex.salidas') },
  ];

  return (
    <section aria-labelledby="kardex-producto" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="kardex-producto" className="text-base font-semibold text-fg">
            {t('kardex.titulo')}
          </h3>
          <p className="text-sm text-fg-secondary">{t('kardex.descripcion', { sucursal: branchId === null ? tc('todasSucursales') : nombreSucursal(branchId) })}</p>
        </div>
        <Link
          href={rutaKardexCompleto(producto.id)}
          className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {t('kardex.completo')}
          <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-busy={!kpis}>
        {[
          { clave: 'entradas', valor: kpis ? `+${cantidad(kpis.entradas)}` : '—', clase: 'text-success-text' },
          { clave: 'salidas', valor: kpis ? `−${cantidad(kpis.salidas)}` : '—', clase: 'text-danger-text' },
          { clave: 'saldo', valor: kpis ? cantidad(kpis.saldo_cierre) : '—', clase: 'text-fg' },
          { clave: 'costoPromedio', valor: kpis?.costo_promedio != null ? moneda.formatear(kpis.costo_promedio) : '—', clase: 'text-fg' },
        ].map((k) => (
          <div key={k.clave} className="rounded-lg bg-subtle px-3 py-2.5">
            <dt className="text-xs text-fg-secondary">{td(k.clave)}</dt>
            <dd className={cn('text-base font-semibold tabular-nums', k.clase)}>{k.valor}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={branchId === null ? TODAS : String(branchId)} onValueChange={(v) => cambiar(setBranchId)(v === TODAS ? null : Number(v))}>
            <SelectTrigger aria-label={tc('sucursal')} className="h-10 w-full rounded-lg border-line-strong bg-surface text-sm text-fg sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>{tc('todasSucursales')}</SelectItem>
              {sucursales.map((s) => (
                <SelectItem key={s.branch_id} value={String(s.branch_id)}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangeButton valor={rango ?? { desde: '', hasta: '' }} onValorChange={cambiar<RangoFechas | null>(setRango)} onLimpiar={() => cambiar<RangoFechas | null>(setRango)(null)} hoy={hoy} etiqueta={t('kardex.fechas')} />
          <FilterPanel
            conteo={(direccion !== TODAS ? 1 : 0) + (origen !== TODAS ? 1 : 0)}
            onLimpiar={() => {
              setDireccion(TODAS);
              setOrigen(TODAS);
              setPagina(1);
            }}
            textoVerResultados={t('kardex.verMovimientos', { count: total })}
          >
            <FormField etiqueta={t('kardex.direccion')}>
              {(c) => (
                <SegmentedControl aria-labelledby={c.idEtiqueta} anchoCompleto tamano="sm" valor={direccion} onValorChange={cambiar(setDireccion)} opciones={opcionesDireccion} />
              )}
            </FormField>
            <FormField etiqueta={t('kardex.origen')}>
              {(c) => (
                <Select value={origen} onValueChange={cambiar(setOrigen)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 rounded-lg border-line-strong bg-surface text-sm text-fg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODAS}>{t('kardex.todosOrigenes')}</SelectItem>
                    {ORIGENES_MOVIMIENTO_STOCK.map((o) => (
                      <SelectItem key={o} value={o}>
                        {etiquetaOrigen(o)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </FilterPanel>
          <div className="flex-1" />
          <BotonInventario
            etiqueta={exportando ? t('kardex.exportando') : tc('exportar')}
            icono={FileDown}
            onClick={() => void exportar()}
            deshabilitado={exportando || cargando || total === 0}
            motivo={total === 0 ? t('kardex.sinNadaQueExportar') : exportando ? t('kardex.exportando') : undefined}
          />
        </div>
        <FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={limpiar} />
      </div>

      <DataTable
        etiqueta={t('kardex.titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(m) => String(m.id)}
        etiquetaFila={(m) => `${etiquetaOrigen(m.source)} · ${fechaHora(m.fecha)}`}
        estado={estado}
        densidad="compacta"
        filasEsqueleto={6}
        acciones={(m) => accionesDe(m, docs.de(m)).filter((a) => a.id !== 'kardex' && a.id !== 'producto')}
        onReintentar={() => void cargar()}
        onLimpiarFiltros={() => {
          limpiar();
          setBranchId(null);
        }}
        error={{ titulo: t('kardex.error'), descripcion: error ?? tc('errorCargar') }}
        vacio={{ icono: History, titulo: t('kardex.vacio.titulo'), descripcion: t('kardex.vacio.descripcion') }}
        sinResultados={{ titulo: t('kardex.sinResultados.titulo'), descripcion: t('kardex.sinResultados.descripcion') }}
        className={cn(cargando && filas.length > 0 && 'opacity-60')}
        tarjetaMovil={(m) => {
          const d = docs.de(m);
          return (
            <ListCard
              icono={m.direccion === 'in' ? ArrowDownLeft : ArrowUpRight}
              titulo={etiquetaOrigen(m.source)}
              insignia={d.numero ? <span className="text-xs text-fg-secondary">{d.numero}</span> : undefined}
              subtitulo={[m.sucursal, m.parent_id ? `${m.atributos ?? m.nombre} (${m.sku ?? ''})` : null, m.lote].filter(Boolean).join(' · ')}
              meta={fechaHora(m.fecha)}
              valor={
                <span className={m.direccion === 'in' ? 'text-success-text' : 'text-danger-text'}>
                  {m.direccion === 'in' ? '+' : '−'}
                  {cantidad(m.cantidad)}
                </span>
              }
              estado={<span className="text-xs text-fg-secondary">{t('kardex.saldoCorto', { saldo: cantidad(m.saldo ?? 0) })}</span>}
              acciones={accionesDe(m, d).filter((a) => a.id !== 'kardex' && a.id !== 'producto')}
            />
          );
        }}
        pie={
          <Pagination
            pagina={pagina}
            tamano={tamano}
            total={total}
            onPaginaChange={setPagina}
            onTamanoChange={(n) => {
              setTamano(n);
              setPagina(1);
            }}
            sustantivo={{ singular: t('kardex.sustantivo.singular'), plural: t('kardex.sustantivo.plural') }}
            cargando={cargando}
          />
        }
      />
    </section>
  );
}
