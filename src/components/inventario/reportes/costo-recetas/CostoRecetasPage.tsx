'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowDown, Calculator, ChefHat, ChevronDown, ChevronRight, Download, Package, RefreshCw, TrendingUp } from 'lucide-react';
import {
  BranchBadgeActiva,
  EmptyState,
  FilterChips,
  FilterPanel,
  FormField,
  KpiStrip,
  ListToolbar,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  StatCard,
  useListadoServidor,
  type ChipFiltro,
} from '@/components/kit';
import { DialogoConversion } from '@/components/kit/receta';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId, getOrganizationName } from '@/lib/hooks/useOrganization';
import { filasACsv } from '@/lib/utils/csv';
import { recipeService, type CostoReceta, type FilaReceta, type FiltrosRecetas, type KpisRecetas } from '@/lib/services/recipeService';
import { cn } from '@/utils/Utils';
import { useFormatoCantidad, useFormatoPorcentaje } from '../../produccion/piezas';
import { BadgeFuenteCosto, rutaEditarReceta } from '../../recetas/piezas';
import { cargarUnidades } from '../../recetas/datosEditor';
import type { UnidadReceta } from '@/components/kit/receta';

const ESTADOS = ['activas', 'inactivas', 'todas'] as const;

/**
 * Costo de recetas (Figma «Costo de recetas» 601:148806): una fila por receta
 * con costo de la tanda, costo por unidad, precio, margen y fuente del costo en
 * la sucursal del encabezado; al desplegarla, cada ingrediente con su cantidad
 * en la unidad de la receta y en la suya, costo unitario, subtotal y peso en el
 * costo. TODO sale del servidor (`fn_recetas_listado` → `fn_receta_costo`), el
 * mismo cálculo con que la venta descuenta: ya no hay un cálculo propio en
 * TypeScript (el anterior tomaba el promedio más alto entre sucursales y no
 * encontraba conversiones).
 */
export function CostoRecetasPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioRecetas.costo');
  const tc = useTranslations('inventarioRecetas');
  const entero = useFormatoEntero();
  const cantidad = useFormatoCantidad();
  const porcentaje = useFormatoPorcentaje();
  const { formatear: moneda } = useMonedaOrganizacion();
  const { getToday } = useFormatDate();
  const { branchFilter, branches, isLoading: cargandoSucursales } = useBranch();

  const l = useListadoServidor({
    filtros: ['estado', 'costo', 'margen'],
    camposOrden: ['producto', 'costo', 'margen'],
    ordenPorDefecto: { campo: 'producto', direccion: 'asc' },
    tamanoPorDefecto: 25,
  });

  const [filas, setFilas] = useState<FilaReceta[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<KpisRecetas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [estadoError, setEstadoError] = useState<'error' | 'sinPermiso' | null>(null);
  const [permitido, setPermitido] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  const [lineas, setLineas] = useState<Record<number, CostoReceta | 'cargando' | 'error'>>({});
  const [unidades, setUnidades] = useState<UnidadReceta[]>([]);
  const [conversion, setConversion] = useState<{ de: string; a: string; ingrediente: string } | null>(null);

  const estado = (ESTADOS as readonly string[]).includes(l.filtros.estado ?? '') ? (l.filtros.estado as FiltrosRecetas['estado']) : 'activas';
  const incompleto = l.filtros.costo === 'incompleto';
  const margenBajo = l.filtros.margen === 'bajo';
  const sucursal = branchFilter ?? branches[0]?.id ?? null;
  const sucursalNombre = branches.find((b) => b.id === sucursal)?.name ?? '';
  const sinSucursal = !cargandoSucursales && branches.length === 0;
  const recargar = useCallback(() => {
    setLineas({});
    setRecarga((n) => n + 1);
  }, []);

  const filtros = useMemo<FiltrosRecetas>(
    () => ({
      sucursal,
      busqueda: l.busqueda || undefined,
      estado,
      costo: incompleto ? 'incompleto' : undefined,
      margen_bajo: margenBajo || undefined,
      orden: (['producto', 'costo', 'margen'] as const).includes(l.orden?.campo as 'producto') ? (l.orden!.campo as FiltrosRecetas['orden']) : 'producto',
      direccion: l.orden?.direccion ?? 'asc',
    }),
    [sucursal, l.busqueda, estado, incompleto, margenBajo, l.orden],
  );
  const clave = JSON.stringify({ ...filtros, d: l.rango.desde, n: l.tamano });

  useEffect(() => {
    if (sinSucursal || cargandoSucursales) return;
    const control = new AbortController();
    setCargando(true);
    recipeService
      .listar(getOrganizationId(), { ...filtros, desde_fila: l.rango.desde, limite: l.tamano }, control.signal)
      .then((r) => {
        setFilas(r.filas);
        setTotal(r.total);
        setKpis(r.kpis);
        setPermitido(r.permisos.costos !== false);
        setEstadoError(null);
        setLineas({});
      })
      .catch((e: { code?: string }) => {
        if (control.signal.aborted) return;
        setEstadoError(e?.code === '42501' ? 'sinPermiso' : 'error');
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, recarga, sinSucursal, cargandoSucursales]);

  useEffect(() => {
    cargarUnidades().then(setUnidades).catch(() => setUnidades([]));
  }, []);

  const pedirLineas = useCallback(
    (id: number) => {
      setLineas((prev) => {
        if (prev[id] && prev[id] !== 'error') return prev;
        recipeService
          .costo(getOrganizationId(), sucursal, { recipe_id: id })
          .then((c) => setLineas((p) => ({ ...p, [id]: c })))
          .catch(() => setLineas((p) => ({ ...p, [id]: 'error' })));
        return { ...prev, [id]: 'cargando' };
      });
    },
    [sucursal],
  );

  const alternar = (id: number) => {
    setAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else {
        s.add(id);
        pedirLineas(id);
      }
      return s;
    });
  };

  const exportar = async () => {
    try {
      const r = await recipeService.listar(getOrganizationId(), { ...filtros, desde_fila: 0, limite: 500 });
      if (r.filas.length === 0) {
        toast({ title: t('exportar.sinDatos') });
        return;
      }
      const csv = filasACsv(
        [t('csv.producto'), t('csv.sku'), t('csv.version'), t('csv.rinde'), t('csv.tanda'), t('csv.unidad'), t('csv.precio'), t('csv.margen'), t('csv.fuente'), t('csv.sucursal')],
        r.filas.map((f) => [f.producto.nombre, f.producto.sku, `v${f.version}`, `${f.rinde} ${f.unidad_rinde}`, f.costo_tanda, f.costo_unidad, f.precio, f.margen, tc(`fuentes.${f.fuente}`), sucursalNombre]),
      );
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `costo_recetas_${getToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: t('exportar.listo', { count: r.filas.length }) });
    } catch {
      toast({ variant: 'destructive', title: t('exportar.error') });
    }
  };

  const chips: ChipFiltro[] = [
    ...(estado !== 'activas' ? [{ clave: 'estado', etiqueta: t('chips.estado', { estado: tc(`listado.filtros.estados.${estado}`) }) }] : []),
    ...(incompleto ? [{ clave: 'costo', etiqueta: tc('listado.chips.incompleto') }] : []),
    ...(margenBajo ? [{ clave: 'margen', etiqueta: tc('listado.chips.margenBajo') }] : []),
  ];

  const tonoMargen = (m: number | null) =>
    m === null ? 'bg-subtle text-fg-muted' : m < (kpis?.umbral_margen ?? 0.3) ? 'bg-warning-subtle text-warning-text' : 'bg-success-subtle text-success-text';

  const cabecera = (
    <PageHeader
      titulo={t('titulo')}
      subtitulo={kpis ? t('subtitulo', { organizacion: getOrganizationName() ?? '', count: kpis.activas, n: entero(kpis.activas), sucursal: sucursalNombre }) : sucursalNombre}
      icono={Calculator}
      cargando={cargando && !sinSucursal}
      migas={[{ etiqueta: tc('inventario'), href: '/app/inventario' }, { etiqueta: t('reportes'), href: '/app/inventario/reportes' }, { etiqueta: t('titulo') }]}
      debajo={
        <div className="flex flex-wrap items-center gap-2">
          <BranchBadgeActiva />
          <span className="text-xs text-fg-secondary">{t('lemaFuente')}</span>
        </div>
      }
      acciones={
        sinSucursal ? undefined : (
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={recargar} aria-label={t('recalcular')} title={t('recalcular')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </Button>
            <Button variant="outline" className="h-10 gap-2" onClick={() => router.push('/app/inventario/recetas')}>
              <ChefHat aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('irRecetas')}
            </Button>
            <Button className="h-10 gap-2" onClick={exportar} disabled={estadoError !== null}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('exportar.boton')}
            </Button>
          </>
        )
      }
    />
  );

  if (sinSucursal) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        {cabecera}
        <EmptyState variante="sinSucursal" />
      </div>
    );
  }

  const detalle = (f: FilaReceta) => {
    const c = lineas[f.recipe_id];
    if (c === 'cargando' || c === undefined) return <p className="px-4 py-3 text-sm text-fg-secondary">{t('cargandoLineas')}</p>;
    if (c === 'error') return <p className="px-4 py-3 text-sm text-danger-text">{t('errorLineas')}</p>;
    const tanda = c.costo_tanda ?? 0;
    const faltan = c.lineas.filter((x) => !x.opcional && (x.error || x.costo_unitario === null)).map((x) => x.nombre ?? `#${x.ingredient_product_id}`);
    return (
      <div className="flex flex-col gap-2 p-3">
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">{t('ingredientesDe', { producto: f.producto.nombre })}</caption>
            <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
              <tr>
                <th scope="col" className="px-4 py-2">{t('col.ingrediente')}</th>
                <th scope="col" className="px-3 py-2 text-right">{t('col.cantidad')}</th>
                <th scope="col" className="px-3 py-2 text-right">{t('col.enSuUnidad')}</th>
                <th scope="col" className="px-3 py-2">{t('col.costoUnitario')}</th>
                <th scope="col" className="px-3 py-2 text-right">{t('col.subtotal')}</th>
                <th scope="col" className="px-4 py-2 text-right">{t('col.peso')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {c.lineas.map((x) => (
                <tr key={x.orden}>
                  <td className="px-4 py-2 text-fg">
                    {x.nombre ?? `#${x.ingredient_product_id}`}
                    {x.merma_pct > 0 && <span className="text-xs text-fg-secondary"> · {t('merma', { pct: x.merma_pct })}</span>}
                    {x.opcional && <span className="text-xs text-fg-secondary"> · {t('opcional')}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg">{cantidad(x.cantidad_bruta, x.unidad_receta)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {x.error === 'conversion_faltante' ? (
                      <span className="rounded-full border border-line-danger bg-danger-subtle px-2 py-0.5 text-xs text-danger-text">{t('sinConversion')}</span>
                    ) : (
                      <span className="text-fg">{cantidad(x.cantidad, x.unidad_ingrediente)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {x.error === 'conversion_faltante' ? (
                      <button type="button" className="text-sm text-brand hover:underline" onClick={() => setConversion({ de: x.unidad_receta, a: x.unidad_ingrediente, ingrediente: x.nombre ?? '' })}>
                        {t('crearConversion')}
                      </button>
                    ) : x.costo_unitario !== null ? (
                      <span className="tabular-nums text-fg">
                        {moneda(x.costo_unitario)} / {x.unidad_ingrediente}
                        <span className="block text-xs text-fg-secondary">{tc(`fuentes.${x.fuente}`)}</span>
                      </span>
                    ) : permitido ? (
                      <Link href={`/app/inventario/productos/${x.ingredient_product_id}?tab=precios`} className="text-sm text-brand hover:underline">
                        {t('registrarCosto')}
                      </Link>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg">{x.costo_linea !== null ? moneda(x.costo_linea) : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-fg-secondary">
                    {x.costo_linea !== null && tanda > 0 && !x.opcional ? porcentaje(x.costo_linea / tanda) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {permitido && (
          <p className={cn('text-[13px]', faltan.length > 0 ? 'text-warning-text' : 'text-fg-secondary')}>
            {faltan.length > 0
              ? t('totalIncompleto', { total: moneda(tanda), faltan: faltan.join(', ') })
              : t('totalCompleto', { total: moneda(tanda) })}
          </p>
        )}
      </div>
    );
  };

  const ordenar = (campo: 'producto' | 'costo' | 'margen') => l.ordenarPor(campo);
  const encabezadoOrdenable = (campo: 'producto' | 'costo' | 'margen', texto: string, clase = '') => (
    <th scope="col" className={cn('px-3 py-3', clase)} aria-sort={l.orden?.campo === campo ? (l.orden.direccion === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" onClick={() => ordenar(campo)}>
        {texto}
      </button>
    </th>
  );

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {cabecera}

      {estadoError !== 'sinPermiso' && (
        <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
          <StatCard
            etiqueta={t('kpis.completas')}
            cargando={!kpis}
            valor={kpis ? t('kpis.deN', { completas: entero(kpis.completas), total: entero(kpis.activas) }) : '—'}
            tono={kpis && kpis.costo_incompleto > 0 ? 'advertencia' : 'exito'}
            iconoDetalle={kpis && kpis.costo_incompleto > 0 ? AlertTriangle : undefined}
            detalle={kpis ? t('kpis.incompletas', { count: kpis.costo_incompleto }) : undefined}
            onClick={() => l.setFiltro('costo', 'incompleto')}
          />
          <StatCard
            etiqueta={t('kpis.margenPonderado')}
            cargando={!kpis}
            valor={kpis ? porcentaje(kpis.margen_ponderado) : '—'}
            iconoDetalle={TrendingUp}
            detalle={t('kpis.porVentas')}
          />
          <StatCard
            etiqueta={t('kpis.margenBajo', { umbral: porcentaje(kpis?.umbral_margen ?? 0.3) })}
            cargando={!kpis}
            valor={kpis ? t('kpis.nRecetas', { count: kpis.margen_bajo, n: entero(kpis.margen_bajo) }) : '—'}
            tono={kpis && kpis.margen_bajo > 0 ? 'peligro' : 'neutro'}
            iconoDetalle={kpis && kpis.margen_bajo > 0 ? ArrowDown : undefined}
            detalle={t('kpis.revisar')}
            onClick={() => l.setFiltro('margen', 'bajo')}
          />
          <StatCard
            etiqueta={t('kpis.sinCosto')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.ingredientes_sin_costo) : '—'}
            tono={kpis && kpis.ingredientes_sin_costo > 0 ? 'advertencia' : 'neutro'}
            iconoDetalle={kpis && kpis.ingredientes_sin_costo > 0 ? Package : undefined}
            detalle={t('kpis.registrar')}
          />
        </KpiStrip>
      )}

      {!permitido && (
        <p role="status" className="rounded-xl border border-line bg-subtle px-4 py-3 text-sm text-fg-secondary">
          {t('sinPermisoCostos')}
        </p>
      )}

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} textoVerResultados={tc('listado.filtros.verN', { count: total, n: entero(total) })}>
            <FormField etiqueta={tc('listado.filtros.estado')}>
              {(c) => (
                <Select value={estado} onValueChange={(v) => l.setFiltro('estado', v === 'activas' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADOS.map((e) => (
                      <SelectItem key={e} value={e}>
                        {tc(`listado.filtros.estados.${e}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={incompleto} onCheckedChange={(v) => l.setFiltro('costo', v === true ? 'incompleto' : null)} className="size-[18px] rounded" />
              {tc('listado.filtros.incompleto')}
            </label>
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={margenBajo} onCheckedChange={(v) => l.setFiltro('margen', v === true ? 'bajo' : null)} className="size-[18px] rounded" />
              {tc('listado.filtros.margenBajo')}
            </label>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
      />

      {estadoError || (!cargando && filas.length === 0) ? (
        <EmptyState
          variante={estadoError === 'sinPermiso' ? 'forbidden' : estadoError === 'error' ? 'error' : l.hayCriterios ? 'search' : 'empty'}
          icono={Calculator}
          termino={l.busqueda}
          titulo={estadoError ? undefined : l.hayCriterios ? undefined : t('vacio.titulo')}
          descripcion={estadoError ? undefined : l.hayCriterios ? t('sinResultados') : t('vacio.descripcion')}
          accion={estadoError === 'error' ? { etiqueta: t('reintentar'), onClick: recargar } : l.hayCriterios ? { etiqueta: t('limpiar'), onClick: l.limpiarTodo } : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <caption className="sr-only">{t('titulo')}</caption>
              <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
                <tr>
                  <th scope="col" className="w-12 px-3 py-3">
                    <span className="sr-only">{t('col.expandir')}</span>
                  </th>
                  {encabezadoOrdenable('producto', t('col.receta'))}
                  <th scope="col" className="px-3 py-3">{t('col.rinde')}</th>
                  <th scope="col" className="px-3 py-3 text-right">{t('col.tanda')}</th>
                  {encabezadoOrdenable('costo', t('col.unidad'), 'text-right')}
                  <th scope="col" className="px-3 py-3 text-right">{t('col.precio')}</th>
                  {encabezadoOrdenable('margen', t('col.margen'), 'text-center')}
                  <th scope="col" className="px-3 py-3">{t('col.fuente')}</th>
                  <th scope="col" className="w-12 px-3 py-3">
                    <span className="sr-only">{t('col.acciones')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cargando && filas.length === 0
                  ? Array.from({ length: 5 }, (_, i) => (
                      <tr key={i}>
                        <td colSpan={9} className="px-4 py-4">
                          <div className="h-4 w-2/3 animate-pulse rounded bg-subtle" />
                        </td>
                      </tr>
                    ))
                  : filas.map((f) => {
                      const abierta = abiertas.has(f.recipe_id);
                      const idDetalle = `costo-detalle-${f.recipe_id}`;
                      return (
                        <Fragment key={f.recipe_id}>
                          <tr className={cn(abierta && 'bg-brand-tint/40')}>
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                aria-expanded={abierta}
                                aria-controls={idDetalle}
                                aria-label={t(abierta ? 'contraer' : 'expandir', { producto: f.producto.nombre })}
                                onClick={() => alternar(f.recipe_id)}
                                className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                              >
                                {abierta ? <ChevronDown aria-hidden="true" className="size-4" /> : <ChevronRight aria-hidden="true" className="size-4" />}
                              </button>
                            </td>
                            <td className="px-3 py-3">
                              <Link href={rutaEditarReceta(f.product_id)} className="font-medium text-brand hover:underline">
                                {f.producto.nombre}
                              </Link>
                              <span className="block text-xs text-fg-secondary">{[f.producto.sku, `v${f.version}`].filter(Boolean).join(' · ')}</span>
                            </td>
                            <td className="px-3 py-3 text-fg">{cantidad(f.rinde, f.unidad_rinde)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-fg">{f.costo_tanda !== null ? moneda(f.costo_tanda) : '—'}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-fg">{f.costo_unidad !== null ? moneda(f.costo_unidad) : '—'}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-fg">{f.precio !== null ? moneda(f.precio) : '—'}</td>
                            <td className="px-3 py-3 text-center">
                              <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${tonoMargen(f.margen)}`}>{porcentaje(f.margen)}</span>
                            </td>
                            <td className="px-3 py-3">
                              <BadgeFuenteCosto fuente={f.fuente} sinCosto={f.lineas_sin_costo} />
                            </td>
                            <td className="px-3 py-3">
                              <RowActionsMenu
                                titulo={f.producto.nombre}
                                acciones={[
                                  { id: 'editar', etiqueta: t('editarReceta'), icono: ChefHat, onSelect: () => router.push(rutaEditarReceta(f.product_id)) },
                                  { id: 'producto', etiqueta: t('verProducto'), icono: Package, onSelect: () => router.push(`/app/inventario/productos/${f.product_id}`) },
                                ]}
                              />
                            </td>
                          </tr>
                          {abierta && (
                            <tr id={idDetalle} className="bg-subtle/60">
                              <td colSpan={9}>{detalle(f)}</td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-3 py-2">
            <Pagination
              pagina={l.pagina}
              tamano={l.tamano}
              total={total}
              onPaginaChange={l.setPagina}
              onTamanoChange={l.setTamano}
              sustantivo={{ singular: tc('sustantivo.singular'), plural: tc('sustantivo.plural') }}
              cargando={cargando}
            />
          </div>
        </div>
      )}

      {conversion && (
        <DialogoConversion
          abierto
          onAbiertoChange={(a) => !a && setConversion(null)}
          organizacionId={getOrganizationId()}
          de={conversion.de}
          a={conversion.a}
          ingrediente={conversion.ingrediente}
          unidades={unidades}
          onCreada={recargar}
        />
      )}
    </div>
  );
}

export default CostoRecetasPage;
