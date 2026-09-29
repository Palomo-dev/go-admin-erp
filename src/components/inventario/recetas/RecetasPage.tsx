'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowDown, Calculator, ChefHat, Download, Factory, Plus, RefreshCw } from 'lucide-react';
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
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId, getOrganizationName } from '@/lib/hooks/useOrganization';
import { aPermisosInventario, SIN_PERMISOS_INVENTARIO } from '@/lib/inventario/permisos';
import type { PermisosInventario } from '@/lib/inventario/nucleo/tipos';
import { filasACsv } from '@/lib/utils/csv';
import { recipeService, type FilaReceta, type FiltrosRecetas, type KpisRecetas } from '@/lib/services/recipeService';
import { useFormatoCantidad, useFormatoPorcentaje } from '../produccion/piezas';
import { BadgeEstadoReceta, BadgeModoReceta, rutaCostoRecetas, rutaEditarReceta, rutaNuevaReceta } from './piezas';
import { useAccionesReceta } from './useAccionesReceta';

const CAMPOS_ORDEN = ['producto', 'costo', 'margen', 'fecha'] as const;
const ESTADOS = ['activas', 'inactivas', 'todas'] as const;
const MODOS = ['al_producir', 'al_vender'] as const;

/**
 * Recetas (Figma «Recetas — listado, editor y diálogos» 598:142703): una fila
 * por producto con su versión activa (o la última), rinde, ingredientes, costo
 * por unidad en la sucursal del encabezado (`fn_receta_costo`, el mismo que
 * descuenta la venta), margen, cómo descuenta y estado. Editar abre el MISMO
 * `EditorReceta` del formulario de producto; desactivar pide confirmación.
 */
export function RecetasPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioRecetas.listado');
  const tc = useTranslations('inventarioRecetas');
  const entero = useFormatoEntero();
  const cantidad = useFormatoCantidad();
  const porcentaje = useFormatoPorcentaje();
  const { formatear: moneda } = useMonedaOrganizacion();
  const { getToday } = useFormatDate();
  const { branchFilter, branches, isLoading: cargandoSucursales } = useBranch();

  const l = useListadoServidor({
    filtros: ['estado', 'modo', 'costo', 'margen'],
    camposOrden: [...CAMPOS_ORDEN],
    ordenPorDefecto: { campo: 'producto', direccion: 'asc' },
    tamanoPorDefecto: 25,
  });

  const [filas, setFilas] = useState<FilaReceta[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<KpisRecetas | null>(null);
  const [permisos, setPermisos] = useState<PermisosInventario>(SIN_PERMISOS_INVENTARIO);
  const [cargando, setCargando] = useState(true);
  const [estadoError, setEstadoError] = useState<'error' | 'sinPermiso' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const acciones = useAccionesReceta({ permisos, onCambio: recargar });

  const estado = (ESTADOS as readonly string[]).includes(l.filtros.estado ?? '') ? (l.filtros.estado as FiltrosRecetas['estado']) : 'todas';
  const modo = (MODOS as readonly string[]).includes(l.filtros.modo ?? '') ? (l.filtros.modo as FiltrosRecetas['modo']) : undefined;
  const incompleto = l.filtros.costo === 'incompleto';
  const margenBajo = l.filtros.margen === 'bajo';
  const sucursal = branchFilter ?? branches[0]?.id ?? null;
  const sinSucursal = !cargandoSucursales && branches.length === 0;

  const filtrosServidor = useMemo<FiltrosRecetas>(
    () => ({
      sucursal,
      busqueda: l.busqueda || undefined,
      estado,
      modo,
      costo: incompleto ? 'incompleto' : undefined,
      margen_bajo: margenBajo || undefined,
      orden: (CAMPOS_ORDEN as readonly string[]).includes(l.orden?.campo ?? '') ? (l.orden!.campo as FiltrosRecetas['orden']) : 'producto',
      direccion: l.orden?.direccion ?? 'asc',
    }),
    [sucursal, l.busqueda, estado, modo, incompleto, margenBajo, l.orden],
  );
  const clave = JSON.stringify({ ...filtrosServidor, d: l.rango.desde, n: l.tamano });

  useEffect(() => {
    if (sinSucursal || cargandoSucursales) return;
    const control = new AbortController();
    setCargando(true);
    recipeService
      .listar(getOrganizationId(), { ...filtrosServidor, desde_fila: l.rango.desde, limite: l.tamano }, control.signal)
      .then((r) => {
        setFilas(r.filas);
        setTotal(r.total);
        setKpis(r.kpis);
        setPermisos(aPermisosInventario(r.permisos));
        setEstadoError(null);
      })
      .catch((e: { code?: string }) => {
        if (control.signal.aborted) return;
        if (e?.code === '42501') setEstadoError('sinPermiso');
        else {
          console.error('Error cargando recetas:', e);
          setEstadoError('error');
        }
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, recarga, sinSucursal, cargandoSucursales]);

  useEffect(() => setSeleccion(new Set()), [l.busqueda, l.filtros, branchFilter]);

  const exportar = (lista: readonly FilaReceta[]) => {
    if (lista.length === 0) {
      toast({ title: t('exportar.sinDatos') });
      return;
    }
    const csv = filasACsv(
      [t('csv.producto'), t('csv.sku'), t('csv.version'), t('csv.rinde'), t('csv.ingredientes'), t('csv.costoUnidad'), t('csv.precio'), t('csv.margen'), t('csv.modo'), t('csv.estado')],
      lista.map((f) => [f.producto.nombre, f.producto.sku, `v${f.version}`, `${f.rinde} ${f.unidad_rinde}`, f.ingredientes, f.costo_unidad, f.precio, f.margen, tc(`modo.${f.modo}`), f.activa ? tc('estados.activa') : tc('estados.inactiva')]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `recetas_${getToday()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: t('exportar.listo', { count: lista.length }) });
  };

  const detalleCosto = (f: FilaReceta) =>
    f.lineas_con_error > 0
      ? { texto: t('nSinConversion', { count: f.lineas_con_error }), clase: 'text-danger-text' }
      : f.lineas_sin_costo > 0
        ? { texto: t('nSinCosto', { count: f.lineas_sin_costo }), clase: 'text-warning-text' }
        : { texto: t('costoCompleto'), clase: 'text-fg-secondary' };

  const tonoMargen = (m: number | null) =>
    m === null ? 'bg-subtle text-fg-muted' : m < (kpis?.umbral_margen ?? 0.3) ? 'bg-warning-subtle text-warning-text' : 'bg-success-subtle text-success-text';

  const columnas: ColumnaTabla<FilaReceta>[] = [
    {
      id: 'producto',
      encabezado: t('columnas.producto'),
      ordenable: true,
      campoOrden: 'producto',
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{f.producto.nombre}</span>
          <span className="truncate text-xs text-fg-secondary">{t('recetaNombre', { nombre: f.nombre ?? f.producto.nombre, version: f.version })}</span>
        </div>
      ),
    },
    { id: 'rinde', encabezado: t('columnas.rinde'), ocultarDebajo: 'md', celda: (f) => cantidad(f.rinde, f.unidad_rinde) },
    { id: 'ingredientes', encabezado: t('columnas.ingredientes'), variante: 'importe', ocultarDebajo: 'lg', celda: (f) => entero(f.ingredientes) },
    {
      id: 'costo',
      encabezado: t('columnas.costo'),
      variante: 'importe',
      ordenable: true,
      campoOrden: 'costo',
      celda: (f) => {
        const d = detalleCosto(f);
        return (
          <div className="flex flex-col items-end">
            <span className="text-fg">{f.costo_unidad !== null ? moneda(f.costo_unidad) : '—'}</span>
            <span className={`text-xs ${d.clase}`}>{d.texto}</span>
          </div>
        );
      },
    },
    {
      id: 'margen',
      encabezado: t('columnas.margen'),
      ordenable: true,
      campoOrden: 'margen',
      alinear: 'centro',
      celda: (f) => <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${tonoMargen(f.margen)}`}>{porcentaje(f.margen)}</span>,
    },
    { id: 'modo', encabezado: t('columnas.descuenta'), ocultarDebajo: 'md', celda: (f) => <BadgeModoReceta modo={f.modo} /> },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (f) => <BadgeEstadoReceta activa={f.activa} /> },
  ];

  const estadoTabla: EstadoTabla = cargando ? 'cargando' : estadoError === 'sinPermiso' ? 'sinPermiso' : estadoError ? 'error' : filas.length === 0 && l.hayCriterios ? 'sinResultados' : 'listo';
  const sustantivo = { singular: tc('sustantivo.singular'), plural: tc('sustantivo.plural') };
  const subtitulo = kpis
    ? t('subtitulo', { organizacion: getOrganizationName() ?? '', count: kpis.activas + kpis.inactivas, n: entero(kpis.activas + kpis.inactivas), activas: entero(kpis.activas) })
    : getOrganizationName() ?? undefined;

  const chips: ChipFiltro[] = [
    ...(estado !== 'todas' ? [{ clave: 'estado', etiqueta: t('chips.estado', { estado: t(`filtros.estados.${estado}`) }) }] : []),
    ...(modo ? [{ clave: 'modo', etiqueta: tc(`modo.${modo}`) }] : []),
    ...(incompleto ? [{ clave: 'costo', etiqueta: t('chips.incompleto') }] : []),
    ...(margenBajo ? [{ clave: 'margen', etiqueta: t('chips.margenBajo') }] : []),
  ];

  const cabecera = (
    <PageHeader
      titulo={t('titulo')}
      subtitulo={subtitulo}
      icono={ChefHat}
      cargando={cargando && !sinSucursal}
      migas={[{ etiqueta: tc('inventario'), href: '/app/inventario' }, { etiqueta: t('titulo') }]}
      debajo={<BranchBadgeActiva />}
      acciones={
        sinSucursal ? undefined : (
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={recargar} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </Button>
            <Button variant="outline" className="h-10 gap-2" onClick={() => router.push(rutaCostoRecetas())}>
              <Calculator aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('costoRecetas')}
            </Button>
            <Button variant="outline" className="h-10 gap-2" onClick={() => router.push('/app/inventario/produccion')}>
              <Factory aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('produccion')}
            </Button>
            {acciones.puedeEditar && (
              <Button className="h-10 gap-2" onClick={() => router.push(rutaNuevaReceta())}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                {t('nueva')}
              </Button>
            )}
          </>
        )
      }
      movil={{
        titulo: t('titulo'),
        subtitulo: kpis ? t('subtituloMovil', { activas: entero(kpis.activas) }) : undefined,
        accion:
          sinSucursal || !acciones.puedeEditar ? undefined : (
            <Button variant="ghost" size="icon" className="size-10" onClick={() => router.push(rutaNuevaReceta())} aria-label={t('nueva')}>
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.75} />
            </Button>
          ),
      }}
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

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {cabecera}

      {estadoError !== 'sinPermiso' && (
        <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
          <StatCard
            etiqueta={t('kpis.activas')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.activas) : '—'}
            detalle={kpis ? t('kpis.inactivas', { count: kpis.inactivas, n: entero(kpis.inactivas) }) : undefined}
            onClick={() => l.setFiltro('estado', 'activas')}
          />
          <StatCard
            etiqueta={t('kpis.incompleto')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.costo_incompleto) : '—'}
            tono={kpis && kpis.costo_incompleto > 0 ? 'advertencia' : 'neutro'}
            iconoDetalle={kpis && kpis.costo_incompleto > 0 ? AlertTriangle : undefined}
            detalle={t('kpis.incompletoDetalle')}
            onClick={() => l.setFiltro('costo', 'incompleto')}
          />
          <StatCard
            etiqueta={t('kpis.margenBajo', { umbral: porcentaje(kpis?.umbral_margen ?? 0.3) })}
            cargando={!kpis}
            valor={kpis ? entero(kpis.margen_bajo) : '—'}
            tono={kpis && kpis.margen_bajo > 0 ? 'peligro' : 'neutro'}
            iconoDetalle={kpis && kpis.margen_bajo > 0 ? ArrowDown : undefined}
            detalle={t('kpis.margenDetalle')}
            onClick={() => l.setFiltro('margen', 'bajo')}
          />
          <StatCard
            etiqueta={t('kpis.ordenes')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.ordenes_mes) : '—'}
            detalle={t('kpis.verProduccion')}
            onClick={() => router.push('/app/inventario/produccion')}
          />
        </KpiStrip>
      )}

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} textoVerResultados={t('filtros.verN', { count: total, n: entero(total) })}>
            <FormField etiqueta={t('filtros.estado')}>
              {(c) => (
                <Select value={estado} onValueChange={(v) => l.setFiltro('estado', v === 'todas' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADOS.map((e) => (
                      <SelectItem key={e} value={e}>
                        {t(`filtros.estados.${e}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('filtros.modo')}>
              {(c) => (
                <Select value={modo ?? 'todos'} onValueChange={(v) => l.setFiltro('modo', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('filtros.todos')}</SelectItem>
                    {MODOS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {tc(`modo.${m}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={incompleto} onCheckedChange={(v) => l.setFiltro('costo', v === true ? 'incompleto' : null)} className="size-[18px] rounded" />
              {t('filtros.incompleto')}
            </label>
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={margenBajo} onCheckedChange={(v) => l.setFiltro('margen', v === true ? 'bajo' : null)} className="size-[18px] rounded" />
              {t('filtros.margenBajo')}
            </label>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => String(f.recipe_id)}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        onFilaClick={(f) => router.push(rutaEditarReceta(f.product_id))}
        etiquetaFila={(f) => t('etiquetaFila', { producto: f.producto.nombre, version: f.version })}
        acciones={acciones.accionesDe}
        accionesRapidas={(f) =>
          f.activa && acciones.puedeProducir && f.producto.track_stock ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={t('crearOrdenDe', { producto: f.producto.nombre })}
              title={t('crearOrden')}
              onClick={(e) => {
                e.stopPropagation();
                acciones.pedirProducir(f);
              }}
            >
              <Factory aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </Button>
          ) : null
        }
        tarjetaMovil={(f, ctx) => (
          <ListCard
            icono={ChefHat}
            titulo={f.producto.nombre}
            subtitulo={[t('recetaNombre', { nombre: f.nombre ?? f.producto.nombre, version: f.version }), cantidad(f.rinde, f.unidad_rinde)].join(' · ')}
            meta={[tc(`modo.${f.modo}`), detalleCosto(f).texto].join(' · ')}
            valor={
              <span className="flex flex-col items-end gap-0.5">
                <span className="text-sm font-medium text-fg">{f.costo_unidad !== null ? moneda(f.costo_unidad) : '—'}</span>
                <span className="text-xs text-fg-secondary">{porcentaje(f.margen)}</span>
              </span>
            }
            estado={<BadgeEstadoReceta activa={f.activa} />}
            acciones={acciones.accionesDe(f)}
            onClick={() => router.push(rutaEditarReceta(f.product_id))}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
            onMantenerPulsado={() => ctx.alternar(true)}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: ChefHat,
          accion: acciones.puedeEditar ? { etiqueta: t('nueva'), onClick: () => router.push(rutaNuevaReceta()) } : undefined,
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('errorCarga') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        onLimpiarFiltros={l.limpiarTodo}
        onReintentar={recargar}
        termino={l.busqueda}
        pie={<Pagination pagina={l.pagina} tamano={l.tamano} total={total} onPaginaChange={l.setPagina} onTamanoChange={l.setTamano} sustantivo={sustantivo} cargando={cargando} />}
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={total}
        sustantivo={sustantivo}
        acciones={[{ id: 'exportar', etiqueta: t('masivas.exportar'), icono: Download, onClick: () => exportar(filas.filter((f) => seleccion.has(String(f.recipe_id)))) }]}
        onLimpiar={() => setSeleccion(new Set())}
      />

      {acciones.dialogos}
    </div>
  );
}

export default RecetasPage;
