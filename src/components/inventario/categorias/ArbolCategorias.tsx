'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ChefHat,
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  FileSpreadsheet,
  FileText,
  FolderInput,
  Package,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Tags,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import {
  BulkActionBar,
  DataTable,
  FilterChips,
  FilterPanel,
  FormField,
  KpiStrip,
  ListToolbar,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  SegmentedControl,
  StatCard,
  StatusBadge,
  useEsEscritorio,
  type AccionFila,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { TreeCell } from '@/components/kit/TreeCell';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { TreeCard } from '@/components/kit/TreeCard';
import { useArrastreArbol, ZonaSoltarRaiz } from '@/components/kit/arrastreArbol';
import type { FilaArbol } from '@/components/kit/arbol';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { todayInTz } from '@/lib/utils/dateDisplay';
import categoryService, { ErrorCategoria } from '@/lib/services/categoryService';
import { useArbolCategorias, type NodoCategoria } from './useArbolCategorias';
import { accionesDeCategoria, mensajeErrorCategoria, segunPermisos } from './accionesCategoria';
import { usePermisosCatalogo } from './usePermisosCatalogo';
import { MoverCategoriaDialog } from './MoverCategoriaDialog';
import { EliminarCategoriaDialog } from './EliminarCategoriaDialog';
import { ImportCategoriesDialog } from './ImportCategoriesDialog';
import { etiquetaEstacion, iconoCategoria, OPCIONES_ESTACION, RUTAS_CATEGORIAS } from './iconoCategoria';

/**
 * Árbol de categorías (Figma `586:290667`): seis estados, menús «⋯» de fila y
 * de cabecera, FilterPanel, selección múltiple con BulkActionBar, «Mover a…»,
 * eliminar con destino de productos y la versión móvil con tarjetas por nivel.
 */

function descargarArchivo(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}


export function ArbolCategorias() {
  const t = useTranslations('categorias');
  const n = useFormatoEntero();
  const router = useRouter();
  const { toast } = useToast();
  const { timezone } = useOrgTimezone();
  const escritorio = useEsEscritorio();
  const a = useArbolCategorias();
  const permisos = usePermisosCatalogo();
  const { listado: l, organizationId, porId, nodos } = a;

  const [importarAbierto, setImportarAbierto] = useState(false);
  const [moverIds, setMoverIds] = useState<number[] | null>(null);
  const [aEliminar, setAEliminar] = useState<NodoCategoria | null>(null);
  const [confirmarDesactivar, setConfirmarDesactivar] = useState(false);
  const [trabajandoMasivo, setTrabajandoMasivo] = useState<string | null>(null);

  const recargar = useCallback(() => a.cargar(true), [a]);
  const mensajeError = useCallback(
    (e: unknown) => mensajeErrorCategoria(e, t, t('comun.intentaDeNuevo')),
    [t],
  );

  // ── Acciones ─────────────────────────────────────────────────────────────
  const mover = useCallback(
    async (ids: number[], padre: number | null) => {
      if (!organizationId) return;
      try {
        await categoryService.moverCategorias(organizationId, ids, padre);
        const destino = padre !== null ? porId.get(padre)?.name : null;
        const una = ids.length === 1;
        const nombre = porId.get(ids[0])?.name ?? t('comun.laCategoria');
        toast({
          title: t('toasts.movidas', { count: ids.length }),
          description: una
            ? destino
              ? t('toasts.movidaDentro', { nombre, destino })
              : t('toasts.movidaRaiz', { nombre })
            : destino
              ? t('toasts.movidasDentro', { n: n(ids.length), destino })
              : t('toasts.movidasRaiz', { n: n(ids.length) }),
        });
        a.setSeleccion(new Set());
        await recargar();
      } catch (e) {
        toast({ title: t('toasts.noMover'), description: mensajeError(e), variant: 'destructive' });
        throw e;
      }
    },
    [organizationId, porId, toast, a, recargar, t, n, mensajeError],
  );

  const alternarActiva = useCallback(
    async (cat: NodoCategoria) => {
      if (!organizationId) return;
      try {
        await categoryService.setActivas(organizationId, [cat.id], !cat.is_active);
        toast({
          title: cat.is_active ? t('toasts.desactivada') : t('toasts.activada'),
          description: t('comun.entreComillas', { nombre: cat.name }),
        });
        await recargar();
      } catch (e) {
        toast({ title: t('toasts.noCambioEstado'), description: mensajeError(e), variant: 'destructive' });
      }
    },
    [organizationId, toast, recargar, t, mensajeError],
  );

  const duplicar = useCallback(
    async (cat: NodoCategoria) => {
      if (!organizationId) return;
      try {
        const copia = await categoryService.duplicate(cat.id, organizationId);
        toast({ title: t('toasts.duplicada'), description: t('toasts.seCreo', { nombre: copia.name }) });
        await recargar();
      } catch (e) {
        toast({ title: t('toasts.noDuplicar'), description: mensajeError(e), variant: 'destructive' });
      }
    },
    [organizationId, toast, recargar, t, mensajeError],
  );

  const eliminar = useCallback(
    async (destino: number | null) => {
      if (!organizationId || !aEliminar) return;
      try {
        const r = await categoryService.eliminarCategoria(organizationId, aEliminar.id, destino);
        const partes = [
          r.productos_movidos
            ? t('toasts.productosPasaron', {
                count: r.productos_movidos,
                n: n(r.productos_movidos),
                destino: porId.get(destino ?? -1)?.name ?? t('toasts.otraCategoria'),
              })
            : null,
          r.subcategorias_movidas
            ? t('toasts.subcategoriasSubieron', { count: r.subcategorias_movidas, n: n(r.subcategorias_movidas) })
            : null,
        ].filter(Boolean);
        toast({
          title: t('toasts.eliminada'),
          description: partes.length ? `${partes.join(' · ')}.` : t('comun.entreComillas', { nombre: aEliminar.name }),
        });
        await recargar();
      } catch (e) {
        const conProductos = e instanceof ErrorCategoria && e.codigo === 'CATEGORIA_CON_PRODUCTOS';
        toast({
          title: conProductos ? t('toasts.tieneProductos') : t('toasts.noEliminar'),
          description: mensajeError(e),
          variant: 'destructive',
        });
        throw e;
      }
    },
    [organizationId, aEliminar, porId, toast, recargar, t, n, mensajeError],
  );

  const cambiarSeleccion = useCallback(
    async (activa: boolean) => {
      if (!organizationId) return;
      const ids = a.seleccionadas.map((c) => c.id);
      setTrabajandoMasivo(activa ? 'activar' : 'desactivar');
      try {
        await categoryService.setActivas(organizationId, ids, activa);
        toast({
          title: activa ? t('toasts.activadas') : t('toasts.desactivadas'),
          description: t('comun.nCategorias', { count: ids.length, n: n(ids.length) }),
        });
        a.setSeleccion(new Set());
        await recargar();
      } catch (e) {
        toast({ title: t('toasts.noCambioEstado'), description: mensajeError(e), variant: 'destructive' });
      } finally {
        setTrabajandoMasivo(null);
      }
    },
    [organizationId, a, toast, recargar, t, n, mensajeError],
  );

  // ── Exportar (mismo contenido que antes: CSV, Excel y PDF) ───────────────
  const exportar = useCallback(
    async (formato: 'csv' | 'xlsx' | 'pdf') => {
      if (!organizationId) return;
      const descargar = (blob: Blob, extension: string) =>
        descargarArchivo(blob, `categorias_${todayInTz(timezone)}.${extension}`);
      try {
        if (formato === 'csv') {
          const csv = await categoryService.exportCategoriesToCSV(organizationId);
          descargar(new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8;' }), 'csv');
        } else if (formato === 'xlsx') {
          descargar(await categoryService.exportCategoriesToXLSX(organizationId), 'xlsx');
        } else {
          descargar(await categoryService.exportCategoriesToPDF(organizationId), 'pdf');
        }
        toast({ title: t('toasts.exportacionLista'), description: t('toasts.seDescargo', { formato: formato.toUpperCase() }) });
      } catch (e) {
        toast({ title: t('toasts.noExportar'), description: mensajeError(e), variant: 'destructive' });
      }
    },
    [organizationId, toast, timezone, t, mensajeError],
  );

  const accionesCabecera: AccionFila[] = [
    { id: 'csv', etiqueta: t('listado.cabecera.exportarCsv'), icono: FileText, onSelect: () => void exportar('csv') },
    { id: 'xlsx', etiqueta: t('listado.cabecera.exportarExcel'), icono: FileSpreadsheet, onSelect: () => void exportar('xlsx') },
    { id: 'pdf', etiqueta: t('listado.cabecera.exportarPdf'), icono: Download, onSelect: () => void exportar('pdf') },
    { id: 'expandir', etiqueta: t('listado.cabecera.expandirTodo'), icono: ChevronsUpDown, onSelect: a.expandirTodo, separadorAntes: true },
    { id: 'contraer', etiqueta: t('listado.cabecera.contraerTodo'), icono: ChevronsDownUp, onSelect: a.contraerTodo },
    {
      id: 'actualizar',
      etiqueta: a.refrescando ? t('listado.cabecera.actualizando') : t('listado.cabecera.actualizar'),
      icono: RefreshCw,
      onSelect: () => void recargar(),
      deshabilitada: a.refrescando,
      motivo: t('listado.cabecera.yaActualizando'),
    },
  ];

  const accionesFila = (cat: NodoCategoria): AccionFila[] =>
    segunPermisos(accionesDeCategoria(cat, {
      editar: () => router.push(RUTAS_CATEGORIAS.editar(cat.uuid)),
      agregarSubcategoria: () => router.push(RUTAS_CATEGORIAS.nueva(cat.id)),
      mover: () => setMoverIds([cat.id]),
      moverARaiz: () => void mover([cat.id], null).catch(() => undefined),
      duplicar: () => void duplicar(cat),
      verProductos: () => router.push(RUTAS_CATEGORIAS.productos(cat.id)),
      alternarActiva: () => void alternarActiva(cat),
      eliminar: () => setAEliminar(cat),
    }, t), permisos);

  // ── Arrastrar para cambiar de padre (atajo de escritorio de «Mover a…») ──
  const puedeSoltar = useCallback(
    (origen: number, destino: number | null): true | string => {
      const o = porId.get(origen);
      if (!o) return t('listado.arrastre.noExiste');
      if (destino === null) return o.parent_id === null ? t('listado.arrastre.yaEsPrincipal') : true;
      if (destino === origen) return t('listado.arrastre.mismaCategoria');
      if (o.parent_id === destino) return t('listado.arrastre.yaEstaDentro');
      if (a.descendientes([origen]).has(destino)) return t('listado.arrastre.ciclo');
      return true;
    },
    [porId, a, t],
  );
  const arrastre = useArrastreArbol({
    puedeSoltar,
    onSoltar: (origen, destino) => void mover([origen], destino).catch(() => undefined),
    deshabilitado: !escritorio || a.estado !== 'listo' || !permisos.editar,
  });

  // ── Tabla ────────────────────────────────────────────────────────────────
  const columnas: ColumnaTabla<FilaArbol<NodoCategoria>>[] = useMemo(
    () => [
      {
        id: 'nombre',
        encabezado: t('listado.columnas.nombre'),
        ordenable: true,
        celda: (f) => (
          <TreeCell
            titulo={f.dato.name}
            subtitulo={`/${f.dato.slug}`}
            nivel={f.nivel}
            tieneHijos={f.tieneHijos}
            abierto={f.abierto}
            onAlternar={() => a.alternar(f.dato.id, f.abierto)}
            icono={iconoCategoria(f.dato.icon)}
            color={f.dato.color}
            miniatura={f.dato.image_url}
            contexto={f.contexto}
            arrastre={arrastre.nodo(f.dato.id)}
          />
        ),
      },
      {
        id: 'productos',
        encabezado: t('listado.columnas.productos'),
        ordenable: true,
        ancho: 130,
        celda: (f) => (
          <span className="flex flex-col">
            <Link
              href={RUTAS_CATEGORIAS.productos(f.dato.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={t('listado.verProductosDe', { count: f.dato.productos, n: n(f.dato.productos), nombre: f.dato.name })}
              className={f.dato.productos > 0 ? 'font-medium text-link tabular-nums hover:underline' : 'tabular-nums text-fg-muted hover:underline'}
            >
              {n(f.dato.productos)}
            </Link>
            {f.dato.productos_regla > 0 && (
              <span className="text-xs text-fg-muted">{t('listado.porRegla', { n: n(f.dato.productos_regla) })}</span>
            )}
          </span>
        ),
      },
      {
        id: 'subcategorias',
        encabezado: t('listado.columnas.subcategorias'),
        alinear: 'derecha',
        ancho: 130,
        celda: (f) => <span className="tabular-nums">{f.dato.hijas > 0 ? n(f.dato.hijas) : '—'}</span>,
      },
      {
        id: 'estacion',
        encabezado: t('listado.columnas.estacion'),
        ancho: 190,
        celda: (f) => (
          <span className="flex flex-col">
            <span className={f.dato.station ? 'text-fg' : 'text-fg-secondary'}>{etiquetaEstacion(f.dato.station, t)}</span>
            {f.dato.requires_preparation && (
              <span className="flex items-center gap-1 text-xs text-fg-muted">
                <ChefHat aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                {t('comun.generaComanda')}
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'estado',
        encabezado: t('listado.columnas.estado'),
        ancho: 110,
        celda: (f) => <StatusBadge estado={f.dato.is_active ? 'activa' : 'inactiva'} />,
      },
    ],
    [a, arrastre, t, n],
  );

  const estadoTabla: EstadoTabla =
    a.estado === 'cargando'
      ? 'cargando'
      : a.estado === 'error'
        ? 'error'
        : a.estado === 'sinPermiso'
          ? 'sinPermiso'
          : a.filas.length === 0 && a.hayCriterios
            ? 'sinResultados'
            : 'listo';

  const r = a.resumen;
  const cargandoKpi = a.estado === 'cargando';
  const subtitulo =
    a.estado === 'listo'
      ? t('listado.subtitulo', { total: r.total, nTotal: n(r.total), niveles: r.niveles, nNiveles: n(r.niveles) })
      : undefined;

  const nuevaCategoria = (
    <Link
      href={RUTAS_CATEGORIAS.nueva()}
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('comun.nuevaCategoria')}
    </Link>
  );

  const soloLectura = a.estado === 'sinPermiso';
  const puedeCrear = !soloLectura && permisos.crear;
  const puedeSeleccionar = !soloLectura && permisos.editar;
  const activasSeleccionadas = a.seleccionadas.filter((c) => c.is_active).length;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo={t('comun.categorias')}
        subtitulo={subtitulo}
        icono={Tags}
        cargando={a.estado === 'cargando' || a.refrescando}
        migas={[{ etiqueta: t('comun.inventario'), href: '/app/inventario' }, { etiqueta: t('comun.categorias') }]}
        acciones={
          soloLectura ? undefined : (
            <>
              {puedeCrear && (
                <button
                  type="button"
                  onClick={() => setImportarAbierto(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('listado.importar')}
                </button>
              )}
              {puedeCrear && nuevaCategoria}
              <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('comun.categorias')} acciones={accionesCabecera} />
            </>
          )
        }
        movil={{
          subtitulo,
          accion: soloLectura ? undefined : (
            <div className="flex items-center">
              <RowActionsMenu
                orientacion="horizontal"
                titulo={t('comun.categorias')}
                acciones={[
                  {
                    id: 'importar',
                    etiqueta: t('listado.importarCategorias'),
                    icono: Upload,
                    onSelect: () => setImportarAbierto(true),
                    oculta: !puedeCrear,
                  },
                  ...accionesCabecera,
                ]}
              />
              {puedeCrear && (
                <Link
                  href={RUTAS_CATEGORIAS.nueva()}
                  aria-label={t('comun.nuevaCategoria')}
                  className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
                </Link>
              )}
            </div>
          ),
        }}
      />

      {a.estado !== 'sinPermiso' && a.estado !== 'error' && (
        <KpiStrip etiqueta={t('listado.kpi.resumen')}>
          <StatCard
            etiqueta={t('comun.categorias')}
            icono={Tags}
            cargando={cargandoKpi}
            valor={n(r.total)}
            detalle={t('listado.kpi.activasInactivas', {
              activas: r.activas,
              nActivas: n(r.activas),
              inactivas: r.inactivas,
              nInactivas: n(r.inactivas),
            })}
            onClick={() => l.limpiarTodo()}
          />
          <StatCard
            etiqueta={t('listado.kpi.sinProductos')}
            icono={TriangleAlert}
            cargando={cargandoKpi}
            valor={n(r.sinProductos)}
            tono={r.sinProductos > 0 ? 'advertencia' : 'neutro'}
            detalle={r.sinProductos > 0 ? t('listado.kpi.revisalas') : t('listado.kpi.todasConProductos')}
            onClick={() => l.setFiltro('productos', 'sin')}
          />
          <StatCard
            etiqueta={t('listado.kpi.productosSinCategoria')}
            icono={Package}
            cargando={cargandoKpi}
            valor={n(r.productosSinCategoria)}
            tono={r.productosSinCategoria > 0 ? 'peligro' : 'exito'}
            tendencia={r.productosSinCategoria > 0 ? 'baja' : undefined}
            detalle={t('listado.kpi.deTotal', { total: n(r.productosTotal) })}
            href={RUTAS_CATEGORIAS.catalogo}
          />
          <StatCard
            etiqueta={t('listado.kpi.conEstacion')}
            icono={ChefHat}
            cargando={cargandoKpi}
            valor={n(r.conEstacion)}
            detalle={t('listado.kpi.generanComanda')}
            onClick={() => l.setFiltro('estacion', 'con')}
          />
        </KpiStrip>
      )}

      {a.estado !== 'sinPermiso' && (
        <ListToolbar
          busqueda={
            <SearchInput
              value={l.busqueda}
              onChange={l.setBusqueda}
              placeholder={escritorio ? t('listado.busqueda.placeholder') : t('listado.busqueda.placeholderMovil')}
              etiqueta={t('listado.busqueda.etiqueta')}
              cargando={a.refrescando}
            />
          }
          filtros={
            <FilterPanel
              conteo={l.filtrosActivos}
              onLimpiar={l.limpiarFiltros}
              textoVerResultados={t('listado.filtros.verResultados', { count: a.totalRaices, n: n(a.totalRaices) })}
            >
              <FormField etiqueta={t('listado.filtros.estado')}>
                {(c) => (
                  <SegmentedControl
                    aria-labelledby={c.idEtiqueta}
                    anchoCompleto
                    valor={l.filtros.estado ?? 'todas'}
                    onValorChange={(v) => l.setFiltro('estado', v === 'todas' ? null : v)}
                    opciones={[
                      { valor: 'todas', etiqueta: t('filtros.todas') },
                      { valor: 'activas', etiqueta: t('filtros.activas') },
                      { valor: 'inactivas', etiqueta: t('filtros.inactivas') },
                    ]}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('listado.filtros.productos')}>
                {(c) => (
                  <SegmentedControl
                    aria-labelledby={c.idEtiqueta}
                    anchoCompleto
                    valor={l.filtros.productos ?? 'todas'}
                    onValorChange={(v) => l.setFiltro('productos', v === 'todas' ? null : v)}
                    opciones={[
                      { valor: 'todas', etiqueta: t('filtros.todas') },
                      { valor: 'con', etiqueta: t('filtros.conProductos') },
                      { valor: 'sin', etiqueta: t('filtros.sinProductos') },
                    ]}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('listado.filtros.estacion')}>
                {(c) => (
                  <Select
                    value={l.filtros.estacion ?? 'todas'}
                    onValueChange={(v) => l.setFiltro('estacion', v === 'todas' ? null : v)}
                  >
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">{t('filtros.todas')}</SelectItem>
                      <SelectItem value="con">{t('filtros.conEstacion')}</SelectItem>
                      <SelectItem value="sin">{t('filtros.sinEstacion')}</SelectItem>
                      {OPCIONES_ESTACION.map((o) => (
                        <SelectItem key={o.valor} value={o.valor}>
                          {etiquetaEstacion(o.valor, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('listado.filtros.preparacion')}>
                {(c) => (
                  <SegmentedControl
                    aria-labelledby={c.idEtiqueta}
                    anchoCompleto
                    valor={l.filtros.preparacion ?? 'todas'}
                    onValorChange={(v) => l.setFiltro('preparacion', v === 'todas' ? null : v)}
                    opciones={[
                      { valor: 'todas', etiqueta: t('filtros.todas') },
                      { valor: 'si', etiqueta: t('comun.generaComanda') },
                      { valor: 'no', etiqueta: t('filtros.sinComanda') },
                    ]}
                  />
                )}
              </FormField>
            </FilterPanel>
          }
          chips={<FilterChips chips={a.chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
        />
      )}

      <ZonaSoltarRaiz {...arrastre.raiz} />

      <DataTable
        etiqueta={t('listado.tabla')}
        columnas={columnas}
        filas={a.filas}
        obtenerId={(f) => String(f.dato.id)}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        seleccion={a.seleccion}
        onSeleccionChange={puedeSeleccionar ? a.setSeleccion : undefined}
        onFilaClick={(f) => router.push(RUTAS_CATEGORIAS.detalle(f.dato.uuid))}
        etiquetaFila={(f) => f.dato.name}
        acciones={soloLectura ? undefined : (f) => accionesFila(f.dato)}
        virtualizar={false}
        filasEsqueleto={10}
        tarjetaMovil={(f, ctx) => (
          <TreeCard
            nivel={f.nivel}
            tieneHijos={f.tieneHijos}
            abierto={f.abierto}
            onAlternar={() => a.alternar(f.dato.id, f.abierto)}
            icono={iconoCategoria(f.dato.icon)}
            titulo={f.dato.name}
            subtitulo={`/${f.dato.slug}`}
            meta={[
              t('comun.nProductos', { count: f.dato.productos, n: n(f.dato.productos) }),
              f.dato.hijas ? t('comun.nSubcategorias', { count: f.dato.hijas, n: n(f.dato.hijas) }) : null,
              f.dato.station ? etiquetaEstacion(f.dato.station, t) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            estado={<StatusBadge estado={f.dato.is_active ? 'activa' : 'inactiva'} />}
            acciones={accionesFila(f.dato)}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
            onClick={() => router.push(RUTAS_CATEGORIAS.detalle(f.dato.uuid))}
          />
        )}
        vacio={{
          titulo: t('listado.vacio.titulo'),
          descripcion: t('listado.vacio.descripcion'),
          icono: Tags,
          accion: puedeCrear ? { etiqueta: t('comun.nuevaCategoria'), href: RUTAS_CATEGORIAS.nueva(), icono: Plus } : undefined,
          accionSecundaria: puedeCrear
            ? { etiqueta: t('listado.vacio.importar'), onClick: () => setImportarAbierto(true), icono: Upload }
            : undefined,
        }}
        sinResultados={{ descripcion: t('listado.sinResultados') }}
        error={{ titulo: t('listado.error.titulo'), descripcion: t('listado.error.descripcion') }}
        sinPermiso={{
          titulo: t('listado.sinPermiso.titulo'),
          descripcion: t('listado.sinPermiso.descripcion'),
          accion: { etiqueta: t('comun.volverInventario'), href: '/app/inventario' },
        }}
        onReintentar={() => void a.cargar()}
        onLimpiarFiltros={l.limpiarTodo}
        termino={l.busqueda}
        pie={
          <Pagination
            pagina={l.pagina}
            tamano={l.tamano}
            total={a.totalRaices}
            onPaginaChange={l.setPagina}
            onTamanoChange={l.setTamano}
            sustantivo={{ singular: t('comun.principal.singular'), plural: t('comun.principal.plural') }}
            cargando={a.estado === 'cargando'}
          />
        }
      />

      {a.seleccion.size > 0 && (
        <BulkActionBar
          seleccionados={a.seleccion.size}
          total={a.idsCoincidentes.length}
          onSeleccionarTodos={() => a.setSeleccion(new Set(a.idsCoincidentes))}
          sustantivo={{ singular: t('comun.categoria.singular'), plural: t('comun.categoria.plural') }}
          acciones={[
            { id: 'mover', etiqueta: t('acciones.moverA'), icono: FolderInput, onClick: () => setMoverIds(a.seleccionadas.map((c) => c.id)) },
            {
              id: 'desactivar',
              etiqueta: t('acciones.desactivar'),
              icono: PowerOff,
              onClick: () => setConfirmarDesactivar(true),
              cargando: trabajandoMasivo === 'desactivar',
              deshabilitada: a.seleccionadas.every((c) => !c.is_active),
              motivo: t('listado.masivas.yaInactivas'),
            },
          ]}
          accionesSecundarias={[
            {
              id: 'activar',
              etiqueta: t('acciones.activar'),
              icono: Power,
              onSelect: () => void cambiarSeleccion(true),
              deshabilitada: a.seleccionadas.every((c) => c.is_active),
              motivo: t('listado.masivas.yaActivas'),
            },
          ]}
          onLimpiar={() => a.setSeleccion(new Set())}
        />
      )}

      <MoverCategoriaDialog
        abierto={moverIds !== null}
        onAbiertoChange={(v) => !v && setMoverIds(null)}
        categorias={nodos}
        ids={moverIds ?? []}
        onMover={(padre) => mover(moverIds ?? [], padre)}
      />

      <EliminarCategoriaDialog
        abierto={aEliminar !== null}
        onAbiertoChange={(v) => !v && setAEliminar(null)}
        categoria={aEliminar}
        categorias={nodos}
        onEliminar={eliminar}
      />

      <ConfirmDialog
        open={confirmarDesactivar}
        onOpenChange={setConfirmarDesactivar}
        title={t('listado.confirmarDesactivar.titulo', { count: activasSeleccionadas, n: n(activasSeleccionadas) })}
        description={t('listado.confirmarDesactivar.descripcion')}
        confirmLabel={t('acciones.desactivar')}
        onConfirm={() => cambiarSeleccion(false)}
      />

      <ImportCategoriesDialog open={importarAbierto} onOpenChange={setImportarAbierto} onSuccess={() => void recargar()} />
    </div>
  );
}
