'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Download, GitBranch, History, Layers, PackageMinus, Pencil, Plus, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react';
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
  RowActionsMenu,
  SearchInput,
  StatCard,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { BadgeVencimiento } from '@/components/kit/inventario';
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
import { cn } from '@/utils/Utils';
import { rutaKardexLote } from '../productos/detalle/inventario/stock/logicaInventario';
import { nombreArchivo } from '../stock/logica';
import { useAlcanceSucursales, useCantidadStock, useMensajeErrorInventario } from '../stock/useInventarioB1';
import { idsProductos } from '../stock/cantidadProducto';
import { useModosVenta } from '../stock/useModosVenta';
import { DialogoAjustarLote, DialogoEliminarLote, DialogoLote } from './DialogosLote';
import { listarLotes } from './LotesService';
import { ESTADOS_LOTE, type EstadoLote, type FiltrosLotes, type KpisLotes, type LoteFila } from './types';

const CAMPOS_ORDEN = ['vence', 'lote', 'cantidad', 'creado'] as const;
const LIMITE_EXPORTAR = 5000;
const UMBRALES = [15, 30, 60, 90] as const;

type Dialogo = { tipo: 'nuevo' } | { tipo: 'editar' | 'ajustar' | 'baja' | 'eliminar'; fila: LoteFila } | null;

/** Clave de una fila (un lote puede estar en varias sucursales). */
const claveFila = (f: LoteFila) => `${f.lot_id}:${f.branch_id ?? ''}`;

/**
 * Lotes (Figma «Lotes» 518:59165): una fila por lote y sucursal con su cantidad,
 * vencimiento y estado en el día de la organización (`fn_lotes_listado`). Alta
 * con cantidad inicial (entra por el ajuste aplicado y el kardex), ajustar
 * cantidad, dar de baja por merma, eliminar (solo sin existencias ni historia) y
 * rastrear (Trazabilidad, B4).
 */
export function LotesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations('inventarioLotes');
  const tp = useTranslations('inventario.permisos');
  const tv = useTranslations('inventario.vencimiento');
  const cantidad = useCantidadStock();
  const moneda = useMonedaOrganizacion();
  const { getToday, formatDate, formatPlain } = useFormatDate();
  const mensajeError = useMensajeErrorInventario();
  const permisos = usePermisosInventario();
  const alcance = useAlcanceSucursales();
  const organizacionId = getOrganizationId();

  const l = useListadoServidor({
    filtros: ['estado', 'producto', 'proveedor', 'existencias', 'umbral'],
    camposOrden: [...CAMPOS_ORDEN],
    ordenPorDefecto: { campo: 'vence', direccion: 'asc' },
    tamanoPorDefecto: 25,
  });

  // Trazabilidad enlaza con `?busqueda=<código>`: se pasa al buscador del listado.
  const busquedaExterna = params?.get('busqueda');
  useEffect(() => {
    if (busquedaExterna && !l.busqueda) l.setBusqueda(busquedaExterna);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaExterna]);

  const [filas, setFilas] = useState<LoteFila[]>([]);
  // Productos por peso o medida: «12,400 kg» en vez de «12,4 uds» (PRODUCTOS-POR-PESO-BASCULA.md §2.4).
  const idsFilas = useMemo(() => idsProductos(filas), [filas]);
  const { cantidadDe } = useModosVenta(idsFilas);
  const udsLote = (f: LoteFila) => cantidadDe(f.product_id, f.qty_on_hand, (numero) => t('uds', { n: numero }));
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<KpisLotes | null>(null);
  const [hoy, setHoy] = useState('');
  const [verCostos, setVerCostos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [estadoError, setEstadoError] = useState<'error' | 'sinPermiso' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [seleccionadas, setSeleccionadas] = useState<Map<string, LoteFila>>(new Map());
  const [exportando, setExportando] = useState(false);
  const [proveedores, setProveedores] = useState<{ id: number; name: string }[]>([]);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  const estados = (l.filtros.estado ?? '').split(',').filter((e): e is EstadoLote => (ESTADOS_LOTE as readonly string[]).includes(e));
  const producto = /^\d+$/.test(l.filtros.producto ?? '') ? Number(l.filtros.producto) : undefined;
  const proveedor = /^\d+$/.test(l.filtros.proveedor ?? '') ? Number(l.filtros.proveedor) : undefined;
  const conExistencias = l.filtros.existencias === '1';
  const umbral = UMBRALES.find((u) => String(u) === l.filtros.umbral) ?? 30;

  const filtrosServidor = useMemo<FiltrosLotes>(
    () => ({
      busqueda: l.busqueda || undefined,
      sucursales: alcance.sucursales,
      estados: estados.length ? estados : undefined,
      producto,
      proveedor,
      con_existencias: conExistencias || undefined,
      umbral,
      orden: (CAMPOS_ORDEN as readonly string[]).includes(l.orden?.campo ?? '') ? (l.orden!.campo as FiltrosLotes['orden']) : 'vence',
      direccion: l.orden?.direccion ?? 'asc',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [l.busqueda, alcance.sucursales, l.filtros.estado, producto, proveedor, conExistencias, umbral, l.orden?.campo, l.orden?.direccion],
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
    listarLotes(organizacionId, filtrosServidor, l.rango.desde, l.tamano)
      .then((r) => {
        if (!vivo) return;
        setFilas(r.filas);
        setTotal(r.total);
        setKpis(r.kpis);
        setHoy(r.hoy);
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

  useEffect(() => {
    if (!listo || !permisos.ver || !organizacionId) return;
    void supabase
      .from('suppliers')
      .select('id, name')
      .eq('organization_id', organizacionId)
      .order('name')
      .limit(500)
      .then(({ data }) => setProveedores((data ?? []) as { id: number; name: string }[]));
  }, [listo, permisos.ver, organizacionId]);

  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros, s: alcance.sucursales });
  useEffect(() => {
    setSeleccion(new Set());
    setSeleccionadas(new Map());
  }, [claveCriterios]);

  const cambiarSeleccion = (nueva: Set<string>) => {
    setSeleccion(nueva);
    setSeleccionadas((prev) => {
      const m = new Map<string, LoteFila>();
      nueva.forEach((id) => {
        const f = filas.find((x) => claveFila(x) === id) ?? prev.get(id);
        if (f) m.set(id, f);
      });
      return m;
    });
  };

  const todasLasFilas = async () => (await listarLotes(organizacionId, filtrosServidor, 0, Math.min(Math.max(total, 1), LIMITE_EXPORTAR))).filas;

  const exportar = async (soloSeleccion: boolean) => {
    setExportando(true);
    try {
      const datos = soloSeleccion ? [...seleccionadas.values()] : await todasLasFilas();
      if (datos.length === 0) {
        toast({ title: t('exportar.sinDatos') });
        return;
      }
      const csv = filasACsv(
        [t('csv.lote'), t('csv.producto'), t('csv.sku'), t('csv.sucursal'), t('csv.vence'), t('csv.dias'), t('csv.cantidad'), t('csv.reservado'), t('csv.costo'), t('csv.proveedor'), t('csv.estado'), t('csv.creado')],
        datos.map((f) => [
          f.lot_code,
          f.nombre,
          f.sku ?? '',
          f.sucursal ?? '',
          f.expiry_date ? formatPlain(f.expiry_date) : '',
          f.dias ?? '',
          f.qty_on_hand,
          f.qty_reserved,
          f.costo_promedio ?? '',
          f.proveedor ?? '',
          tv(f.estado),
          formatDate(f.creado),
        ]),
      );
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = nombreArchivo('lotes', getToday());
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

  const puedeCrear = permisos.crear || permisos.editar_catalogo;
  const accionesFila = (f: LoteFila): AccionFila[] => [
    { id: 'movimientos', etiqueta: t('acciones.movimientos'), icono: History, onSelect: () => router.push(rutaKardexLote(f.product_id, f.lot_id)) },
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, oculta: !puedeCrear, onSelect: () => setDialogo({ tipo: 'editar', fila: f }) },
    { id: 'ajustar', etiqueta: t('acciones.ajustar'), icono: SlidersHorizontal, oculta: !permisos.ajustar, onSelect: () => setDialogo({ tipo: 'ajustar', fila: f }) },
    {
      id: 'baja',
      etiqueta: t('acciones.baja'),
      icono: PackageMinus,
      oculta: !permisos.ajustar,
      deshabilitada: f.qty_on_hand <= 0,
      motivo: t('acciones.sinExistencias'),
      onSelect: () => setDialogo({ tipo: 'baja', fila: f }),
    },
    {
      id: 'rastrear',
      etiqueta: t('acciones.rastrear'),
      icono: GitBranch,
      onSelect: () => router.push(`/app/inventario/reportes/trazabilidad?codigo=${encodeURIComponent(f.lot_code)}`),
    },
    {
      id: 'eliminar',
      etiqueta: t('acciones.eliminar'),
      icono: Trash2,
      destructiva: true,
      separadorAntes: true,
      oculta: !permisos.eliminar,
      deshabilitada: f.qty_on_hand !== 0 || f.con_historia,
      motivo: f.qty_on_hand !== 0 ? t('acciones.conExistencias') : t('acciones.conHistoria'),
      onSelect: () => setDialogo({ tipo: 'eliminar', fila: f }),
    },
  ];

  const venceTexto = (f: LoteFila) => {
    if (f.dias === null) return t('sinCaducidad');
    if (f.dias < 0) return tv('vencioHace', { dias: Math.abs(f.dias) });
    if (f.dias === 0) return tv('venceHoy');
    return tv('venceEn', { dias: f.dias });
  };
  const claseVence = (f: LoteFila) => (f.estado === 'vencido' ? 'text-danger-text' : f.estado === 'por_vencer' ? 'text-warning-text' : 'text-fg-secondary');

  const chips: ChipFiltro[] = [
    ...(estados.length ? [{ clave: 'estado', etiqueta: estados.map((e) => tv(e)).join(' · ') }] : []),
    ...(producto ? [{ clave: 'producto', etiqueta: t('chips.producto', { nombre: filas.find((f) => f.product_id === producto)?.nombre ?? `#${producto}` }) }] : []),
    ...(proveedor ? [{ clave: 'proveedor', etiqueta: t('chips.proveedor', { nombre: proveedores.find((p) => p.id === proveedor)?.name ?? `#${proveedor}` }) }] : []),
    ...(conExistencias ? [{ clave: 'existencias', etiqueta: t('chips.conExistencias') }] : []),
    ...(l.filtros.umbral ? [{ clave: 'umbral', etiqueta: t('chips.umbral', { dias: umbral }) }] : []),
  ];

  const columnas: ColumnaTabla<LoteFila>[] = [
    {
      id: 'lote',
      encabezado: t('columnas.lote'),
      ordenable: true,
      campoOrden: 'lote',
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{f.lot_code}</span>
          <span className="text-xs text-fg-muted">{t('creado', { fecha: formatDate(f.creado) })}</span>
        </div>
      ),
    },
    {
      id: 'producto',
      encabezado: t('columnas.producto'),
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{f.nombre}</span>
          <span className="truncate text-xs text-fg-muted">{[f.sku ? t('sku', { sku: f.sku }) : null, f.atributos].filter(Boolean).join(' · ')}</span>
        </div>
      ),
    },
    { id: 'sucursal', encabezado: t('columnas.sucursal'), ocultarDebajo: 'md', celda: (f) => <span className="truncate text-fg">{f.sucursal ?? '—'}</span> },
    {
      id: 'vence',
      encabezado: t('columnas.vence'),
      ordenable: true,
      campoOrden: 'vence',
      celda: (f) => (
        <div className="flex flex-col tabular-nums">
          <span className="text-fg">{f.expiry_date ? formatPlain(f.expiry_date) : '—'}</span>
          <span className={cn('text-xs', claseVence(f))}>{venceTexto(f)}</span>
        </div>
      ),
    },
    {
      id: 'cantidad',
      encabezado: t('columnas.cantidad'),
      alinear: 'derecha',
      ordenable: true,
      campoOrden: 'cantidad',
      celda: (f) => <span className="font-semibold tabular-nums text-fg">{udsLote(f)}</span>,
    },
    {
      id: 'proveedor',
      encabezado: t('columnas.proveedor'),
      ocultarDebajo: 'lg',
      celda: (f) =>
        f.supplier_id ? (
          <Link href={`/app/inventario/proveedores/${f.supplier_id}`} className="truncate text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {f.proveedor}
          </Link>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (f) => <BadgeVencimiento expiry={f.expiry_date} hoy={hoy || getToday()} umbralDias={umbral} /> },
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
  const subtitulo = [getOrganizationName(), kpis ? t('subtitulo', { count: kpis.lotes, n: cantidad(kpis.lotes), uds: cantidad(kpis.uds) }) : null]
    .filter(Boolean)
    .join(' · ');

  const menuCabecera: AccionFila[] = [
    ...UMBRALES.map((u) => ({
      id: `umbral-${u}`,
      etiqueta: t('menu.umbral', { dias: u }),
      descripcion: u === umbral ? t('menu.actual') : undefined,
      icono: AlertTriangle,
      onSelect: () => l.setFiltro('umbral', u === 30 ? null : String(u)),
    })),
    { id: 'rastrear', etiqueta: t('menu.rastrear'), descripcion: t('menu.rastrearDetalle'), icono: GitBranch, separadorAntes: true, onSelect: () => router.push('/app/inventario/reportes/trazabilidad') },
  ];

  const cabecera = (
    <PageHeader
      titulo={t('titulo')}
      subtitulo={alcance.sinSucursal ? getOrganizationName() : subtitulo}
      icono={Layers}
      cargando={cargando && estadoError === null && !alcance.sinSucursal}
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
            {puedeCrear && (
              <Button className="h-10 gap-2" onClick={() => setDialogo({ tipo: 'nuevo' })}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
                {t('nuevo')}
              </Button>
            )}
            <RowActionsMenu orientacion="horizontal" titulo={t('titulo')} acciones={menuCabecera} className="size-10" />
          </>
        )
      }
      movil={{
        subtitulo: kpis ? t('subtituloMovil', { n: cantidad(kpis.lotes), porVencer: cantidad(kpis.por_vencer) }) : undefined,
        accion:
          puedeCrear && !alcance.sinSucursal && estadoError !== 'sinPermiso' ? (
            <Button variant="ghost" size="icon" className="size-10" onClick={() => setDialogo({ tipo: 'nuevo' })} aria-label={t('nuevo')}>
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </Button>
          ) : undefined,
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

  const filasDialogo = dialogo && dialogo.tipo !== 'nuevo' ? filas.filter((f) => f.lot_id === dialogo.fila.lot_id) : [];

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {cabecera}

      <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
        <StatCard
          etiqueta={t('kpis.vigentes')}
          cargando={!kpis}
          valor={kpis ? cantidad(kpis.vigentes) : '—'}
          tono="exito"
          tendencia="sube"
          detalle={kpis ? t('kpis.udsDisponibles', { n: cantidad(kpis.uds_vigentes) }) : undefined}
          onClick={() => l.setFiltro('estado', ['vigente', 'sin_vencimiento'])}
        />
        <StatCard
          etiqueta={t('kpis.porVencer')}
          cargando={!kpis}
          valor={kpis ? cantidad(kpis.por_vencer) : '—'}
          tono={kpis && kpis.por_vencer > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={kpis && kpis.por_vencer > 0 ? AlertTriangle : undefined}
          detalle={kpis ? t('kpis.porVencerDetalle', { dias: umbral, n: cantidad(kpis.uds_por_vencer) }) : undefined}
          onClick={() => l.setFiltro('estado', 'por_vencer')}
        />
        <StatCard
          etiqueta={t('kpis.vencidos')}
          cargando={!kpis}
          valor={kpis ? cantidad(kpis.vencidos) : '—'}
          tono={kpis && kpis.vencidos > 0 ? 'peligro' : 'neutro'}
          tendencia={kpis && kpis.vencidos > 0 ? 'baja' : undefined}
          detalle={kpis ? t('kpis.vencidosDetalle', { n: cantidad(kpis.uds_vencidas) }) : undefined}
          onClick={() => l.setFiltro('estado', 'vencido')}
        />
        <StatCard
          etiqueta={t('kpis.riesgo')}
          cargando={!kpis}
          valor={kpis ? (kpis.valor_riesgo === null ? '—' : moneda.formatear(kpis.valor_riesgo)) : '—'}
          tono={kpis && (kpis.valor_riesgo ?? 0) > 0 ? 'advertencia' : 'neutro'}
          detalle={kpis?.valor_riesgo === null ? t('kpis.sinPermisoCostos') : t('kpis.riesgoDetalle')}
        />
      </KpiStrip>

      {kpis && kpis.vencidos > 0 && !(estados.length === 1 && estados[0] === 'vencido') && (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4 sm:flex-row sm:items-center lg:max-w-3xl">
          <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-warning-text" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-warning-text">{t('avisoVencidos.titulo', { count: kpis.vencidos, n: cantidad(kpis.vencidos) })}</p>
            <p className="text-[13px] text-fg-secondary">
              {kpis.valor_vencido !== null
                ? t('avisoVencidos.descripcionValor', { n: cantidad(kpis.uds_vencidas), valor: moneda.formatear(kpis.valor_vencido) })
                : t('avisoVencidos.descripcion', { n: cantidad(kpis.uds_vencidas) })}
            </p>
          </div>
          <Button variant="outline" className="h-9 bg-surface" onClick={() => l.setFiltro('estado', 'vencido')}>
            {t('avisoVencidos.ver')}
          </Button>
        </div>
      )}

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} nota={t('filtros.nota')} textoVerResultados={t('filtros.verN', { count: total, n: cantidad(total) })}>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.estado')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {ESTADOS_LOTE.map((e) => (
                  <label key={e} className="flex items-center gap-2 text-sm text-fg">
                    <Checkbox
                      checked={estados.includes(e)}
                      onCheckedChange={(v) => l.setFiltro('estado', v === true ? [...estados, e] : estados.filter((x) => x !== e))}
                      className="size-[18px] rounded"
                    />
                    {tv(e)}
                  </label>
                ))}
              </div>
            </fieldset>
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
              <label htmlFor="lotes-existencias" className="text-sm text-fg">
                {t('filtros.conExistencias')}
              </label>
              <Switch id="lotes-existencias" checked={conExistencias} onCheckedChange={(v) => l.setFiltro('existencias', v ? '1' : null)} />
            </div>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={claveFila}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={cambiarSeleccion}
        onFilaClick={(f) => router.push(rutaKardexLote(f.product_id, f.lot_id))}
        etiquetaFila={(f) => t('etiquetaFila', { codigo: f.lot_code, producto: f.nombre })}
        acciones={accionesFila}
        tonoFila={(f) => (f.estado === 'vencido' && f.qty_on_hand > 0 ? 'peligro' : undefined)}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            titulo={f.lot_code}
            insignia={<BadgeVencimiento expiry={f.expiry_date} hoy={hoy || getToday()} umbralDias={umbral} />}
            subtitulo={f.nombre}
            meta={
              <span className="flex flex-col gap-0.5">
                <span className={cn('text-xs', claseVence(f))}>
                  {f.expiry_date ? t('movil.vence', { fecha: formatPlain(f.expiry_date), texto: venceTexto(f) }) : t('sinCaducidad')}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-fg">{udsLote(f)}</span>
                  <span className="text-xs text-fg-muted">{f.sucursal}</span>
                </span>
              </span>
            }
            acciones={accionesFila(f)}
            onClick={() => router.push(rutaKardexLote(f.product_id, f.lot_id))}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
            onMantenerPulsado={() => ctx.alternar(true)}
            className={f.estado === 'vencido' && f.qty_on_hand > 0 ? 'border-line-danger bg-danger-subtle' : undefined}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Layers,
          accion: puedeCrear ? { etiqueta: t('nuevo'), onClick: () => setDialogo({ tipo: 'nuevo' }), icono: Plus } : undefined,
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('errorCarga') }}
        sinPermiso={{ titulo: tp('sinPermisoTitulo'), descripcion: tp('sinPermisoDescripcion') }}
        onLimpiarFiltros={l.limpiarTodo}
        onReintentar={recargar}
        termino={l.busqueda}
        pie={<Pagination pagina={l.pagina} tamano={l.tamano} total={total} onPaginaChange={l.setPagina} onTamanoChange={l.setTamano} sustantivo={sustantivo} cargando={cargando} />}
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={total}
        sustantivo={sustantivo}
        acciones={[{ id: 'exportar', etiqueta: t('masivas.exportar'), icono: Download, onClick: () => void exportar(true), cargando: exportando }]}
        onLimpiar={() => cambiarSeleccion(new Set())}
      />

      <DialogoLote
        abierto={dialogo?.tipo === 'nuevo' || dialogo?.tipo === 'editar'}
        onAbiertoChange={(v) => !v && setDialogo(null)}
        organizacionId={organizacionId}
        lote={dialogo?.tipo === 'editar' ? dialogo.fila : null}
        verCostos={verCostos}
        puedeAjustar={permisos.ajustar}
        onGuardado={recargar}
      />
      <DialogoAjustarLote
        abierto={dialogo?.tipo === 'ajustar' || dialogo?.tipo === 'baja'}
        onAbiertoChange={(v) => !v && setDialogo(null)}
        organizacionId={organizacionId}
        lote={dialogo && dialogo.tipo !== 'nuevo' ? dialogo.fila : null}
        filasDelLote={filasDialogo}
        darDeBaja={dialogo?.tipo === 'baja'}
        onGuardado={recargar}
      />
      <DialogoEliminarLote
        abierto={dialogo?.tipo === 'eliminar'}
        onAbiertoChange={(v) => !v && setDialogo(null)}
        organizacionId={organizacionId}
        lote={dialogo?.tipo === 'eliminar' ? dialogo.fila : null}
        onEliminado={recargar}
      />
    </div>
  );
}

export default LotesPage;
