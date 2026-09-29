'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  BookOpen,
  Boxes,
  ClipboardCheck,
  Download,
  Info,
  Layers,
  Package,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  BranchBadgeActiva,
  BulkActionBar,
  DataTable,
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
  StatCard,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId, getOrganizationName } from '@/lib/hooks/useOrganization';
import { usePermisosInventario } from '@/lib/inventario/usePermisosInventario';
import { supabase } from '@/lib/supabase/config';
import { filasACsv } from '@/lib/utils/csv';
import {
  ESTADOS_STOCK,
  SEGUIMIENTOS_STOCK,
  listarStock,
  type EstadoStock,
  type FiltrosStock,
  type KpisStock,
  type SeguimientoStock,
  type StockFila,
} from '@/lib/services/stockService';
import { cn } from '@/utils/Utils';
import {
  rutaAjustePorConteo,
  rutaKardexCompleto,
  rutaLotesProducto,
  rutaTransferencia,
} from '../productos/detalle/inventario/stock/logicaInventario';
import { DialogoRegistrarMovimiento } from './DialogoRegistrarMovimiento';
import { DialogoStockMinimo } from './DialogoStockMinimo';
import { MenuNuevoMovimiento } from './MenuNuevoMovimiento';
import { TONO_ESTADO_STOCK, filasCsvStock, nombreArchivo, sucursalesDeFila, tonoFilaStock } from './logica';
import { useAlcanceSucursales, useCantidadStock, useMensajeErrorInventario } from './useInventarioB1';
import { idsProductos } from './cantidadProducto';
import { useModosVenta } from './useModosVenta';

const CAMPOS_ORDEN = ['producto', 'disponible', 'existencia'] as const;
const LIMITE_EXPORTAR = 5000;

interface Opcion {
  id: number;
  name: string;
}

/**
 * Stock (Figma «Existencias — Stock» 581:276750, escritorio y móvil): una fila
 * por producto con sus existencias por sucursal, lo reservado, lo disponible, el
 * mínimo y el costo promedio. Paginado, filtrado y agregado en el servidor
 * (`fn_stock_listado`); las variantes se agrupan bajo su producto (P1) y la
 * existencia propia del padre sale aparte como «sin asignar a variante».
 *
 * Acciones: registrar entrada / salida (ajuste aplicado de B2 por la primitiva),
 * definir mínimos, trasladar (B3), ajuste por conteo (B2), kardex y lotes.
 */
export function StockPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioStock');
  const tc = useTranslations('inventario.permisos');
  const cantidad = useCantidadStock();
  const moneda = useMonedaOrganizacion();
  const { getToday } = useFormatDate();
  const mensajeError = useMensajeErrorInventario();
  const permisos = usePermisosInventario();
  const alcance = useAlcanceSucursales();
  const organizacionId = getOrganizationId();

  const l = useListadoServidor({
    filtros: ['estado', 'categoria', 'seguimiento', 'proveedor', 'agrupar', 'producto'],
    camposOrden: [...CAMPOS_ORDEN],
    ordenPorDefecto: { campo: 'producto', direccion: 'asc' },
    tamanoPorDefecto: 25,
  });

  const [filas, setFilas] = useState<StockFila[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<KpisStock | null>(null);
  const [verCostos, setVerCostos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [estadoError, setEstadoError] = useState<'error' | 'sinPermiso' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [seleccionadas, setSeleccionadas] = useState<Map<string, StockFila>>(new Map());
  const [exportando, setExportando] = useState(false);
  const [categorias, setCategorias] = useState<Opcion[]>([]);
  const [proveedores, setProveedores] = useState<Opcion[]>([]);
  const [dialogo, setDialogo] = useState<{ tipo: 'in' | 'out' | 'minimo'; fila: StockFila | null } | null>(null);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  const estados = (l.filtros.estado ?? '').split(',').filter((e): e is EstadoStock => (ESTADOS_STOCK as readonly string[]).includes(e));
  const seguimiento = (SEGUIMIENTOS_STOCK as readonly string[]).includes(l.filtros.seguimiento ?? '') ? (l.filtros.seguimiento as SeguimientoStock) : undefined;
  const categoria = /^\d+$/.test(l.filtros.categoria ?? '') ? Number(l.filtros.categoria) : undefined;
  const proveedor = /^\d+$/.test(l.filtros.proveedor ?? '') ? Number(l.filtros.proveedor) : undefined;
  const producto = /^\d+$/.test(l.filtros.producto ?? '') ? Number(l.filtros.producto) : undefined;
  const agrupar = l.filtros.agrupar !== 'no';

  const filtrosServidor = useMemo<FiltrosStock>(
    () => ({
      busqueda: l.busqueda || undefined,
      sucursales: alcance.sucursales,
      estados: estados.length ? estados : undefined,
      categoria,
      seguimiento,
      proveedor,
      producto,
      agrupar,
      orden: (CAMPOS_ORDEN as readonly string[]).includes(l.orden?.campo ?? '') ? (l.orden!.campo as FiltrosStock['orden']) : 'producto',
      direccion: l.orden?.direccion ?? 'asc',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [l.busqueda, alcance.sucursales, l.filtros.estado, categoria, seguimiento, proveedor, producto, agrupar, l.orden?.campo, l.orden?.direccion],
  );
  const clave = JSON.stringify({ ...filtrosServidor, desde: l.rango.desde, limite: l.tamano });
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
    listarStock(organizacionId, filtrosServidor, l.rango.desde, l.tamano)
      .then((r) => {
        if (!vivo) return;
        setFilas(r.filas);
        setTotal(r.total);
        setKpis(r.kpis);
        setVerCostos(r.costos);
        setEstadoError(null);
      })
      .catch((e: { code?: string }) => {
        if (!vivo) return;
        setEstadoError(e?.code === '42501' ? 'sinPermiso' : 'error');
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, recarga, listo, permisos.ver]);

  // Catálogos de los filtros (solo lectura).
  useEffect(() => {
    if (!listo || !permisos.ver || !organizacionId) return;
    void supabase
      .from('categories')
      .select('id, name')
      .eq('organization_id', organizacionId)
      .order('name')
      .limit(500)
      .then(({ data }) => setCategorias((data ?? []) as Opcion[]));
    void supabase
      .from('suppliers')
      .select('id, name')
      .eq('organization_id', organizacionId)
      .order('name')
      .limit(500)
      .then(({ data }) => setProveedores((data ?? []) as Opcion[]));
  }, [listo, permisos.ver, organizacionId]);

  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros, s: alcance.sucursales });
  useEffect(() => {
    setSeleccion(new Set());
    setSeleccionadas(new Map());
  }, [claveCriterios]);

  const cambiarSeleccion = (nueva: Set<string>) => {
    setSeleccion(nueva);
    setSeleccionadas((prev) => {
      const m = new Map<string, StockFila>();
      nueva.forEach((id) => {
        const fila = filas.find((f) => String(f.product_id) === id) ?? prev.get(id);
        if (fila) m.set(id, fila);
      });
      return m;
    });
  };

  const todasLasFilas = async () => (await listarStock(organizacionId, filtrosServidor, 0, Math.min(Math.max(total, 1), LIMITE_EXPORTAR))).filas;

  const seleccionarTodos = async () => {
    try {
      const todas = await todasLasFilas();
      setSeleccion(new Set(todas.map((f) => String(f.product_id))));
      setSeleccionadas(new Map(todas.map((f) => [String(f.product_id), f])));
    } catch (e) {
      toast({ variant: 'destructive', title: t('errorSeleccionar'), description: mensajeError(e) });
    }
  };

  const exportar = async (soloSeleccion: boolean) => {
    setExportando(true);
    try {
      const datos = soloSeleccion ? [...seleccionadas.values()] : await todasLasFilas();
      if (datos.length === 0) {
        toast({ title: t('exportar.sinDatos') });
        return;
      }
      const csv = filasACsv(
        [
          t('csv.producto'),
          t('csv.sku'),
          t('csv.variante'),
          t('csv.categoria'),
          t('csv.porSucursal'),
          t('csv.existencia'),
          t('csv.reservado'),
          t('csv.disponible'),
          t('csv.minimo'),
          t('csv.costo'),
          t('csv.valor'),
          t('csv.estado'),
        ],
        filasCsvStock(datos, {
          estado: (e) => t(`estados.${e}`),
          cantidad: (n) => cantidad(n),
          moneda: (n) => (n === null ? '' : moneda.formatear(n)),
        }),
      );
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = nombreArchivo('stock', getToday());
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: t('exportar.listo', { count: datos.length }) });
    } catch (e) {
      toast({ variant: 'destructive', title: t('exportar.error'), description: mensajeError(e) });
    } finally {
      setExportando(false);
    }
  };

  // ── Acciones por fila (Figma 584:281747) ────────────────────────────────
  const puedeMover = (f: StockFila) => f.variantes === 0 && !f.sin_asignar_fila && f.sigue_stock;
  const accionesFila = (f: StockFila): AccionFila[] => [
    { id: 'kardex', etiqueta: t('acciones.kardex'), icono: BookOpen, onSelect: () => router.push(rutaKardexCompleto(f.product_id)) },
    ...(f.con_lotes
      ? [{ id: 'lotes', etiqueta: t('acciones.lotes', { count: f.lotes, n: f.lotes }), icono: Layers, onSelect: () => router.push(rutaLotesProducto(f.product_id)) }]
      : []),
    { id: 'producto', etiqueta: t('acciones.producto'), icono: Package, onSelect: () => router.push(`/app/inventario/productos/${f.parent_id ?? f.product_id}`) },
    {
      id: 'entrada',
      etiqueta: t('acciones.entrada'),
      icono: ArrowDownCircle,
      separadorAntes: true,
      oculta: !permisos.ajustar,
      deshabilitada: !puedeMover(f),
      motivo: t('acciones.soloVariantes'),
      onSelect: () => setDialogo({ tipo: 'in', fila: f }),
    },
    {
      id: 'salida',
      etiqueta: t('acciones.salida'),
      icono: ArrowUpCircle,
      oculta: !permisos.ajustar,
      deshabilitada: !puedeMover(f),
      motivo: t('acciones.soloVariantes'),
      onSelect: () => setDialogo({ tipo: 'out', fila: f }),
    },
    {
      id: 'trasladar',
      etiqueta: t('acciones.trasladar'),
      icono: ArrowLeftRight,
      oculta: !permisos.trasladar,
      deshabilitada: !puedeMover(f) || alcance.branches.length < 2,
      motivo: alcance.branches.length < 2 ? t('acciones.unaSucursal') : t('acciones.soloVariantes'),
      onSelect: () => router.push(rutaTransferencia(f.product_id, alcance.todas ? f.por_sucursal[0]?.branch_id : alcance.sucursalActiva)),
    },
    {
      id: 'minimo',
      etiqueta: t('acciones.minimo'),
      icono: SlidersHorizontal,
      oculta: !(permisos.ajustar || permisos.editar_catalogo),
      deshabilitada: f.variantes > 0 || f.sin_asignar_fila,
      motivo: t('acciones.soloVariantes'),
      onSelect: () => setDialogo({ tipo: 'minimo', fila: f }),
    },
  ];

  // ── Filtros y chips ─────────────────────────────────────────────────────
  const chips: ChipFiltro[] = [
    ...(estados.length ? [{ clave: 'estado', etiqueta: t('chips.estado', { estados: estados.map((e) => t(`estados.${e}`)).join(', ') }) }] : []),
    ...(categoria ? [{ clave: 'categoria', etiqueta: t('chips.categoria', { nombre: categorias.find((c) => c.id === categoria)?.name ?? `#${categoria}` }) }] : []),
    ...(seguimiento ? [{ clave: 'seguimiento', etiqueta: t(`filtros.seguimiento.${seguimiento}`) }] : []),
    ...(proveedor ? [{ clave: 'proveedor', etiqueta: t('chips.proveedor', { nombre: proveedores.find((p) => p.id === proveedor)?.name ?? `#${proveedor}` }) }] : []),
    ...(producto ? [{ clave: 'producto', etiqueta: t('chips.producto', { nombre: filas[0]?.nombre ?? `#${producto}` }) }] : []),
    ...(!agrupar ? [{ clave: 'agrupar', etiqueta: t('chips.sinAgrupar') }] : []),
  ];

  const alternarEstado = (e: EstadoStock) => l.setFiltro('estado', estados.includes(e) ? estados.filter((x) => x !== e) : [...estados, e]);

  // Productos por peso o medida: «12,400 kg» en vez de «12,4 uds» (PRODUCTOS-POR-PESO-BASCULA.md §2.4).
  const idsFilas = useMemo(() => idsProductos(filas), [filas]);
  const { cantidadDe } = useModosVenta(idsFilas);
  const cantFila = (f: StockFila, n: number) => cantidadDe(f.product_id, n);
  const udsFila = (f: StockFila, n: number) => cantidadDe(f.product_id, n, (numero) => t('columnas.uds', { n: numero }));

  // ── Columnas (Figma 582:277572) ──────────────────────────────────────────
  const lineaProducto = (f: StockFila) =>
    [
      f.sku ? t('columnas.sku', { sku: f.sku }) : null,
      f.atributos,
      f.variantes > 0 ? t('columnas.variantes', { count: f.variantes, n: f.variantes }) : null,
      f.con_lotes ? t('columnas.conLotes') : null,
      f.con_seriales ? t('columnas.conSeriales') : null,
      f.sin_asignar_fila ? t('columnas.sinAsignarFila') : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const celdaSucursales = (f: StockFila) => {
    const { visibles, resto } = sucursalesDeFila(f);
    return (
      <div className="flex min-w-0 flex-col">
        <span className="text-fg tabular-nums">
          {udsFila(f, f.existencia)}
          {f.reservado > 0 && ` · ${t('columnas.reservadas', { count: f.reservado, n: cantFila(f, f.reservado) })}`}
        </span>
        {visibles.length > 0 && (
          <span className="truncate text-xs text-fg-secondary">
            {visibles.map((s, i) => (
              <span key={s.branch_id} className={cn(s.negativo || s.existencia < 0 ? 'font-medium text-danger-text' : undefined)}>
                {i > 0 && ' · '}
                {s.sucursal} {cantFila(f, s.existencia)}
              </span>
            ))}
            {resto > 0 && ` · +${resto}`}
          </span>
        )}
        {f.sin_asignar !== 0 && (
          <span className="text-xs text-warning-text" title={t('columnas.sinAsignarAyuda')}>
            {t('columnas.sinAsignar', { n: cantidad(f.sin_asignar) })}
          </span>
        )}
      </div>
    );
  };

  const columnas: ColumnaTabla<StockFila>[] = [
    {
      id: 'producto',
      encabezado: t('columnas.producto'),
      ordenable: true,
      campoOrden: 'producto',
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{f.nombre}</span>
          <span className="truncate text-xs text-fg-secondary">{lineaProducto(f)}</span>
        </div>
      ),
    },
    { id: 'categoria', encabezado: t('columnas.categoria'), ocultarDebajo: 'lg', celda: (f) => <span className="truncate text-fg">{f.categoria ?? '—'}</span> },
    { id: 'sucursales', encabezado: t('columnas.porSucursal'), ocultarDebajo: 'md', celda: celdaSucursales },
    {
      id: 'disponible',
      encabezado: t('columnas.disponible'),
      alinear: 'derecha',
      ordenable: true,
      campoOrden: 'disponible',
      celda: (f) => <span className={cn('font-semibold tabular-nums', f.disponible <= 0 ? 'text-danger-text' : 'text-fg')}>{cantFila(f, f.disponible)}</span>,
    },
    { id: 'minimo', encabezado: t('columnas.minimo'), alinear: 'derecha', ocultarDebajo: 'lg', celda: (f) => <span className="tabular-nums text-fg">{cantFila(f, f.minimo)}</span> },
    ...(verCostos
      ? [
          {
            id: 'costo',
            encabezado: t('columnas.costo'),
            alinear: 'derecha' as const,
            ocultarDebajo: 'xl' as const,
            celda: (f: StockFila) => <span className="tabular-nums text-fg">{f.costo_promedio === null ? '—' : moneda.formatear(f.costo_promedio)}</span>,
          },
        ]
      : []),
    { id: 'estado', encabezado: t('columnas.estado'), celda: (f) => <BadgeEstadoStock estado={f.estado} /> },
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
  const nSucursales = alcance.sucursales.length;
  const subtitulo = [
    getOrganizationName(),
    kpis ? t('subtitulo', { count: kpis.con_existencias, n: cantidad(kpis.con_existencias), sucursales: nSucursales }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const abrirEntrada = () => setDialogo({ tipo: 'in', fila: null });
  const abrirSalida = () => setDialogo({ tipo: 'out', fila: null });

  const cabecera = (
    <PageHeader
      titulo={t('titulo')}
      subtitulo={alcance.sinSucursal ? getOrganizationName() : subtitulo}
      icono={Boxes}
      cargando={cargando && !alcance.sinSucursal && estadoError === null}
      migas={[{ etiqueta: t('migas.inventario'), href: '/app/inventario' }, { etiqueta: t('migas.existencias') }]}
      debajo={<BranchBadgeActiva />}
      acciones={
        alcance.sinSucursal || estadoError === 'sinPermiso' ? undefined : (
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={recargar} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </Button>
            <Button variant="outline" className="h-10 gap-2" onClick={() => void exportar(false)} disabled={exportando || estadoError !== null}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('exportar.boton')}
            </Button>
            <MenuNuevoMovimiento permisos={permisos} sucursalId={alcance.sucursalActiva} onEntrada={abrirEntrada} onSalida={abrirSalida} />
          </>
        )
      }
      movil={{
        subtitulo: kpis ? t('subtituloMovil', { productos: cantidad(kpis.productos), sucursales: nSucursales }) : undefined,
        accion:
          alcance.sinSucursal || estadoError === 'sinPermiso' ? undefined : (
            <MenuNuevoMovimiento compacto permisos={permisos} sucursalId={alcance.sucursalActiva} onEntrada={abrirEntrada} onSalida={abrirSalida} />
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
        <EmptyState variante="forbidden" titulo={tc('sinPermisoTitulo')} descripcion={tc('sinPermisoDescripcion')} />
      </div>
    );
  }

  const listaSeleccion = [...seleccionadas.values()];
  const movibles = listaSeleccion.filter(puedeMover);

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {cabecera}

      <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
        <StatCard
          etiqueta={t('kpis.conExistencias')}
          cargando={!kpis}
          valor={kpis ? cantidad(kpis.con_existencias) : '—'}
          detalle={kpis ? t('kpis.deSeguimiento', { n: cantidad(kpis.productos) }) : undefined}
        />
        <StatCard
          etiqueta={t('kpis.valor')}
          cargando={!kpis}
          valor={kpis ? (kpis.valor === null ? '—' : moneda.formatear(kpis.valor)) : '—'}
          detalle={kpis ? (kpis.valor === null ? t('kpis.valorSinPermiso') : t('kpis.valorDetalle')) : undefined}
        />
        <StatCard
          etiqueta={t('kpis.bajoMinimo')}
          cargando={!kpis}
          valor={kpis ? cantidad(kpis.bajo_minimo) : '—'}
          tono={kpis && kpis.bajo_minimo > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={kpis && kpis.bajo_minimo > 0 ? AlertTriangle : undefined}
          detalle={kpis ? (kpis.bajo_minimo > 0 ? t('kpis.reponer') : t('kpis.ningunoBajo')) : undefined}
          onClick={() => l.setFiltro('estado', 'bajo_minimo')}
        />
        <StatCard
          etiqueta={t('kpis.agotadosNegativos')}
          cargando={!kpis}
          valor={kpis ? cantidad(kpis.agotados + kpis.negativos) : '—'}
          tono={kpis && kpis.agotados + kpis.negativos > 0 ? 'peligro' : 'neutro'}
          tendencia={kpis && kpis.agotados + kpis.negativos > 0 ? 'baja' : undefined}
          detalle={kpis ? t('kpis.agotadosDetalle', { agotados: cantidad(kpis.agotados), negativos: cantidad(kpis.negativos) }) : undefined}
          onClick={() => l.setFiltro('estado', ['agotado', 'negativo'])}
        />
      </KpiStrip>

      {kpis && kpis.negativos > 0 && !(estados.length === 1 && estados[0] === 'negativo') && (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-line-danger bg-danger-subtle p-4 sm:flex-row sm:items-center">
          <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-danger-text" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-danger-text">{t('avisoNegativos.titulo', { count: kpis.negativos, n: cantidad(kpis.negativos) })}</p>
            <p className="hidden text-[13px] text-fg-secondary sm:block">{t('avisoNegativos.descripcion')}</p>
          </div>
          <Button variant="outline" className="h-9 bg-surface" onClick={() => l.setFiltro('estado', 'negativo')}>
            {t('avisoNegativos.ver')}
          </Button>
        </div>
      )}

      {kpis && kpis.sin_asignar > 0 && agrupar && (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-subtle px-4 py-3 text-[13px] text-fg-secondary">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          <span>
            {t('avisoSinAsignar', { count: kpis.sin_asignar, n: cantidad(kpis.sin_asignar) })}{' '}
            <button type="button" className="font-medium text-brand underline-offset-2 hover:underline" onClick={() => l.setFiltro('agrupar', 'no')}>
              {t('verSinAgrupar')}
            </button>
          </span>
        </p>
      )}

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} nota={t('filtros.nota')} textoVerResultados={t('filtros.verN', { count: total, n: cantidad(total) })}>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.estado')}</legend>
              <div className="flex flex-wrap gap-2">
                {ESTADOS_STOCK.map((e) => (
                  <label key={e} className="flex items-center gap-2 text-sm text-fg">
                    <Checkbox checked={estados.includes(e)} onCheckedChange={() => alternarEstado(e)} className="size-[18px] rounded" />
                    {t(`estados.${e}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <FormField etiqueta={t('filtros.categoria')}>
              {(c) => (
                <Select value={categoria ? String(categoria) : 'todas'} onValueChange={(v) => l.setFiltro('categoria', v === 'todas' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">{t('filtros.todasCategorias')}</SelectItem>
                    {categorias.map((c2) => (
                      <SelectItem key={c2.id} value={String(c2.id)}>
                        {c2.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('filtros.seguimientoTitulo')} ayuda={t('filtros.seguimientoAyuda')}>
              {(c) => (
                <Select value={seguimiento ?? 'todos'} onValueChange={(v) => l.setFiltro('seguimiento', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('filtros.seguimiento.todos')}</SelectItem>
                    {SEGUIMIENTOS_STOCK.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`filtros.seguimiento.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('filtros.proveedor')}>
              {(c) => (
                <Select value={proveedor ? String(proveedor) : 'todos'} onValueChange={(v) => l.setFiltro('proveedor', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('filtros.todosProveedores')}</SelectItem>
                    {proveedores.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="stock-agrupar" className="text-sm text-fg">
                {t('filtros.agrupar')}
              </label>
              <Switch id="stock-agrupar" checked={agrupar} onCheckedChange={(v) => l.setFiltro('agrupar', v ? null : 'no')} />
            </div>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => String(f.product_id)}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={cambiarSeleccion}
        onFilaClick={(f) => router.push(rutaKardexCompleto(f.product_id))}
        etiquetaFila={(f) => t('etiquetaFila', { producto: f.nombre })}
        acciones={accionesFila}
        tonoFila={tonoFilaStock}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            titulo={f.nombre}
            estado={<BadgeEstadoStock estado={f.estado} />}
            subtitulo={lineaProducto(f) || undefined}
            meta={
              <span className="flex flex-col gap-0.5">
                <span className={cn('text-xs', f.estado === 'negativo' ? 'text-danger-text' : 'text-fg-secondary')}>
                  {f.por_sucursal.map((s) => `${s.sucursal} ${cantFila(f, s.existencia)}`).join(' · ')}
                  {f.reservado > 0 && ` · ${t('columnas.reservadas', { count: f.reservado, n: cantFila(f, f.reservado) })}`}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-fg">{t('movil.disponibles', { n: cantFila(f, f.disponible) })}</span>
                  <span className="text-xs text-fg-secondary">{t('movil.minimo', { n: cantFila(f, f.minimo) })}</span>
                </span>
              </span>
            }
            acciones={accionesFila(f)}
            onClick={() => router.push(rutaKardexCompleto(f.product_id))}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
            onMantenerPulsado={() => ctx.alternar(true)}
            className={f.estado === 'negativo' ? 'border-line-danger bg-danger-subtle' : undefined}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Boxes,
          accion: permisos.ajustar ? { etiqueta: t('vacio.accion'), onClick: abrirEntrada, icono: ArrowDownCircle } : { etiqueta: t('vacio.productos'), href: '/app/inventario/productos' },
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('errorCarga') }}
        sinPermiso={{ titulo: tc('sinPermisoTitulo'), descripcion: tc('sinPermisoDescripcion') }}
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
        onSeleccionarTodos={() => void seleccionarTodos()}
        sustantivo={sustantivo}
        acciones={[
          ...(permisos.trasladar
            ? [
                {
                  id: 'trasladar',
                  etiqueta: t('masivas.trasladar'),
                  icono: ArrowLeftRight,
                  deshabilitada: movibles.length !== 1,
                  motivo: t('masivas.unProducto'),
                  onClick: () => movibles[0] && router.push(rutaTransferencia(movibles[0].product_id, alcance.todas ? null : alcance.sucursalActiva)),
                },
              ]
            : []),
          ...(permisos.ajustar
            ? [
                {
                  id: 'conteo',
                  etiqueta: t('masivas.conteo'),
                  icono: ClipboardCheck,
                  deshabilitada: movibles.length === 0,
                  motivo: t('acciones.soloVariantes'),
                  onClick: () => router.push(rutaAjustePorConteo(movibles.map((f) => f.product_id), alcance.todas ? null : alcance.sucursalActiva)),
                },
              ]
            : []),
          ...(permisos.ajustar || permisos.editar_catalogo
            ? [
                {
                  id: 'minimo',
                  etiqueta: t('masivas.minimo'),
                  icono: SlidersHorizontal,
                  deshabilitada: movibles.length !== 1,
                  motivo: t('masivas.unProducto'),
                  onClick: () => movibles[0] && setDialogo({ tipo: 'minimo', fila: movibles[0] }),
                },
              ]
            : []),
          { id: 'exportar', etiqueta: t('masivas.exportar'), icono: Download, onClick: () => void exportar(true), cargando: exportando },
        ]}
        onLimpiar={() => cambiarSeleccion(new Set())}
      />

      <DialogoRegistrarMovimiento
        abierto={dialogo?.tipo === 'in' || dialogo?.tipo === 'out'}
        onAbiertoChange={(v) => !v && setDialogo(null)}
        direccion={dialogo?.tipo === 'out' ? 'out' : 'in'}
        organizacionId={organizacionId}
        producto={dialogo?.fila && puedeMover(dialogo.fila) ? dialogo.fila : null}
        sucursalId={alcance.todas ? dialogo?.fila?.por_sucursal[0]?.branch_id ?? alcance.sucursalActiva : alcance.sucursalActiva}
        verCostos={verCostos}
        onRegistrado={recargar}
      />
      <DialogoStockMinimo
        abierto={dialogo?.tipo === 'minimo'}
        onAbiertoChange={(v) => !v && setDialogo(null)}
        organizacionId={organizacionId}
        producto={dialogo?.fila ?? null}
        onGuardado={recargar}
      />
    </div>
  );
}

export function BadgeEstadoStock({ estado }: { estado: EstadoStock }) {
  const t = useTranslations('inventarioStock.estados');
  return (
    <Badge tono={TONO_ESTADO_STOCK[estado]} tamano="sm" apariencia={estado === 'agotado' ? 'solido' : 'suave'} data-estado={estado}>
      {t(estado)}
    </Badge>
  );
}

export default StockPage;
