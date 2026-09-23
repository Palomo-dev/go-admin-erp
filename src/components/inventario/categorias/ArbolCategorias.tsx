'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { accionesDeCategoria } from './accionesCategoria';
import { MoverCategoriaDialog } from './MoverCategoriaDialog';
import { EliminarCategoriaDialog } from './EliminarCategoriaDialog';
import { ImportCategoriesDialog } from './ImportCategoriesDialog';
import { etiquetaEstacion, iconoCategoria, OPCIONES_ESTACION, RUTAS_CATEGORIAS } from './iconoCategoria';

/**
 * Árbol de categorías (Figma `586:290667`): seis estados, menús «⋯» de fila y
 * de cabecera, FilterPanel, selección múltiple con BulkActionBar, «Mover a…»,
 * eliminar con destino de productos y la versión móvil con tarjetas por nivel.
 */
const NUM = new Intl.NumberFormat('es-CO');
const n = (v: number) => NUM.format(v);
const plural = (v: number, uno: string, varios: string) => `${n(v)} ${v === 1 ? uno : varios}`;

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

function mensajeError(e: unknown, respaldo: string): string {
  return e instanceof Error && e.message ? e.message : respaldo;
}

export function ArbolCategorias() {
  const router = useRouter();
  const { toast } = useToast();
  const { timezone } = useOrgTimezone();
  const escritorio = useEsEscritorio();
  const a = useArbolCategorias();
  const { listado: l, organizationId, porId, nodos } = a;

  const [importarAbierto, setImportarAbierto] = useState(false);
  const [moverIds, setMoverIds] = useState<number[] | null>(null);
  const [aEliminar, setAEliminar] = useState<NodoCategoria | null>(null);
  const [confirmarDesactivar, setConfirmarDesactivar] = useState(false);
  const [trabajandoMasivo, setTrabajandoMasivo] = useState<string | null>(null);

  const recargar = useCallback(() => a.cargar(true), [a]);

  // ── Acciones ─────────────────────────────────────────────────────────────
  const mover = useCallback(
    async (ids: number[], padre: number | null) => {
      if (!organizationId) return;
      try {
        await categoryService.moverCategorias(organizationId, ids, padre);
        const destino = padre !== null ? porId.get(padre)?.name : null;
        const quien = ids.length === 1 ? (porId.get(ids[0])?.name ?? 'La categoría') : `${ids.length} categorías`;
        toast({
          title: ids.length === 1 ? 'Categoría movida' : 'Categorías movidas',
          description: destino ? `${quien} ahora ${ids.length === 1 ? 'es subcategoría' : 'son subcategorías'} de «${destino}».` : `${quien} ${ids.length === 1 ? 'quedó' : 'quedaron'} como categoría principal.`,
        });
        a.setSeleccion(new Set());
        await recargar();
      } catch (e) {
        toast({ title: 'No se pudo mover', description: mensajeError(e, 'Inténtalo de nuevo.'), variant: 'destructive' });
        throw e;
      }
    },
    [organizationId, porId, toast, a, recargar],
  );

  const alternarActiva = useCallback(
    async (cat: NodoCategoria) => {
      if (!organizationId) return;
      try {
        await categoryService.setActivas(organizationId, [cat.id], !cat.is_active);
        toast({ title: cat.is_active ? 'Categoría desactivada' : 'Categoría activada', description: `«${cat.name}»` });
        await recargar();
      } catch (e) {
        toast({ title: 'No se pudo cambiar el estado', description: mensajeError(e, 'Inténtalo de nuevo.'), variant: 'destructive' });
      }
    },
    [organizationId, toast, recargar],
  );

  const duplicar = useCallback(
    async (cat: NodoCategoria) => {
      if (!organizationId) return;
      try {
        const copia = await categoryService.duplicate(cat.id, organizationId);
        toast({ title: 'Categoría duplicada', description: `Se creó «${copia.name}».` });
        await recargar();
      } catch (e) {
        toast({ title: 'No se pudo duplicar', description: mensajeError(e, 'Inténtalo de nuevo.'), variant: 'destructive' });
      }
    },
    [organizationId, toast, recargar],
  );

  const eliminar = useCallback(
    async (destino: number | null) => {
      if (!organizationId || !aEliminar) return;
      try {
        const r = await categoryService.eliminarCategoria(organizationId, aEliminar.id, destino);
        const partes = [
          r.productos_movidos ? `${plural(r.productos_movidos, 'producto pasó', 'productos pasaron')} a «${porId.get(destino ?? -1)?.name ?? 'otra categoría'}»` : null,
          r.subcategorias_movidas ? `${plural(r.subcategorias_movidas, 'subcategoría subió', 'subcategorías subieron')} un nivel` : null,
        ].filter(Boolean);
        toast({ title: 'Categoría eliminada', description: partes.length ? `${partes.join(' · ')}.` : `«${aEliminar.name}»` });
        await recargar();
      } catch (e) {
        const conProductos = e instanceof ErrorCategoria && e.codigo === 'CATEGORIA_CON_PRODUCTOS';
        toast({
          title: conProductos ? 'Tiene productos' : 'No se pudo eliminar',
          description: mensajeError(e, 'Inténtalo de nuevo.'),
          variant: 'destructive',
        });
        throw e;
      }
    },
    [organizationId, aEliminar, porId, toast, recargar],
  );

  const cambiarSeleccion = useCallback(
    async (activa: boolean) => {
      if (!organizationId) return;
      const ids = a.seleccionadas.map((c) => c.id);
      setTrabajandoMasivo(activa ? 'activar' : 'desactivar');
      try {
        await categoryService.setActivas(organizationId, ids, activa);
        toast({ title: activa ? 'Categorías activadas' : 'Categorías desactivadas', description: plural(ids.length, 'categoría', 'categorías') });
        a.setSeleccion(new Set());
        await recargar();
      } catch (e) {
        toast({ title: 'No se pudo cambiar el estado', description: mensajeError(e, 'Inténtalo de nuevo.'), variant: 'destructive' });
      } finally {
        setTrabajandoMasivo(null);
      }
    },
    [organizationId, a, toast, recargar],
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
        toast({ title: 'Exportación lista', description: `Se descargó el archivo ${formato.toUpperCase()}.` });
      } catch (e) {
        toast({ title: 'No se pudo exportar', description: mensajeError(e, 'Inténtalo de nuevo.'), variant: 'destructive' });
      }
    },
    [organizationId, toast, timezone],
  );

  const accionesCabecera: AccionFila[] = [
    { id: 'csv', etiqueta: 'Exportar CSV', icono: FileText, onSelect: () => void exportar('csv') },
    { id: 'xlsx', etiqueta: 'Exportar Excel', icono: FileSpreadsheet, onSelect: () => void exportar('xlsx') },
    { id: 'pdf', etiqueta: 'Exportar PDF', icono: Download, onSelect: () => void exportar('pdf') },
    { id: 'expandir', etiqueta: 'Expandir todo', icono: ChevronsUpDown, onSelect: a.expandirTodo, separadorAntes: true },
    { id: 'contraer', etiqueta: 'Contraer todo', icono: ChevronsDownUp, onSelect: a.contraerTodo },
    { id: 'actualizar', etiqueta: a.refrescando ? 'Actualizando…' : 'Actualizar', icono: RefreshCw, onSelect: () => void recargar(), deshabilitada: a.refrescando, motivo: 'Ya se está actualizando' },
  ];

  const accionesFila = (cat: NodoCategoria): AccionFila[] =>
    accionesDeCategoria(cat, {
      editar: () => router.push(RUTAS_CATEGORIAS.editar(cat.uuid)),
      agregarSubcategoria: () => router.push(RUTAS_CATEGORIAS.nueva(cat.id)),
      mover: () => setMoverIds([cat.id]),
      moverARaiz: () => void mover([cat.id], null).catch(() => undefined),
      duplicar: () => void duplicar(cat),
      verProductos: () => router.push(RUTAS_CATEGORIAS.productos(cat.id)),
      alternarActiva: () => void alternarActiva(cat),
      eliminar: () => setAEliminar(cat),
    });

  // ── Arrastrar para cambiar de padre (atajo de escritorio de «Mover a…») ──
  const puedeSoltar = useCallback(
    (origen: number, destino: number | null): true | string => {
      const o = porId.get(origen);
      if (!o) return 'No existe';
      if (destino === null) return o.parent_id === null ? 'Ya es una categoría principal' : true;
      if (destino === origen) return 'Es la misma categoría';
      if (o.parent_id === destino) return 'Ya está dentro de esa categoría';
      if (a.descendientes([origen]).has(destino)) return 'Crearía un ciclo';
      return true;
    },
    [porId, a],
  );
  const arrastre = useArrastreArbol({
    puedeSoltar,
    onSoltar: (origen, destino) => void mover([origen], destino).catch(() => undefined),
    deshabilitado: !escritorio || a.estado !== 'listo',
  });

  // ── Tabla ────────────────────────────────────────────────────────────────
  const columnas: ColumnaTabla<FilaArbol<NodoCategoria>>[] = useMemo(
    () => [
      {
        id: 'nombre',
        encabezado: 'Nombre',
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
        encabezado: 'Productos',
        ordenable: true,
        ancho: 130,
        celda: (f) => (
          <span className="flex flex-col">
            <Link
              href={RUTAS_CATEGORIAS.productos(f.dato.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Ver los ${f.dato.productos} productos de ${f.dato.name}`}
              className={f.dato.productos > 0 ? 'font-medium text-link tabular-nums hover:underline' : 'tabular-nums text-fg-muted hover:underline'}
            >
              {n(f.dato.productos)}
            </Link>
            {f.dato.productos_regla > 0 && (
              <span className="text-xs text-fg-muted">+{n(f.dato.productos_regla)} por regla</span>
            )}
          </span>
        ),
      },
      {
        id: 'subcategorias',
        encabezado: 'Subcategorías',
        alinear: 'derecha',
        ancho: 130,
        celda: (f) => <span className="tabular-nums">{f.dato.hijas > 0 ? n(f.dato.hijas) : '—'}</span>,
      },
      {
        id: 'estacion',
        encabezado: 'Estación de cocina',
        ancho: 190,
        celda: (f) => (
          <span className="flex flex-col">
            <span className={f.dato.station ? 'text-fg' : 'text-fg-secondary'}>{etiquetaEstacion(f.dato.station)}</span>
            {f.dato.requires_preparation && (
              <span className="flex items-center gap-1 text-xs text-fg-muted">
                <ChefHat aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                Genera comanda
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'estado',
        encabezado: 'Estado',
        ancho: 110,
        celda: (f) => <StatusBadge estado={f.dato.is_active ? 'activa' : 'inactiva'} />,
      },
    ],
    [a, arrastre],
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
      ? `${plural(r.total, 'categoría', 'categorías')} en ${plural(r.niveles, 'nivel', 'niveles')}`
      : undefined;

  const nuevaCategoria = (
    <Link
      href={RUTAS_CATEGORIAS.nueva()}
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      Nueva categoría
    </Link>
  );

  const soloLectura = a.estado === 'sinPermiso';

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo="Categorías"
        subtitulo={subtitulo}
        icono={Tags}
        cargando={a.estado === 'cargando' || a.refrescando}
        migas={[{ etiqueta: 'Inventario', href: '/app/inventario' }, { etiqueta: 'Categorías' }]}
        acciones={
          soloLectura ? undefined : (
            <>
              <button
                type="button"
                onClick={() => setImportarAbierto(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
                Importar
              </button>
              {nuevaCategoria}
              <RowActionsMenu orientacion="horizontal" tamano="md" titulo="Categorías" acciones={accionesCabecera} />
            </>
          )
        }
        movil={{
          subtitulo,
          accion: soloLectura ? undefined : (
            <div className="flex items-center">
              <RowActionsMenu
                orientacion="horizontal"
                titulo="Categorías"
                acciones={[
                  { id: 'importar', etiqueta: 'Importar categorías', icono: Upload, onSelect: () => setImportarAbierto(true) },
                  ...accionesCabecera,
                ]}
              />
              <Link
                href={RUTAS_CATEGORIAS.nueva()}
                aria-label="Nueva categoría"
                className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </Link>
            </div>
          ),
          ocultarBarra: a.seleccion.size > 0,
        }}
      />

      {a.estado !== 'sinPermiso' && a.estado !== 'error' && (
        <KpiStrip etiqueta="Resumen de categorías">
          <StatCard
            etiqueta="Categorías"
            icono={Tags}
            cargando={cargandoKpi}
            valor={n(r.total)}
            detalle={`${plural(r.activas, 'activa', 'activas')} · ${plural(r.inactivas, 'inactiva', 'inactivas')}`}
            onClick={() => l.limpiarTodo()}
          />
          <StatCard
            etiqueta="Sin productos"
            icono={TriangleAlert}
            cargando={cargandoKpi}
            valor={n(r.sinProductos)}
            tono={r.sinProductos > 0 ? 'advertencia' : 'neutro'}
            detalle={r.sinProductos > 0 ? 'Revísalas o desactívalas' : 'Todas tienen productos'}
            onClick={() => l.setFiltro('productos', 'sin')}
          />
          <StatCard
            etiqueta="Productos sin categoría"
            icono={Package}
            cargando={cargandoKpi}
            valor={n(r.productosSinCategoria)}
            tono={r.productosSinCategoria > 0 ? 'peligro' : 'exito'}
            tendencia={r.productosSinCategoria > 0 ? 'baja' : undefined}
            detalle={`De ${n(r.productosTotal)} · asignar desde el catálogo`}
            href={RUTAS_CATEGORIAS.catalogo}
          />
          <StatCard
            etiqueta="Con estación de cocina"
            icono={ChefHat}
            cargando={cargandoKpi}
            valor={n(r.conEstacion)}
            detalle="Generan comanda en el POS"
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
              placeholder={escritorio ? 'Buscar por nombre o slug (entra en ramas cerradas)' : 'Buscar categoría'}
              etiqueta="Buscar categorías"
              cargando={a.refrescando}
            />
          }
          filtros={
            <FilterPanel
              conteo={l.filtrosActivos}
              onLimpiar={l.limpiarFiltros}
              textoVerResultados={`Ver ${plural(a.totalRaices, 'categoría principal', 'categorías principales')}`}
            >
              <FormField etiqueta="Estado">
                {(c) => (
                  <SegmentedControl
                    aria-labelledby={c.idEtiqueta}
                    anchoCompleto
                    valor={l.filtros.estado ?? 'todas'}
                    onValorChange={(v) => l.setFiltro('estado', v === 'todas' ? null : v)}
                    opciones={[
                      { valor: 'todas', etiqueta: 'Todas' },
                      { valor: 'activas', etiqueta: 'Activas' },
                      { valor: 'inactivas', etiqueta: 'Inactivas' },
                    ]}
                  />
                )}
              </FormField>
              <FormField etiqueta="Productos">
                {(c) => (
                  <SegmentedControl
                    aria-labelledby={c.idEtiqueta}
                    anchoCompleto
                    valor={l.filtros.productos ?? 'todas'}
                    onValorChange={(v) => l.setFiltro('productos', v === 'todas' ? null : v)}
                    opciones={[
                      { valor: 'todas', etiqueta: 'Todas' },
                      { valor: 'con', etiqueta: 'Con productos' },
                      { valor: 'sin', etiqueta: 'Sin productos' },
                    ]}
                  />
                )}
              </FormField>
              <FormField etiqueta="Estación de cocina">
                {(c) => (
                  <Select
                    value={l.filtros.estacion ?? 'todas'}
                    onValueChange={(v) => l.setFiltro('estacion', v === 'todas' ? null : v)}
                  >
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      <SelectItem value="con">Con estación</SelectItem>
                      <SelectItem value="sin">Sin estación</SelectItem>
                      {OPCIONES_ESTACION.map((o) => (
                        <SelectItem key={o.valor} value={o.valor}>
                          {o.etiqueta}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta="Preparación">
                {(c) => (
                  <SegmentedControl
                    aria-labelledby={c.idEtiqueta}
                    anchoCompleto
                    valor={l.filtros.preparacion ?? 'todas'}
                    onValorChange={(v) => l.setFiltro('preparacion', v === 'todas' ? null : v)}
                    opciones={[
                      { valor: 'todas', etiqueta: 'Todas' },
                      { valor: 'si', etiqueta: 'Genera comanda' },
                      { valor: 'no', etiqueta: 'Sin comanda' },
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
        etiqueta="Árbol de categorías"
        columnas={columnas}
        filas={a.filas}
        obtenerId={(f) => String(f.dato.id)}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        seleccion={a.seleccion}
        onSeleccionChange={soloLectura ? undefined : a.setSeleccion}
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
              plural(f.dato.productos, 'producto', 'productos'),
              f.dato.hijas ? plural(f.dato.hijas, 'subcategoría', 'subcategorías') : null,
              f.dato.station ? etiquetaEstacion(f.dato.station) : null,
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
          titulo: 'Aún no tienes categorías',
          descripcion: 'Agrupa tus productos para encontrarlos rápido en el POS, la tienda web y los informes.',
          icono: Tags,
          accion: { etiqueta: 'Nueva categoría', href: RUTAS_CATEGORIAS.nueva(), icono: Plus },
          accionSecundaria: { etiqueta: 'Importar desde CSV o Excel', onClick: () => setImportarAbierto(true), icono: Upload },
        }}
        sinResultados={{ descripcion: 'La búsqueda revisa también las ramas cerradas. Prueba con otro término o quita un filtro.' }}
        error={{ titulo: 'No pudimos cargar las categorías', descripcion: 'Revisa tu conexión e inténtalo de nuevo.' }}
        sinPermiso={{
          titulo: 'No tienes acceso a las categorías de esta organización',
          descripcion: 'Pídele a un administrador que te dé acceso al inventario.',
          accion: { etiqueta: 'Volver al inventario', href: '/app/inventario' },
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
            sustantivo={{ singular: 'categoría principal', plural: 'categorías principales' }}
            cargando={a.estado === 'cargando'}
          />
        }
      />

      {a.seleccion.size > 0 && (
        <BulkActionBar
          seleccionados={a.seleccion.size}
          total={a.idsCoincidentes.length}
          onSeleccionarTodos={() => a.setSeleccion(new Set(a.idsCoincidentes))}
          sustantivo={{ singular: 'categoría', plural: 'categorías' }}
          acciones={[
            { id: 'mover', etiqueta: 'Mover a…', icono: FolderInput, onClick: () => setMoverIds(a.seleccionadas.map((c) => c.id)) },
            {
              id: 'desactivar',
              etiqueta: 'Desactivar',
              icono: PowerOff,
              onClick: () => setConfirmarDesactivar(true),
              cargando: trabajandoMasivo === 'desactivar',
              deshabilitada: a.seleccionadas.every((c) => !c.is_active),
              motivo: 'Todas las seleccionadas ya están inactivas',
            },
          ]}
          accionesSecundarias={[
            {
              id: 'activar',
              etiqueta: 'Activar',
              icono: Power,
              onSelect: () => void cambiarSeleccion(true),
              deshabilitada: a.seleccionadas.every((c) => c.is_active),
              motivo: 'Todas las seleccionadas ya están activas',
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
        title={`¿Desactivar ${plural(a.seleccionadas.filter((c) => c.is_active).length, 'categoría', 'categorías')}?`}
        description="Dejan de verse en el POS y en la tienda web. Sus productos no se borran ni cambian de categoría, y puedes volver a activarlas cuando quieras."
        confirmLabel="Desactivar"
        onConfirm={() => cambiarSeleccion(false)}
      />

      <ImportCategoriesDialog open={importarAbierto} onOpenChange={setImportarAbierto} onSuccess={() => void recargar()} />
    </div>
  );
}
