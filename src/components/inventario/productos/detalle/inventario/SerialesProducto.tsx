'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowRightLeft,
  Barcode,
  Copy,
  Download,
  ExternalLink,
  History,
  Package,
  Plus,
  ScanLine,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { AccionRapida } from '@/components/kit/AccionRapida';
import { BulkActionBar } from '@/components/kit/BulkActionBar';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit/DataTable';
import { EmptyState } from '@/components/kit/EmptyState';
import { FilterChips, type ChipFiltro } from '@/components/kit/FilterChips';
import { FilterPanel } from '@/components/kit/FilterPanel';
import { FormField } from '@/components/kit/FormField';
import { KpiStrip } from '@/components/kit/KpiStrip';
import { ListCard } from '@/components/kit/ListCard';
import { ListToolbar } from '@/components/kit/ListToolbar';
import { Pagination } from '@/components/kit/Pagination';
import { SearchInput } from '@/components/kit/SearchInput';
import { StatCard } from '@/components/kit/StatCard';
import type { AccionFila } from '@/components/kit/acciones';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { CreateClaimDialog } from '@/components/inventario/garantias/CreateClaimDialog';
import { formatDateInTz, formatPlainDate } from '@/lib/utils/dateDisplay';
import { useProductoDetalle } from '../ContextoProducto';
import {
  ESTADOS_SERIAL_FILTRO,
  estadoGarantia,
  transicionesComunes,
  transicionesSerial,
  type EstadoSerial,
} from '../../logica/seriales';
import { DialogoEstadoSerial } from './seriales/DialogoEstadoSerial';
import { DialogoGenerarSeriales, type ProductoSerializable, type SucursalSerial } from './seriales/DialogoGenerarSeriales';
import { TrazabilidadSerialSheet } from './seriales/TrazabilidadSerialSheet';
import { ESTADOS_SERIAL_TODOS, EstadoSerialBadge, GarantiaSerial, useEtiquetaEstadoSerial } from './seriales/piezas';
import {
  FILTROS_GARANTIA,
  FILTROS_VACIOS,
  buscarSerialExacto,
  construirCsv,
  filtrarSeriales,
  nombreArchivoCsv,
  serialesOcupando,
  totalSinSerial,
  type FilaSerial,
  type FiltroGarantia,
  type FiltrosSeriales,
} from './seriales/listadoSeriales';
import { useSerialesProducto } from './seriales/useSerialesProducto';

/**
 * Inventario › Seriales del detalle de producto (Figma «Producto — Seriales»,
 * PARIDAD A.7). Conserva todo lo de la pestaña anterior (resumen, badges,
 * generación masiva con cupo por sucursal, stats, buscador, filtro de estado,
 * CSV, tabla de 8 columnas, reclamo de garantía, paginación) y agrega:
 * seriales de las variantes, filtros de sucursal y garantía, alta por lista o
 * escáner, cambio de estado (fila y selección), trazabilidad en un panel y
 * tarjetas en móvil.
 */

const CLAVE_ESTADO = 'estado';
const CLAVE_SUCURSAL = 'sucursal';
const CLAVE_GARANTIA = 'garantia';
const CLAVE_VARIANTE = 'variante';
const TODOS = '__todos__';

export function SerialesProducto() {
  const t = useTranslations('productoDetalle.seriales');
  const tc = useTranslations('productoDetalle.comun');
  const { producto, organizacionId, resumen, cargandoResumen, permisos, moneda, fechas, sucursalActiva, recargarResumen } =
    useProductoDetalle();
  const router = useRouter();
  const { toast } = useToast();
  const escritorio = useEsEscritorio();
  const localeIntl = useLocaleIntl();
  const entero = useFormatoEntero();
  const etiquetaEstado = useEtiquetaEstadoSerial();

  const variantes = useMemo(() => (producto.children ?? []).filter((v) => v.status !== 'deleted'), [producto.children]);
  const tieneVariantes = variantes.length > 0;
  const ids = useMemo(() => [producto.id, ...variantes.map((v) => v.id)], [producto.id, variantes]);
  const trackSerial = !!producto.track_serial;
  const registrados = resumen?.conteos.seriales ?? 0;
  const activo = trackSerial || registrados > 0;

  const { filas, stock, cargando, error, recargar: recargarLista } = useSerialesProducto(organizacionId, ids, activo);
  const hoy = fechas.getToday();

  // ── Filtros, página y selección ─────────────────────────────────────────
  const [filtros, setFiltros] = useState<FiltrosSeriales>(() => ({ ...FILTROS_VACIOS, sucursal: sucursalActiva }));
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(10);
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());

  // El selector global de sucursal filtra por la sucursal actual del serial.
  useEffect(() => {
    setFiltros((f) => ({ ...f, sucursal: sucursalActiva }));
  }, [sucursalActiva]);

  const cambiarFiltro = useCallback((parcial: Partial<FiltrosSeriales>) => {
    setFiltros((f) => ({ ...f, ...parcial }));
    setPagina(1);
  }, []);

  const filtradas = useMemo(() => filtrarSeriales(filas, filtros, hoy), [filas, filtros, hoy]);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / tamano));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visibles = useMemo(
    () => filtradas.slice((paginaSegura - 1) * tamano, paginaSegura * tamano),
    [filtradas, paginaSegura, tamano],
  );

  // La selección solo guarda seriales que siguen existiendo tras recargar.
  useEffect(() => {
    setSeleccion((s) => {
      if (s.size === 0) return s;
      const existentes = new Set(filas.map((f) => String(f.id)));
      const nueva = new Set([...s].filter((id) => existentes.has(id)));
      return nueva.size === s.size ? s : nueva;
    });
  }, [filas]);

  const seleccionadas = useMemo(() => filas.filter((f) => seleccion.has(String(f.id))), [filas, seleccion]);

  // ── Datos derivados ─────────────────────────────────────────────────────
  const nombreProducto = useCallback(
    (pid: number): string => {
      if (pid === producto.id) return t('tabla.productoBase');
      const v = variantes.find((x) => x.id === pid);
      if (!v) return t('tabla.varianteN', { id: pid });
      const atributos = v.variant_data ? Object.values(v.variant_data).filter(Boolean).join(' / ') : '';
      return atributos || v.name;
    },
    [producto.id, variantes, t],
  );

  const ocupando = useMemo(() => serialesOcupando(filas), [filas]);
  const sinSerial = useMemo(() => totalSinSerial(stock, ocupando), [stock, ocupando]);

  const conteoPorEstado = useMemo<Record<string, number>>(() => {
    if (resumen && Object.keys(resumen.conteos.seriales_por_estado).length > 0) return resumen.conteos.seriales_por_estado;
    const c: Record<string, number> = {};
    for (const f of filas) c[f.status] = (c[f.status] ?? 0) + 1;
    return c;
  }, [resumen, filas]);
  const totalSeriales = resumen?.conteos.seriales ?? filas.length;

  const sucursalesFiltro = useMemo<SucursalSerial[]>(() => {
    const mapa = new Map<number, string>();
    for (const s of resumen?.sucursales ?? []) mapa.set(s.branch_id, s.nombre);
    for (const f of filas) if (f.current_branch_id !== null && !mapa.has(f.current_branch_id)) mapa.set(f.current_branch_id, f.sucursal ?? t('traza.sucursalN', { id: f.current_branch_id }));
    return [...mapa.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [resumen, filas, t]);

  const sucursalesDestino = useMemo<SucursalSerial[]>(
    () => (resumen?.sucursales ?? []).filter((s) => s.activa).map((s) => ({ id: s.branch_id, nombre: s.nombre })),
    [resumen],
  );

  const productosSerializables = useMemo<ProductoSerializable[]>(() => {
    const base: ProductoSerializable = { id: producto.id, sku: producto.sku, nombre: producto.name, esVariante: false };
    if (!tieneVariantes) return [base];
    const baseConStock = [...stock.entries()].some(([k, q]) => k.startsWith(`${producto.id}:`) && q > 0);
    const deVariantes = variantes.map<ProductoSerializable>((v) => ({ id: v.id, sku: v.sku, nombre: nombreProducto(v.id), esVariante: true }));
    return baseConStock ? [base, ...deVariantes] : deVariantes;
  }, [producto.id, producto.sku, producto.name, tieneVariantes, variantes, stock, nombreProducto]);

  // ── Permisos ────────────────────────────────────────────────────────────
  const puedeGenerar = trackSerial && (permisos.editar || permisos.crear || permisos.ajustar);
  const motivoGenerar = !trackSerial ? t('generar.motivoInactivo') : !puedeGenerar ? tc('sinPermiso') : undefined;
  const puedeCambiar = permisos.editar || permisos.ajustar;

  // ── Diálogos ────────────────────────────────────────────────────────────
  const [generarAbierto, setGenerarAbierto] = useState(false);
  const [estadoDe, setEstadoDe] = useState<{ seriales: FilaSerial[]; opciones: EstadoSerial[] } | null>(null);
  const [reclamoId, setReclamoId] = useState<number | null>(null);
  const [trazaId, setTrazaId] = useState<number | null>(null);

  const recargarTodo = useCallback(() => {
    void recargarLista();
    void recargarResumen();
  }, [recargarLista, recargarResumen]);

  const abrirCambioEstado = useCallback((seriales: FilaSerial[]) => {
    const opciones = transicionesComunes(seriales.map((s) => s.status));
    setEstadoDe({ seriales, opciones });
  }, []);

  const copiarSerial = useCallback(
    async (serial: string) => {
      try {
        await navigator.clipboard.writeText(serial);
        toast({ title: t('acciones.copiado'), description: serial });
      } catch {
        toast({ variant: 'destructive', title: t('acciones.copiarError') });
      }
    },
    [toast, t],
  );

  const accionesDe = useCallback(
    (f: FilaSerial): AccionFila[] => {
      const transiciones = transicionesSerial(f.status);
      return [
        { id: 'traza', etiqueta: t('acciones.verTrazabilidad'), icono: History, onSelect: () => setTrazaId(f.id) },
        {
          id: 'estado',
          etiqueta: t('acciones.cambiarEstado'),
          icono: ArrowRightLeft,
          onSelect: () => abrirCambioEstado([f]),
          oculta: transiciones.length === 0,
          deshabilitada: !puedeCambiar,
          motivo: !puedeCambiar ? tc('sinPermiso') : undefined,
        },
        {
          id: 'reclamo',
          etiqueta: t('acciones.reclamo'),
          icono: ShieldCheck,
          onSelect: () => setReclamoId(f.id),
          oculta: f.status !== 'sold',
        },
        { id: 'copiar', etiqueta: t('acciones.copiar'), icono: Copy, onSelect: () => void copiarSerial(f.serial), separadorAntes: true },
        { id: 'ficha', etiqueta: t('acciones.abrirFicha'), icono: ExternalLink, onSelect: () => router.push(`/app/inventario/seriales/${f.id}`) },
      ];
    },
    [t, tc, puedeCambiar, abrirCambioEstado, copiarSerial, router],
  );

  // ── Búsqueda exacta (Enter o lector de códigos) ────────────────────────
  const buscadorRef = useRef<HTMLInputElement | null>(null);
  const alPulsarEnBuscador = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return;
    const exacto = buscarSerialExacto(filas, e.target.value);
    if (exacto) setTrazaId(exacto.id);
  };

  // ── Exportar ────────────────────────────────────────────────────────────
  const exportar = useCallback(
    (lista: readonly FilaSerial[]) => {
      if (lista.length === 0) return;
      const fecha = (v: string | null) => (v ? formatDateInTz(v, fechas.timezone, { locale: localeIntl }) : '');
      const encabezados = [
        t('csv.serial'),
        ...(tieneVariantes ? [t('csv.variante')] : []),
        t('csv.estado'),
        t('csv.sucursal'),
        t('csv.cliente'),
        t('csv.recepcion'),
        t('csv.venta'),
        t('csv.garantiaInicio'),
        t('csv.garantiaFin'),
        t('csv.costo'),
        t('csv.precio'),
      ];
      const datos = lista.map((f) => [
        f.serial,
        ...(tieneVariantes ? [nombreProducto(f.product_id)] : []),
        etiquetaEstado(f.status),
        f.sucursal ?? '',
        f.cliente ?? '',
        fecha(f.received_date),
        fecha(f.sale_date),
        formatPlainDate(f.warranty_start),
        formatPlainDate(f.warranty_end),
        f.cost_at_purchase ?? '',
        f.price_at_sale ?? '',
      ]);
      const blob = new Blob([construirCsv(encabezados, datos)], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombreArchivoCsv(producto.sku, producto.id, hoy);
      enlace.click();
      URL.revokeObjectURL(url);
      toast({ title: t('csv.exportado', { count: lista.length }) });
    },
    [fechas.timezone, localeIntl, t, tieneVariantes, nombreProducto, etiquetaEstado, producto.sku, producto.id, hoy, toast],
  );

  // ── Columnas ────────────────────────────────────────────────────────────
  const fechaCorta = useCallback(
    (v: string | null) => (v ? formatDateInTz(v, fechas.timezone, { locale: localeIntl, day: 'numeric', month: 'short', year: 'numeric' }) : '—'),
    [fechas.timezone, localeIntl],
  );
  const importe = useCallback((v: number | null) => (v ? moneda.formatear(v) : '—'), [moneda]);

  const columnas = useMemo<ColumnaTabla<FilaSerial>[]>(() => {
    const cols: (ColumnaTabla<FilaSerial> | null)[] = [
      {
        id: 'serial',
        encabezado: t('columnas.serial'),
        variante: 'mono',
        celda: (f) => <span className="font-medium text-link">{f.serial}</span>,
      },
      tieneVariantes
        ? { id: 'variante', encabezado: t('columnas.variante'), ocultarDebajo: 'xl', celda: (f) => nombreProducto(f.product_id) }
        : null,
      { id: 'estado', encabezado: t('columnas.estado'), celda: (f) => <EstadoSerialBadge estado={f.status} tamano="sm" /> },
      {
        id: 'garantia',
        encabezado: t('columnas.garantia'),
        celda: (f) => (
          <span className="text-xs">
            <GarantiaSerial inicio={f.warranty_start} fin={f.warranty_end} hoy={hoy} />
          </span>
        ),
      },
      { id: 'costo', encabezado: t('columnas.costo'), variante: 'importe', celda: (f) => importe(f.cost_at_purchase) },
      { id: 'precio', encabezado: t('columnas.precio'), variante: 'importe', celda: (f) => importe(f.price_at_sale) },
      {
        id: 'cliente',
        encabezado: t('columnas.cliente'),
        celda: (f) => (f.cliente ? f.cliente : <span className="text-fg-muted">{t('tabla.sinCliente')}</span>),
      },
      { id: 'sucursal', encabezado: t('columnas.sucursal'), ocultarDebajo: 'xl', celda: (f) => f.sucursal ?? '—' },
      { id: 'recepcion', encabezado: t('columnas.recepcion'), celda: (f) => <span className="whitespace-nowrap">{fechaCorta(f.received_date)}</span> },
    ];
    return cols.filter((c): c is ColumnaTabla<FilaSerial> => c !== null);
  }, [t, tieneVariantes, nombreProducto, hoy, importe, fechaCorta]);

  // ── Chips y campos de filtro ────────────────────────────────────────────
  const nombreSucursal = (id: number) => sucursalesFiltro.find((s) => s.id === id)?.nombre ?? t('traza.sucursalN', { id });
  const chips: ChipFiltro[] = [
    filtros.estado ? { clave: CLAVE_ESTADO, etiqueta: t('chips.estado', { valor: etiquetaEstado(filtros.estado) }) } : null,
    filtros.sucursal !== null ? { clave: CLAVE_SUCURSAL, etiqueta: t('chips.sucursal', { valor: nombreSucursal(filtros.sucursal) }) } : null,
    filtros.garantia ? { clave: CLAVE_GARANTIA, etiqueta: t('chips.garantia', { valor: t(`garantias.${filtros.garantia}`) }) } : null,
    filtros.variante !== null ? { clave: CLAVE_VARIANTE, etiqueta: t('chips.variante', { valor: nombreProducto(filtros.variante) }) } : null,
  ].filter((c): c is ChipFiltro => c !== null);

  const quitarChip = (clave: string) => {
    if (clave === CLAVE_ESTADO) cambiarFiltro({ estado: null });
    if (clave === CLAVE_SUCURSAL) cambiarFiltro({ sucursal: null });
    if (clave === CLAVE_GARANTIA) cambiarFiltro({ garantia: null });
    if (clave === CLAVE_VARIANTE) cambiarFiltro({ variante: null });
  };
  const limpiarFiltros = () => cambiarFiltro({ estado: null, sucursal: null, garantia: null, variante: null });
  const limpiarTodo = () => cambiarFiltro({ ...FILTROS_VACIOS });

  const selectEstado = (compacto: boolean) => (
    <Select value={filtros.estado ?? TODOS} onValueChange={(v) => cambiarFiltro({ estado: v === TODOS ? null : v })}>
      <SelectTrigger className={compacto ? 'h-10 w-[180px]' : 'w-full'} aria-label={t('filtros.estado')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{t('filtros.todosEstados')}</SelectItem>
        {ESTADOS_SERIAL_FILTRO.map((e) => (
          <SelectItem key={e} value={e}>
            {etiquetaEstado(e)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const selectSucursal = (compacto: boolean) => (
    <Select value={filtros.sucursal !== null ? String(filtros.sucursal) : TODOS} onValueChange={(v) => cambiarFiltro({ sucursal: v === TODOS ? null : Number(v) })}>
      <SelectTrigger className={compacto ? 'h-10 w-[200px]' : 'w-full'} aria-label={t('filtros.sucursal')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{compacto ? t('filtros.todasSucursales') : tc('todasSucursales')}</SelectItem>
        {sucursalesFiltro.map((s) => (
          <SelectItem key={s.id} value={String(s.id)}>
            {s.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const selectGarantia = (
    <Select value={filtros.garantia ?? TODOS} onValueChange={(v) => cambiarFiltro({ garantia: v === TODOS ? null : (v as FiltroGarantia) })}>
      <SelectTrigger className="w-full" aria-label={t('filtros.garantia')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{t('filtros.todasGarantias')}</SelectItem>
        {FILTROS_GARANTIA.map((g) => (
          <SelectItem key={g} value={g}>
            {t(`garantias.${g}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const selectVariante = (
    <Select value={filtros.variante !== null ? String(filtros.variante) : TODOS} onValueChange={(v) => cambiarFiltro({ variante: v === TODOS ? null : Number(v) })}>
      <SelectTrigger className="w-full" aria-label={t('filtros.variante')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{t('filtros.todasVariantes')}</SelectItem>
        {[producto.id, ...variantes.map((v) => v.id)].map((id) => (
          <SelectItem key={id} value={String(id)}>
            {nombreProducto(id)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const conteoPanel = escritorio
    ? (filtros.garantia ? 1 : 0) + (filtros.variante !== null ? 1 : 0)
    : chips.length;

  const panelFiltros = (
    <FilterPanel
      conteo={conteoPanel}
      onLimpiar={escritorio ? () => cambiarFiltro({ garantia: null, variante: null }) : limpiarFiltros}
      textoVerResultados={t('filtros.verResultados', { count: filtradas.length })}
    >
      {!escritorio && (
        <>
          <FormField etiqueta={t('filtros.estado')}>{selectEstado(false)}</FormField>
          <FormField etiqueta={t('filtros.sucursal')}>{selectSucursal(false)}</FormField>
        </>
      )}
      <FormField etiqueta={t('filtros.garantia')} ayuda={t('filtros.garantiaAyuda')}>
        {selectGarantia}
      </FormField>
      {tieneVariantes && <FormField etiqueta={t('filtros.variante')}>{selectVariante}</FormField>}
    </FilterPanel>
  );

  // ── Render ──────────────────────────────────────────────────────────────
  const hrefEditar = `/app/inventario/productos/${producto.uuid || producto.id}/editar#inventario`;

  if (!trackSerial && !resumen && cargandoResumen) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={tc('cargando')}>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!activo) {
    return (
      <EmptyState
        icono={Barcode}
        titulo={t('sinSeriales.titulo')}
        descripcion={t('sinSeriales.descripcion')}
        accion={{ etiqueta: t('sinSeriales.editar'), href: hrefEditar }}
      />
    );
  }

  const estadoTabla: EstadoTabla = cargando && filas.length === 0
    ? 'cargando'
    : error
      ? 'error'
      : filas.length === 0
        ? 'vacio'
        : filtradas.length === 0
          ? 'sinResultados'
          : 'listo';

  const serialTraza = trazaId !== null ? filas.find((f) => f.id === trazaId) ?? null : null;
  const transicionesTraza = serialTraza ? transicionesSerial(serialTraza.status) : [];
  const comunesSeleccion = transicionesComunes(seleccionadas.map((s) => s.status));
  const extras = ESTADOS_SERIAL_TODOS.filter(
    (e) => !['in_stock', 'reserved', 'sold'].includes(e) && (conteoPorEstado[e] ?? 0) > 0,
  );

  return (
    <div className="space-y-4">
      {/* Resumen del producto y configuración de seriales */}
      <section className="space-y-3 rounded-xl border border-line bg-surface p-4" aria-label={t('resumen.etiqueta')}>
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand" aria-hidden="true">
            <Package className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-fg">{producto.name}</p>
            <p className="text-xs text-fg-secondary">
              <span className="font-mono">{t('resumen.sku', { sku: producto.sku })}</span>
              {resumen?.precio !== null && resumen?.precio !== undefined && <> · {t('resumen.precio', { valor: moneda.formatear(resumen.precio) })}</>}
              {resumen?.costo !== null && resumen?.costo !== undefined && <> · {t('resumen.costo', { valor: moneda.formatear(resumen.costo) })}</>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {trackSerial && (
            <Badge tono="marca" icono={Barcode}>
              {t('badges.trazabilidad')}
            </Badge>
          )}
          {trackSerial && producto.auto_generate_serial && (
            <Badge tono="informacion" icono={Sparkles}>
              {t('badges.autoGeneracion')}
            </Badge>
          )}
          {!!producto.warranty_months && (
            <Badge tono="exito" icono={ShieldCheck}>
              {t('badges.garantia', { count: producto.warranty_months })}
            </Badge>
          )}
          {producto.serial_pattern && (
            <Badge tono="neutro" className="font-mono">
              {t('badges.patron', { patron: producto.serial_pattern })}
            </Badge>
          )}
          {sinSerial > 0 && (
            <Badge tono="advertencia" className="lg:hidden">
              {t('stock.sinSerial', { count: sinSerial })}
            </Badge>
          )}
          <span className="ml-auto">
            <AccionRapida
              etiqueta={escritorio ? t('acciones.generar') : t('acciones.generarCorto')}
              icono={Plus}
              onClick={() => setGenerarAbierto(true)}
              deshabilitada={!puedeGenerar}
              motivo={motivoGenerar}
            />
          </span>
        </div>

        <p className="hidden flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-secondary lg:flex">
          <span>{t('stock.total', { count: resumen?.stock_total ?? 0 })}</span>
          <span aria-hidden="true">·</span>
          <span>{t('stock.generados', { valor: entero(totalSeriales) })}</span>
          {sinSerial > 0 && (
            <Badge tono="advertencia" tamano="sm">
              {t('stock.sinSerial', { count: sinSerial })}
            </Badge>
          )}
        </p>

        {tieneVariantes && <p className="text-xs text-fg-muted">{t('resumen.variantes', { count: variantes.length })}</p>}

        {!trackSerial && (
          <p className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-sm text-warning-text">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('inactivo.aviso', { count: registrados })}
          </p>
        )}
      </section>

      {/* Estadísticas por estado (clic = filtrar) */}
      <KpiStrip etiqueta={t('stats.etiqueta')} columnas={4}>
        <StatCard etiqueta={t('stats.total')} valor={entero(totalSeriales)} cargando={cargandoResumen && !resumen} onClick={() => cambiarFiltro({ estado: null })} />
        <StatCard
          etiqueta={t('stats.enStock')}
          valor={entero(conteoPorEstado.in_stock ?? 0)}
          tono="exito"
          cargando={cargandoResumen && !resumen}
          onClick={() => cambiarFiltro({ estado: 'in_stock' })}
        />
        <StatCard
          etiqueta={t('stats.reservados')}
          valor={entero(conteoPorEstado.reserved ?? 0)}
          tono="informacion"
          cargando={cargandoResumen && !resumen}
          onClick={() => cambiarFiltro({ estado: 'reserved' })}
        />
        <StatCard
          etiqueta={t('stats.vendidos')}
          valor={entero(conteoPorEstado.sold ?? 0)}
          tono="marca"
          cargando={cargandoResumen && !resumen}
          onClick={() => cambiarFiltro({ estado: 'sold' })}
        />
      </KpiStrip>

      {extras.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label={t('stats.otros')}>
          <span className="text-xs text-fg-secondary">{t('stats.otros')}</span>
          {extras.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => cambiarFiltro({ estado: filtros.estado === e ? null : e })}
              aria-pressed={filtros.estado === e}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Badge tono={filtros.estado === e ? 'marca' : 'neutro'} apariencia={filtros.estado === e ? 'solido' : 'suave'} tamano="sm">
                {etiquetaEstado(e)} · {entero(conteoPorEstado[e] ?? 0)}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {/* Buscador, filtros y exportar */}
      <ListToolbar
        busqueda={
          <div onKeyDown={alPulsarEnBuscador}>
            <SearchInput
              ref={buscadorRef}
              value={filtros.texto}
              onChange={(v) => cambiarFiltro({ texto: v })}
              debounceMs={250}
              placeholder={escritorio ? t('filtros.buscar') : t('filtros.buscarCorto')}
              etiqueta={t('filtros.buscarEtiqueta')}
              cargando={cargando && filas.length > 0}
              accesorio={
                <button
                  type="button"
                  aria-label={t('filtros.escanear')}
                  title={t('filtros.escanearAyuda')}
                  onClick={() => {
                    buscadorRef.current?.focus();
                    buscadorRef.current?.select();
                  }}
                  className="flex size-7 items-center justify-center rounded-md text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <ScanLine aria-hidden="true" className="size-4" strokeWidth={1.75} />
                </button>
              }
            />
          </div>
        }
        filtros={
          <div className="flex shrink-0 items-center gap-2">
            {escritorio && selectEstado(true)}
            {escritorio && selectSucursal(true)}
            {panelFiltros}
            <Button
              variant="outline"
              className="h-10"
              onClick={() => exportar(filtradas)}
              disabled={filtradas.length === 0}
              aria-label={t('acciones.exportar')}
            >
              <Download aria-hidden="true" className="size-4 lg:mr-2" />
              <span className="hidden lg:inline">{tc('exportar')}</span>
            </Button>
          </div>
        }
        chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={limpiarFiltros} />}
      />

      <DataTable<FilaSerial>
        etiqueta={t('tabla.etiqueta')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(f) => String(f.id)}
        estado={estadoTabla}
        densidad="compacta"
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        onFilaClick={(f) => router.push(`/app/inventario/seriales/${f.id}`)}
        etiquetaFila={(f) => f.serial}
        acciones={accionesDe}
        accionesRapidas={(f) => (
          <span className="flex items-center gap-1">
            {f.status === 'sold' && <AccionRapida etiqueta={t('acciones.reclamoCorto')} icono={ShieldCheck} onClick={() => setReclamoId(f.id)} />}
            <AccionRapida etiqueta={t('acciones.abrirFicha')} icono={ExternalLink} soloIcono href={`/app/inventario/seriales/${f.id}`} />
          </span>
        )}
        tarjetaMovil={(f, ctx) => {
          const g = estadoGarantia(f.warranty_end, hoy);
          return (
            <ListCard
              titulo={f.serial}
              estado={<EstadoSerialBadge estado={f.status} tamano="sm" />}
              subtitulo={
                <span className="flex flex-wrap items-center gap-x-1.5">
                  <span>{t('tabla.recibido', { fecha: fechaCorta(f.received_date) })}</span>
                  <span aria-hidden="true">·</span>
                  {g.estado === 'sin_garantia' ? (
                    <span>{t('tabla.garantiaNo')}</span>
                  ) : (
                    <GarantiaSerial inicio={f.warranty_start} fin={f.warranty_end} hoy={hoy} compacta />
                  )}
                </span>
              }
              meta={[f.cliente ?? t('tabla.sinCliente'), tieneVariantes ? nombreProducto(f.product_id) : null].filter(Boolean).join(' · ')}
              valor={f.cost_at_purchase ? t('tabla.costoMovil', { valor: moneda.formatear(f.cost_at_purchase) }) : undefined}
              acciones={accionesDe(f)}
              seleccionable={ctx.modoSeleccion}
              seleccionado={ctx.seleccionado}
              onSeleccionChange={ctx.alternar}
              onMantenerPulsado={() => ctx.alternar(true)}
              onClick={() => setTrazaId(f.id)}
            />
          );
        }}
        vacio={{
          icono: Barcode,
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          accion: puedeGenerar ? { etiqueta: t('acciones.generar'), onClick: () => setGenerarAbierto(true), icono: Plus } : undefined,
        }}
        sinResultados={{ titulo: t('sinResultados.titulo'), descripcion: t('sinResultados.descripcion') }}
        error={{ titulo: t('error.titulo'), descripcion: tc('errorCargar') }}
        onReintentar={() => void recargarLista()}
        onLimpiarFiltros={limpiarTodo}
        termino={filtros.texto || undefined}
        filasEsqueleto={5}
        pie={
          <Pagination
            pagina={paginaSegura}
            tamano={tamano}
            total={filtradas.length}
            onPaginaChange={setPagina}
            onTamanoChange={(n) => {
              setTamano(n);
              setPagina(1);
            }}
            opcionesTamano={[10, 20, 50, 100]}
            sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
            cargando={cargando}
          />
        }
      />

      {seleccion.size > 0 && (
        <BulkActionBar
          seleccionados={seleccion.size}
          total={filtradas.length}
          onSeleccionarTodos={() => setSeleccion(new Set(filtradas.map((f) => String(f.id))))}
          sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
          acciones={[
            {
              id: 'estado',
              etiqueta: t('acciones.cambiarEstado'),
              icono: ArrowRightLeft,
              onClick: () => abrirCambioEstado(seleccionadas),
              deshabilitada: !puedeCambiar || comunesSeleccion.length === 0,
              motivo: !puedeCambiar ? tc('sinPermiso') : comunesSeleccion.length === 0 ? t('acciones.sinTransiciones') : undefined,
            },
            { id: 'exportar', etiqueta: t('acciones.exportarSeleccion'), icono: Download, onClick: () => exportar(seleccionadas) },
          ]}
          onLimpiar={() => setSeleccion(new Set())}
        />
      )}

      <DialogoGenerarSeriales
        abierto={generarAbierto}
        onAbiertoChange={setGenerarAbierto}
        productos={productosSerializables}
        sucursales={sucursalesDestino}
        filas={filas}
        stock={stock}
        onHecho={() => void recargarLista()}
      />

      <DialogoEstadoSerial
        abierto={estadoDe !== null}
        onAbiertoChange={(v) => !v && setEstadoDe(null)}
        seriales={estadoDe?.seriales ?? []}
        opciones={estadoDe?.opciones ?? []}
        onHecho={() => {
          setSeleccion(new Set());
          void recargarLista();
        }}
      />

      <TrazabilidadSerialSheet
        serialId={trazaId}
        abierto={trazaId !== null}
        onAbiertoChange={(v) => !v && setTrazaId(null)}
        nombreProducto={nombreProducto}
        acciones={
          serialTraza && (
            <>
              {serialTraza.status === 'sold' && (
                <Button variant="outline" onClick={() => setReclamoId(serialTraza.id)}>
                  <ShieldCheck aria-hidden="true" className="mr-2 size-4" />
                  {t('acciones.reclamo')}
                </Button>
              )}
              {transicionesTraza.length > 0 && (
                <AccionRapida
                  etiqueta={t('acciones.cambiarEstado')}
                  icono={ArrowRightLeft}
                  onClick={() => abrirCambioEstado([serialTraza])}
                  deshabilitada={!puedeCambiar}
                  motivo={!puedeCambiar ? tc('sinPermiso') : undefined}
                />
              )}
            </>
          )
        }
      />

      <CreateClaimDialog
        open={reclamoId !== null}
        onOpenChange={(v) => !v && setReclamoId(null)}
        preselectedSerialId={reclamoId}
        onCreated={() => {
          setReclamoId(null);
          recargarTodo();
        }}
      />
    </div>
  );
}
