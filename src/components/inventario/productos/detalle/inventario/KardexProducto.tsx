'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, FileDown, History, User } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useEtiquetaRango, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { supabase } from '@/lib/supabase/config';
import { addPlainDays, formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { productoService, type FiltrosKardex, type MovimientoKardex } from '@/lib/services/productoService';
import { cn } from '@/utils/Utils';
import { useProductoDetalle } from '../ContextoProducto';
import { BotonInventario } from './stock/BotonInventario';
import {
  ORIGENES_KARDEX,
  PAGINA_EXPORTAR_KARDEX,
  TOPE_EXPORTAR_KARDEX,
  armarCsv,
  esOrigenKardex,
  idsOrdenesCompra,
  nombreArchivoKardex,
  rutaDocumento,
  rutaKardexCompleto,
  tonoOrigen,
} from './stock/logicaInventario';
import { useCantidad } from './stock/useFormatoInventario';

type Direccion = 'todas' | 'in' | 'out';
const TODAS = 'todas';

/**
 * Inventario › Kardex (Figma `32 · kardex en el detalle de producto`, «Nuevo»
 * en el detalle): movimientos del producto y sus variantes con paginación en
 * el servidor (`fn_producto_kardex`), filtros de sucursal, fechas (días de la
 * organización), dirección y origen, enlace al documento que lo originó,
 * saldo corrido por producto y sucursal y exportación a CSV del filtro.
 */
export function KardexProducto() {
  const t = useTranslations('productoDetalle.inventario');
  const tc = useTranslations('productoDetalle.comun');
  const { producto, organizacionId, resumen, sucursalActiva, fechas, moneda, mensajeError } = useProductoDetalle();
  const { toast } = useToast();
  const cantidad = useCantidad(producto);
  const localeIntl = useLocaleIntl();
  const etiquetaRango = useEtiquetaRango();
  const hoy = fechas.getToday();

  /** Todo el historial: desde el día en que se creó el producto hasta hoy. */
  const rangoCompleto = useMemo<RangoFechas>(() => {
    const creado = producto.created_at ? fechas.toDate(new Date(producto.created_at)) : hoy;
    return { desde: creado <= hoy ? creado : hoy, hasta: hoy };
  }, [producto.created_at, fechas, hoy]);

  const [branchId, setBranchId] = useState<number | null>(sucursalActiva);
  const [rango, setRango] = useState<RangoFechas | null>(null);
  const [direccion, setDireccion] = useState<Direccion>(TODAS);
  const [origen, setOrigen] = useState<string>(TODAS);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [filas, setFilas] = useState<MovimientoKardex[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uuidsOrdenes, setUuidsOrdenes] = useState<Map<number, string>>(new Map());
  const [exportando, setExportando] = useState(false);
  const turno = useRef(0);

  // El selector global de sucursal manda sobre el filtro local.
  useEffect(() => {
    setBranchId(sucursalActiva);
    setPagina(1);
  }, [sucursalActiva]);

  const filtros = useMemo<FiltrosKardex>(
    () => ({
      branchId,
      desde: rango ? fechas.toInstant(rango.desde) : null,
      hasta: rango ? fechas.toInstant(addPlainDays(rango.hasta, 1)) : null,
      direccion: direccion === TODAS ? null : direccion,
      origen: origen === TODAS ? null : origen,
    }),
    [branchId, rango, direccion, origen, fechas],
  );

  const cargar = useCallback(async () => {
    const mio = ++turno.current;
    setCargando(true);
    try {
      const r = await productoService.kardex(organizacionId, producto.id, {
        ...filtros,
        limite: tamano,
        offset: (pagina - 1) * tamano,
      });
      if (mio !== turno.current) return;
      setFilas(r.filas);
      setTotal(r.total);
      setError(null);
      // La ruta del detalle de la orden de compra va por uuid: se resuelven los de la página.
      const ids = idsOrdenesCompra(r.filas);
      if (ids.length > 0) {
        const { data } = await supabase
          .from('purchase_orders')
          .select('id, uuid')
          .eq('organization_id', organizacionId)
          .in('id', ids);
        if (mio === turno.current) {
          setUuidsOrdenes(new Map(((data ?? []) as { id: number; uuid: string }[]).map((o) => [o.id, o.uuid])));
        }
      }
    } catch (e) {
      if (mio === turno.current) setError(mensajeError(e));
    } finally {
      if (mio === turno.current) setCargando(false);
    }
  }, [organizacionId, producto.id, filtros, pagina, tamano, mensajeError]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiar = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPagina(1);
  };

  const etiquetaOrigen = useCallback(
    (o: string) => (esOrigenKardex(o) ? t(`kardex.origenes.${o}`) : o || tc('desconocido')),
    [t, tc],
  );
  const fechaHora = useCallback(
    (v: string) =>
      formatDateTimeInTz(v, fechas.timezone, {
        locale: localeIntl,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [fechas.timezone, localeIntl],
  );

  const sucursales = resumen?.sucursales ?? [];
  const nombreSucursal = (id: number | null) => sucursales.find((s) => s.branch_id === id)?.nombre ?? tc('desconocido');

  // ── Exportar ─────────────────────────────────────────────────────────────
  const exportar = async () => {
    setExportando(true);
    try {
      const todas: MovimientoKardex[] = [];
      let offset = 0;
      let totalServidor = Number.POSITIVE_INFINITY;
      while (offset < Math.min(totalServidor, TOPE_EXPORTAR_KARDEX)) {
        const r = await productoService.kardex(organizacionId, producto.id, {
          ...filtros,
          limite: PAGINA_EXPORTAR_KARDEX,
          offset,
        });
        totalServidor = r.total;
        todas.push(...r.filas);
        if (r.filas.length < PAGINA_EXPORTAR_KARDEX) break;
        offset += PAGINA_EXPORTAR_KARDEX;
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
          m.documento ?? m.origen_id ?? '',
          etiquetaOrigen(m.origen),
          m.sucursal ?? '',
          m.es_variante ? m.producto_nombre : '',
          m.producto_sku,
          m.direccion === 'in' ? m.cantidad : '',
          m.direccion === 'out' ? m.cantidad : '',
          m.costo_unitario,
          m.costo_total,
          m.saldo,
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

  // ── Tabla ────────────────────────────────────────────────────────────────
  const documento = (m: MovimientoKardex) => {
    const texto = m.documento ?? (m.origen_id ? m.origen_id.slice(0, 8) : null);
    if (!texto) return <span className="text-fg-muted">{tc('sinDatos')}</span>;
    const ruta = rutaDocumento(m.origen, m.origen_id, uuidsOrdenes);
    return ruta ? (
      <Link href={ruta} className="font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        {texto}
      </Link>
    ) : (
      <span className="text-fg">{texto}</span>
    );
  };
  const badgeOrigen = (m: MovimientoKardex) => (
    <Badge tono={tonoOrigen(m.origen)} tamano="sm">
      {etiquetaOrigen(m.origen)}
    </Badge>
  );
  const variante = (m: MovimientoKardex) =>
    m.es_variante ? (
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-fg">{m.producto_nombre}</span>
        <span className="truncate font-mono text-xs text-fg-secondary">{m.producto_sku}</span>
      </div>
    ) : (
      <span className="text-fg-muted">{tc('sinDatos')}</span>
    );

  const conVariantes = (producto.children ?? []).length > 0;

  const columnas: ColumnaTabla<MovimientoKardex>[] = [
    { id: 'fecha', encabezado: t('kardex.columnas.fecha'), celda: (m) => <span className="whitespace-nowrap">{fechaHora(m.fecha)}</span> },
    { id: 'documento', encabezado: t('kardex.columnas.documento'), celda: documento },
    { id: 'origen', encabezado: t('kardex.columnas.origen'), celda: badgeOrigen },
    { id: 'sucursal', encabezado: tc('sucursal'), celda: (m) => m.sucursal ?? tc('sinDatos') },
    ...(conVariantes ? [{ id: 'variante', encabezado: t('kardex.columnas.variante'), celda: variante } satisfies ColumnaTabla<MovimientoKardex>] : []),
    {
      id: 'entrada',
      encabezado: t('kardex.columnas.entrada'),
      variante: 'importe',
      celda: (m) => (m.direccion === 'in' ? <span className="font-medium text-success-text">+{cantidad(m.cantidad)}</span> : ''),
    },
    {
      id: 'salida',
      encabezado: t('kardex.columnas.salida'),
      variante: 'importe',
      celda: (m) => (m.direccion === 'out' ? <span className="font-medium text-danger-text">−{cantidad(m.cantidad)}</span> : ''),
    },
    {
      id: 'costoUnitario',
      encabezado: t('kardex.columnas.costoUnitario'),
      variante: 'importe',
      ocultarDebajo: 'xl',
      celda: (m) => (m.costo_unitario > 0 ? moneda.formatear(m.costo_unitario) : <span className="text-fg-muted">{tc('sinDatos')}</span>),
    },
    {
      id: 'costoTotal',
      encabezado: t('kardex.columnas.costoTotal'),
      variante: 'importe',
      ocultarDebajo: 'xl',
      celda: (m) => (m.costo_total > 0 ? moneda.formatear(m.costo_total) : <span className="text-fg-muted">{tc('sinDatos')}</span>),
    },
    { id: 'saldo', encabezado: t('kardex.columnas.saldo'), variante: 'importe', celda: (m) => <span className="font-semibold">{cantidad(m.saldo)}</span> },
    {
      id: 'usuario',
      encabezado: t('kardex.columnas.usuario'),
      ocultarDebajo: 'xl',
      celda: (m) => <span className="whitespace-nowrap text-fg-secondary">{m.usuario ?? tc('usuarioDesconocido')}</span>,
    },
    {
      id: 'nota',
      encabezado: t('kardex.columnas.nota'),
      ocultarDebajo: 'xl',
      celda: (m) =>
        m.nota ? (
          <span className="line-clamp-2 max-w-[220px] text-fg-secondary" title={m.nota}>
            {m.nota}
          </span>
        ) : (
          <span className="text-fg-muted">{tc('sinDatos')}</span>
        ),
    },
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
          <p className="text-sm text-fg-secondary">
            {t('kardex.descripcion', { sucursal: branchId === null ? tc('todasSucursales') : nombreSucursal(branchId) })}
          </p>
        </div>
        <Link
          href={rutaKardexCompleto(producto.id)}
          className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {t('kardex.completo')}
          <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={branchId === null ? TODAS : String(branchId)}
            onValueChange={(v) => cambiar(setBranchId)(v === TODAS ? null : Number(v))}
          >
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
          <DateRangeButton
            valor={rango ?? rangoCompleto}
            onValorChange={cambiar<RangoFechas | null>(setRango)}
            hoy={hoy}
            etiqueta={t('kardex.fechas')}
          />
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
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  tamano="sm"
                  valor={direccion}
                  onValorChange={cambiar(setDireccion)}
                  opciones={opcionesDireccion}
                />
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
                    {ORIGENES_KARDEX.map((o) => (
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
        etiquetaFila={(m) => `${etiquetaOrigen(m.origen)} · ${fechaHora(m.fecha)}`}
        estado={estado}
        densidad="compacta"
        filasEsqueleto={6}
        onReintentar={() => void cargar()}
        onLimpiarFiltros={() => {
          limpiar();
          setBranchId(null);
        }}
        error={{ titulo: t('kardex.error'), descripcion: error ?? tc('errorCargar') }}
        vacio={{ icono: History, titulo: t('kardex.vacio.titulo'), descripcion: t('kardex.vacio.descripcion') }}
        sinResultados={{ titulo: t('kardex.sinResultados.titulo'), descripcion: t('kardex.sinResultados.descripcion') }}
        className={cn(cargando && filas.length > 0 && 'opacity-60')}
        tarjetaMovil={(m) => (
          <ListCard
            icono={m.direccion === 'in' ? ArrowDownLeft : ArrowUpRight}
            titulo={etiquetaOrigen(m.origen)}
            insignia={m.documento ? <span className="text-xs text-fg-secondary">{m.documento}</span> : undefined}
            subtitulo={[m.sucursal, m.es_variante ? `${m.producto_nombre} (${m.producto_sku})` : null].filter(Boolean).join(' · ')}
            datos={[
              m.usuario ? { icono: User, etiqueta: t('kardex.columnas.usuario'), texto: m.usuario } : null,
              m.nota ? { icono: History, etiqueta: t('kardex.columnas.nota'), texto: m.nota } : null,
            ]}
            meta={fechaHora(m.fecha)}
            valor={
              <span className={m.direccion === 'in' ? 'text-success-text' : 'text-danger-text'}>
                {m.direccion === 'in' ? '+' : '−'}
                {cantidad(m.cantidad)}
              </span>
            }
            estado={<span className="text-xs text-fg-secondary">{t('kardex.saldoCorto', { saldo: cantidad(m.saldo) })}</span>}
          />
        )}
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
