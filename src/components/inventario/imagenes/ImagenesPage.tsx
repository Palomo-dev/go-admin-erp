'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Download,
  Eye,
  ExternalLink,
  Globe,
  GlobeLock,
  Images,
  Link2,
  Package,
  PackageX,
  RefreshCw,
  TriangleAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  BulkActionBar,
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
  SegmentedControl,
  SelectorEntidad,
  StatCard,
  TabBar,
  clasesBoton,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId, getOrganizationName } from '@/lib/hooks/useOrganization';
import { usePermisosCatalogo } from '@/components/inventario/categorias/usePermisosCatalogo';
import { TarjetaImagen } from './TarjetaImagen';
import { PanelDetalleImagen } from './PanelDetalleImagen';
import { DialogoSubirImagenes } from './DialogoSubirImagenes';
import { DialogoAsignarProductos } from './DialogoAsignarProductos';
import {
  actualizarImagen,
  asignarAProductos,
  buscarProductos,
  cambiarVisibilidad,
  detalleImagen,
  eliminarImagenes,
  listarBiblioteca,
  listarDeProductos,
  productoPorId,
  resumenImagenes,
  type DetalleImagen,
  type ImagenBiblioteca,
  type ImagenDeProducto,
  type ProductoElegible,
  type ResumenImagenes,
} from './ImagenesService';
import {
  CLAVES_FILTRO_IMAGENES,
  claveError,
  esSinPermiso,
  etiquetaFormato,
  filtrosActivos,
  formatoTamano,
  nombreDeRuta,
  parametrosListado,
  pestanaDe,
  type Pestana,
} from './imagenesLogica';

type Estado = 'cargando' | 'listo' | 'error' | 'sinPermiso';
const TODAS = '__todas__';

async function descargar(url: string, nombre: string) {
  try {
    const blob = await fetch(url).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.blob();
    });
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

/**
 * «Imágenes» (`/app/inventario/imagenes`, Figma `596:345914`): la biblioteca
 * compartida de la organización (`shared_images`) y, en otra pestaña, las
 * fotos subidas directamente a cada producto (`product_images`). Galería
 * paginada en el servidor (`fn_imagenes_listado`), cifras reales
 * (`fn_imagenes_resumen`), filtros combinables, selección con barra masiva,
 * panel de detalle con «Usada en», subir con avance, asignar a productos y
 * eliminar con reasignación de la principal. Todo por RPC con permisos en el
 * servidor; la interfaz oculta lo que el usuario no puede hacer.
 */
export function ImagenesPage() {
  const t = useTranslations('inventarioImagenes');
  const locale = useLocale();
  const entero = useFormatoEntero();
  const router = useRouter();
  const { toast } = useToast();
  const permisos = usePermisosCatalogo();
  const org = getOrganizationId();
  const nombreOrg = getOrganizationName();

  const listado = useListadoServidor({
    filtros: CLAVES_FILTRO_IMAGENES,
    camposOrden: ['recientes', 'nombre', 'tamano', 'uso'],
    ordenPorDefecto: null,
    tamanoPorDefecto: 20,
  });
  const pestana = pestanaDe(listado.filtros);
  const parametros = useMemo(
    () => parametrosListado({ busqueda: listado.busqueda, filtros: listado.filtros, pagina: listado.pagina, tamano: listado.tamano, orden: listado.orden }),
    [listado.busqueda, listado.filtros, listado.pagina, listado.tamano, listado.orden],
  );

  const [resumen, setResumen] = useState<ResumenImagenes | null>(null);
  const [biblioteca, setBiblioteca] = useState<ImagenBiblioteca[]>([]);
  const [deProductos, setDeProductos] = useState<ImagenDeProducto[]>([]);
  const [total, setTotal] = useState(0);
  const [estado, setEstado] = useState<Estado>('cargando');
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<number>>(() => new Set());
  const [productoFiltro, setProductoFiltro] = useState<ProductoElegible | null>(null);

  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<DetalleImagen | null>(null);
  const [estadoDetalle, setEstadoDetalle] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [subirAbierto, setSubirAbierto] = useState(false);
  const [asignarA, setAsignarA] = useState<{ ids: number[]; nombre: string } | null>(null);
  const [aEliminar, setAEliminar] = useState<{ imagenes: ImagenBiblioteca[]; detalle: DetalleImagen | null } | null>(null);
  const [procesando, setProcesando] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  // Cifras (y contadores de las pestañas).
  useEffect(() => {
    let vivo = true;
    resumenImagenes(org)
      .then((r) => vivo && setResumen(r))
      .catch((e) => {
        if (vivo && esSinPermiso(e)) setEstado('sinPermiso');
      });
    return () => {
      vivo = false;
    };
  }, [org, recarga]);

  // Página de la galería.
  useEffect(() => {
    let vivo = true;
    setEstado((e) => (e === 'sinPermiso' ? e : 'cargando'));
    const peticion =
      parametros.p_origen === 'productos'
        ? listarDeProductos(org, parametros).then((r) => {
            if (!vivo) return;
            setDeProductos(r.filas);
            setTotal(r.total);
          })
        : listarBiblioteca(org, parametros).then((r) => {
            if (!vivo) return;
            setBiblioteca(r.filas);
            setTotal(r.total);
          });
    peticion
      .then(() => vivo && setEstado('listo'))
      .catch((e) => {
        if (!vivo) return;
        console.error('Error cargando imágenes:', e);
        setEstado(esSinPermiso(e) ? 'sinPermiso' : 'error');
      });
    return () => {
      vivo = false;
    };
  }, [org, parametros, recarga]);

  // El producto del filtro, para su chip y el selector (la URL solo trae el id).
  useEffect(() => {
    const id = Number(listado.filtros.producto);
    if (!id) {
      setProductoFiltro(null);
      return;
    }
    if (productoFiltro?.id === id) return;
    void productoPorId(org, id).then(setProductoFiltro);
  }, [listado.filtros.producto, org, productoFiltro?.id]);

  useEffect(() => setSeleccion(new Set()), [pestana]);

  // ── Detalle ──────────────────────────────────────────────────────────────
  const cargarDetalle = useCallback(
    async (id: number) => {
      setEstadoDetalle('cargando');
      try {
        setDetalle(await detalleImagen(org, id));
        setEstadoDetalle('listo');
      } catch {
        setEstadoDetalle('error');
      }
    },
    [org],
  );

  const abrirDetalle = (id: number) => {
    setDetalle(null);
    setDetalleId(id);
    void cargarDetalle(id);
  };

  const avisarError = useCallback(
    (e: unknown, respaldo: string) => {
      const clave = claveError(e);
      toast({ variant: 'destructive', title: clave === 'generico' ? respaldo : t(`errores.${clave}`) });
    },
    [t, toast],
  );

  const guardarDetalle = async (datos: { nombre: string; textoAlternativo: string; publica: boolean }) => {
    if (!detalleId) return;
    try {
      setDetalle(await actualizarImagen(org, detalleId, datos));
      toast({ title: t('toast.guardada') });
      recargar();
    } catch (e) {
      avisarError(e, t('toast.errorGuardar'));
    }
  };

  // ── Acciones ─────────────────────────────────────────────────────────────
  const visibilidad = async (ids: number[], publica: boolean) => {
    try {
      const n = await cambiarVisibilidad(org, ids, publica);
      toast({ title: publica ? t('toast.publicas', { n }) : t('toast.privadas', { n }) });
      if (detalleId && ids.includes(detalleId)) void cargarDetalle(detalleId);
      recargar();
    } catch (e) {
      avisarError(e, t('toast.errorGuardar'));
    }
  };

  const copiarEnlace = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t('toast.enlaceCopiado') });
    } catch {
      toast({ variant: 'destructive', title: t('toast.errorCopiar') });
    }
  };

  const asignar = async (productos: number[], principal: boolean) => {
    if (!asignarA) return;
    try {
      let asignados = 0;
      let ya = 0;
      for (const id of asignarA.ids) {
        const r = await asignarAProductos(org, id, productos, principal);
        asignados += r.asignados;
        ya += r.ya_la_tenian;
      }
      toast({
        title: t('toast.asignada', { n: asignados }),
        description: ya > 0 ? t('toast.yaLaTenian', { n: ya }) : undefined,
      });
      setSeleccion(new Set());
      if (detalleId) void cargarDetalle(detalleId);
      recargar();
    } catch (e) {
      avisarError(e, t('toast.errorAsignar'));
      throw e;
    }
  };

  const pedirEliminar = async (imagenes: ImagenBiblioteca[]) => {
    // Para una sola imagen, el detalle dice de cuántos productos es la principal.
    let d: DetalleImagen | null = null;
    if (imagenes.length === 1 && imagenes[0].productos > 0) {
      d = await detalleImagen(org, imagenes[0].id).catch(() => null);
    }
    setAEliminar({ imagenes, detalle: d });
  };

  const eliminar = async () => {
    if (!aEliminar) return;
    setProcesando(true);
    try {
      const r = await eliminarImagenes(
        org,
        aEliminar.imagenes.map((i) => i.id),
      );
      toast({ title: t('toast.eliminadas', { n: r.eliminadas }) });
      if (detalleId && aEliminar.imagenes.some((i) => i.id === detalleId)) setDetalleId(null);
      setSeleccion(new Set());
      setAEliminar(null);
      recargar();
    } catch (e) {
      avisarError(e, t('toast.errorEliminar'));
    } finally {
      setProcesando(false);
    }
  };

  const accionesBiblioteca = (img: ImagenBiblioteca): AccionFila[] => [
    { id: 'ver', etiqueta: permisos.editar ? t('acciones.verEditar') : t('acciones.ver'), icono: Eye, onSelect: () => abrirDetalle(img.id) },
    {
      id: 'asignar',
      etiqueta: t('acciones.asignarPuntos'),
      icono: Package,
      onSelect: () => setAsignarA({ ids: [img.id], nombre: img.file_name }),
      oculta: !permisos.editar,
    },
    {
      id: 'visibilidad',
      etiqueta: img.is_public ? t('acciones.hacerPrivada') : t('acciones.hacerPublica'),
      icono: img.is_public ? GlobeLock : Globe,
      onSelect: () => void visibilidad([img.id], !img.is_public),
      oculta: !permisos.editar,
    },
    { id: 'copiar', etiqueta: t('acciones.copiarEnlace'), icono: Link2, onSelect: () => void copiarEnlace(img.url) },
    { id: 'descargar', etiqueta: t('acciones.descargar'), icono: Download, onSelect: () => void descargar(img.url, img.file_name) },
    {
      id: 'eliminar',
      etiqueta: t('acciones.eliminar'),
      icono: Trash2,
      destructiva: true,
      onSelect: () => void pedirEliminar([img]),
      oculta: !permisos.eliminar,
    },
  ];

  const accionesDeProducto = (img: ImagenDeProducto): AccionFila[] => [
    {
      id: 'producto',
      etiqueta: t('acciones.abrirProducto'),
      icono: ExternalLink,
      onSelect: () => router.push(`/app/inventario/productos/${img.product_uuid}?tab=imagenes`),
    },
    { id: 'copiar', etiqueta: t('acciones.copiarEnlace'), icono: Link2, onSelect: () => void copiarEnlace(img.url) },
    { id: 'descargar', etiqueta: t('acciones.descargar'), icono: Download, onSelect: () => void descargar(img.url, nombreDeRuta(img.storage_path)) },
  ];

  // ── Filtros ──────────────────────────────────────────────────────────────
  const activos = filtrosActivos(listado.filtros);
  const esBiblioteca = pestana === 'biblioteca';
  const etiquetaFiltro = (clave: string, valor: string): string => {
    if (clave === 'producto') return `${t('filtros.producto')}: ${productoFiltro?.nombre ?? `#${valor}`}`;
    return `${t(`filtros.${clave}`)}: ${t(`filtros.opciones.${valor}`)}`;
  };
  const chips: ChipFiltro[] = activos.map((k) => ({ clave: k, etiqueta: etiquetaFiltro(k, listado.filtros[k]) }));

  const buscarProducto = useCallback((texto: string, senal: AbortSignal) => buscarProductos(org, texto, senal), [org]);

  const filtroSelect = (clave: 'visibilidad' | 'tamano', opciones: readonly string[]) => (
    <FormField etiqueta={t(`filtros.${clave}`)}>
      {(c) => (
        <Select value={listado.filtros[clave] ?? TODAS} onValueChange={(v) => listado.setFiltro(clave, v === TODAS ? null : v)}>
          <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>{t(`filtros.todas.${clave}`)}</SelectItem>
            {opciones.map((o) => (
              <SelectItem key={o} value={o}>
                {t(`filtros.opciones.${o}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );

  const panelFiltros = (
    <FilterPanel
      conteo={activos.length}
      onLimpiar={() => {
        const { vista } = listado.filtros;
        listado.actualizar({ filtros: vista ? { vista } : {} });
      }}
      nota={t('filtros.nota')}
      textoVerResultados={t('filtros.verResultados', { n: total })}
    >
      <FormField etiqueta={t('filtros.producto')}>
        {(c) => (
          <SelectorEntidad<ProductoElegible>
            id={c.id}
            layout="campo"
            valor={productoFiltro}
            icono={Package}
            etiqueta={t('filtros.producto')}
            buscar={buscarProducto}
            aOpcion={(p) => ({ id: String(p.id), titulo: p.nombre, subtitulo: p.sku })}
            onCambiar={(p) => {
              setProductoFiltro(p);
              listado.setFiltro('producto', String(p.id));
            }}
            onQuitar={() => listado.setFiltro('producto', null)}
            textos={{ placeholder: t('filtros.todos'), buscar: t('asignar.buscar'), vacio: t('asignar.vacio'), sinResultados: t('asignar.sinResultados') }}
          />
        )}
      </FormField>
      {esBiblioteca && filtroSelect('visibilidad', ['publicas', 'privadas'])}
      {esBiblioteca && (
        <FormField etiqueta={t('filtros.uso')}>
          {(c) => (
            <SegmentedControl
              aria-labelledby={c.idEtiqueta}
              anchoCompleto
              valor={listado.filtros.uso ?? 'todas'}
              onValorChange={(v) => listado.setFiltro('uso', v === 'todas' ? null : v)}
              opciones={[
                { valor: 'todas', etiqueta: t('filtros.opciones.todas') },
                { valor: 'en_uso', etiqueta: t('filtros.opciones.en_uso') },
                { valor: 'sin_usar', etiqueta: t('filtros.opciones.sin_usar') },
              ]}
            />
          )}
        </FormField>
      )}
      <FormField etiqueta={t('filtros.formato')}>
        {(c) => (
          <SegmentedControl
            aria-labelledby={c.idEtiqueta}
            anchoCompleto
            valor={listado.filtros.formato ?? 'todos'}
            onValorChange={(v) => listado.setFiltro('formato', v === 'todos' ? null : v)}
            opciones={[
              { valor: 'todos', etiqueta: t('filtros.opciones.todos') },
              { valor: 'jpg_png', etiqueta: t('filtros.opciones.jpg_png') },
              { valor: 'webp', etiqueta: t('filtros.opciones.webp') },
            ]}
          />
        )}
      </FormField>
      {esBiblioteca && filtroSelect('tamano', ['pequena', 'mediana', 'grande'])}
    </FilterPanel>
  );

  // ── Selección ────────────────────────────────────────────────────────────
  const seleccionadas = biblioteca.filter((i) => seleccion.has(i.id));
  const alternar = (id: number, v: boolean) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });

  const seleccionarTodas = async () => {
    try {
      const ids: number[] = [];
      for (let desde = 0; desde < total; desde += 100) {
        const r = await listarBiblioteca(org, { ...parametros, p_offset: desde, p_limit: 100 });
        ids.push(...r.filas.map((f) => f.id));
      }
      setSeleccion(new Set(ids));
    } catch (e) {
      avisarError(e, t('errorCarga'));
    }
  };

  /** Las elegidas pueden no estar en la página: se piden por id para eliminar con su uso. */
  const elegidasParaEliminar = (): ImagenBiblioteca[] => {
    const enPagina = new Map(biblioteca.map((i) => [i.id, i]));
    return [...seleccion].map(
      (id) => enPagina.get(id) ?? ({ id, file_name: `#${id}`, productos: 0 } as unknown as ImagenBiblioteca),
    );
  };

  // ── Textos de estado ─────────────────────────────────────────────────────
  const vacioTotal = estado === 'listo' && total === 0 && !listado.hayCriterios && activos.length === 0;
  const sinResultados = estado === 'listo' && total === 0 && !vacioTotal;
  const tituloEliminar = aEliminar
    ? aEliminar.imagenes.length === 1
      ? t('eliminar.tituloUna', { nombre: aEliminar.imagenes[0].file_name })
      : t('eliminar.tituloVarias', { n: aEliminar.imagenes.length })
    : '';
  const descripcionEliminar = (() => {
    if (!aEliminar) return '';
    const d = aEliminar.detalle;
    if (d && d.productos > 0) {
      const galeria = Math.max(0, d.productos - d.principal_de);
      return d.principal_de > 0
        ? t('eliminar.principalYGaleria', { principal: d.principal_de, galeria })
        : t('eliminar.soloGaleria', { n: d.productos });
    }
    const usadas = aEliminar.imagenes.reduce((s, i) => s + (i.productos || 0), 0);
    return usadas > 0 ? t('eliminar.variasEnUso', { n: usadas }) : t('eliminar.sinUso');
  })();

  const subtitulo = resumen
    ? t('subtitulo', { organizacion: nombreOrg, n: entero(resumen.total), count: resumen.total })
    : t('cargando');

  const masAcciones: AccionFila[] = [
    { id: 'sin-imagen', etiqueta: t('acciones.productosSinImagen'), icono: PackageX, onSelect: () => router.push('/app/inventario/productos?imagen=sin') },
    { id: 'actualizar', etiqueta: t('acciones.actualizar'), icono: RefreshCw, onSelect: recargar },
  ];

  if (estado === 'sinPermiso') {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader titulo={t('titulo')} icono={Images} migas={[{ etiqueta: t('migaInventario'), href: '/app/inventario' }, { etiqueta: t('titulo') }]} />
        <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28">
      <PageHeader
        titulo={t('titulo')}
        icono={Images}
        migas={[{ etiqueta: t('migaInventario'), href: '/app/inventario' }, { etiqueta: t('titulo') }]}
        subtitulo={subtitulo}
        cargando={!resumen}
        acciones={
          <>
            {permisos.crear && (
              <button type="button" onClick={() => setSubirAbierto(true)} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
                <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('subir.boton')}
              </button>
            )}
            <RowActionsMenu acciones={masAcciones} orientacion="horizontal" tamano="md" titulo={t('titulo')} />
          </>
        }
        movil={{
          subtitulo: resumen ? t('subtituloMovil', { n: entero(resumen.total), count: resumen.total }) : t('cargando'),
          accion: permisos.crear ? (
            <button
              type="button"
              onClick={() => setSubirAbierto(true)}
              aria-label={t('subir.boton')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Upload aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          ) : undefined,
        }}
        debajo={
          <TabBar
            id="imagenes-pestanas"
            etiqueta={t('pestanas.etiqueta')}
            valor={pestana}
            onValorChange={(v: Pestana) => listado.setFiltro('vista', v === 'productos' ? 'productos' : null)}
            pestanas={[
              { valor: 'biblioteca', etiqueta: t('pestanas.biblioteca'), contador: resumen?.biblioteca },
              { valor: 'productos', etiqueta: t('pestanas.productos'), contador: resumen?.de_productos },
            ]}
          />
        }
      />

      <KpiStrip etiqueta={t('kpi.etiqueta')} className="hidden sm:grid">
        <StatCard
          etiqueta={t('kpi.imagenes')}
          valor={entero(resumen?.total ?? 0)}
          detalle={resumen ? t('kpi.imagenesDetalle', { biblioteca: entero(resumen.biblioteca), productos: entero(resumen.de_productos) }) : undefined}
          icono={Images}
          cargando={!resumen}
        />
        <StatCard
          etiqueta={t('kpi.sinUsar')}
          valor={entero(resumen?.sin_usar ?? 0)}
          detalle={resumen?.sin_usar ? t('kpi.sinUsarDetalle') : t('kpi.sinUsarNinguna')}
          tono={resumen?.sin_usar ? 'advertencia' : 'neutro'}
          iconoDetalle={resumen?.sin_usar ? TriangleAlert : undefined}
          icono={TriangleAlert}
          cargando={!resumen}
          onClick={() => listado.actualizar({ filtros: { uso: 'sin_usar' } })}
        />
        <StatCard
          etiqueta={t('kpi.productosSinImagen')}
          valor={entero(resumen?.productos_sin_imagen ?? 0)}
          detalle={t('kpi.verEnCatalogo')}
          tono={resumen?.productos_sin_imagen ? 'peligro' : 'neutro'}
          tendencia={resumen?.productos_sin_imagen ? 'baja' : undefined}
          icono={Package}
          cargando={!resumen}
          href="/app/inventario/productos?imagen=sin"
        />
        <StatCard
          etiqueta={t('kpi.publicas')}
          valor={entero(resumen?.publicas ?? 0)}
          detalle={t('kpi.publicasDetalle')}
          icono={Globe}
          cargando={!resumen}
          onClick={() => listado.actualizar({ filtros: { visibilidad: 'publicas' } })}
        />
      </KpiStrip>

      <ListToolbar
        busqueda={
          <SearchInput
            value={listado.busqueda}
            onChange={listado.setBusqueda}
            placeholder={esBiblioteca ? t('buscar') : t('buscarProductos')}
            etiqueta={t('buscar')}
            cargando={estado === 'cargando'}
          />
        }
        filtros={panelFiltros}
        chips={<FilterChips chips={chips} onQuitar={(c) => listado.setFiltro(c, null)} onLimpiarTodo={() => listado.actualizar({ filtros: esBiblioteca ? {} : { vista: 'productos' }, busqueda: '' })} />}
      />

      <section aria-label={esBiblioteca ? t('pestanas.biblioteca') : t('pestanas.productos')} aria-busy={estado === 'cargando'}>
        {estado === 'cargando' && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-hidden="true">
            {Array.from({ length: Math.min(listado.tamano, 10) }, (_, i) => (
              <li key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
                <Skeleton className="aspect-[4/3] w-full rounded-none" />
                <div className="flex flex-col gap-2 p-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {estado === 'error' && <EmptyState variante="error" titulo={t('errorCarga')} onReintentar={recargar} />}
        {vacioTotal && (
          <EmptyState
            variante="empty"
            icono={Images}
            titulo={esBiblioteca ? t('vacio.titulo') : t('vacio.tituloProductos')}
            descripcion={esBiblioteca ? t('vacio.descripcion') : t('vacio.descripcionProductos')}
            accion={esBiblioteca && permisos.crear ? { etiqueta: t('subir.boton'), onClick: () => setSubirAbierto(true), icono: Upload } : undefined}
          />
        )}
        {sinResultados && (
          <EmptyState
            variante="search"
            termino={listado.busqueda || undefined}
            onLimpiarFiltros={() => listado.actualizar({ filtros: esBiblioteca ? {} : { vista: 'productos' }, busqueda: '' })}
          />
        )}

        {estado === 'listo' && total > 0 && esBiblioteca && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {biblioteca.map((img) => {
              const medidas = img.dimensions ? `${img.dimensions.width} × ${img.dimensions.height}` : etiquetaFormato(img.mime_type, img.storage_path);
              return (
                <li key={img.id}>
                  <TarjetaImagen
                    url={img.url}
                    nombre={img.file_name}
                    alt={img.alt_text || img.file_name}
                    detalle={`${formatoTamano(img.file_size, locale)} · ${medidas}`}
                    insignia={img.is_public ? { etiqueta: t('insignias.publica'), tono: 'informacion' } : { etiqueta: t('insignias.privada'), tono: 'neutro' }}
                    pie={
                      img.productos > 0 ? (
                        <button
                          type="button"
                          onClick={() => abrirDetalle(img.id)}
                          className="font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {t('uso.enProductos', { n: img.productos })}
                        </button>
                      ) : (
                        <span className="text-link">{t('uso.sinUsar')}</span>
                      )
                    }
                    acciones={accionesBiblioteca(img)}
                    seleccionada={seleccion.has(img.id)}
                    onSeleccionChange={permisos.editar || permisos.eliminar ? (v) => alternar(img.id, v) : undefined}
                    etiquetaSeleccion={t('seleccionar', { nombre: img.file_name })}
                    onAbrir={() => abrirDetalle(img.id)}
                    etiquetaAbrir={t('abrirDetalle', { nombre: img.file_name })}
                  />
                </li>
              );
            })}
          </ul>
        )}

        {estado === 'listo' && total > 0 && !esBiblioteca && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {deProductos.map((img) => (
              <li key={img.id}>
                <TarjetaImagen
                  url={img.url}
                  nombre={img.product_name}
                  alt={img.alt_text || img.product_name}
                  detalle={[img.product_sku, nombreDeRuta(img.storage_path)].filter(Boolean).join(' · ')}
                  insignia={img.is_primary ? { etiqueta: t('insignias.principal'), tono: 'marca' } : { etiqueta: t('insignias.galeria'), tono: 'neutro' }}
                  pie={
                    <button
                      type="button"
                      onClick={() => router.push(`/app/inventario/productos/${img.product_uuid}?tab=imagenes`)}
                      className="font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {t('uso.verProducto')}
                    </button>
                  }
                  acciones={accionesDeProducto(img)}
                  onAbrir={() => router.push(`/app/inventario/productos/${img.product_uuid}?tab=imagenes`)}
                  etiquetaAbrir={t('abrirProducto', { nombre: img.product_name })}
                />
              </li>
            ))}
          </ul>
        )}

        {(estado === 'listo' || estado === 'cargando') && total > 0 && (
          <Pagination
            className="mt-4"
            pagina={listado.pagina}
            tamano={listado.tamano}
            total={total}
            onPaginaChange={listado.setPagina}
            onTamanoChange={listado.setTamano}
            sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural'), genero: 'femenino' }}
            cargando={estado === 'cargando'}
          />
        )}
      </section>

      {esBiblioteca && (
        <BulkActionBar
          seleccionados={seleccion.size}
          total={total}
          onSeleccionarTodos={() => void seleccionarTodas()}
          sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural'), genero: 'femenino' }}
          acciones={[
            ...(permisos.editar
              ? [
                  {
                    id: 'asignar',
                    etiqueta: t('acciones.asignar'),
                    icono: Package,
                    onClick: () => setAsignarA({ ids: [...seleccion], nombre: t('nImagenes', { n: seleccion.size }) }),
                  },
                  { id: 'publica', etiqueta: t('acciones.hacerPublica'), icono: Globe, onClick: () => void visibilidad([...seleccion], true) },
                  { id: 'privada', etiqueta: t('acciones.hacerPrivada'), icono: GlobeLock, onClick: () => void visibilidad([...seleccion], false) },
                ]
              : []),
            {
              id: 'descargar',
              etiqueta: t('acciones.descargar'),
              icono: Download,
              onClick: () => {
                for (const img of seleccionadas) void descargar(img.url, img.file_name);
              },
              deshabilitada: seleccionadas.length === 0,
              motivo: t('acciones.motivoDescargar'),
            },
            ...(permisos.eliminar
              ? [{ id: 'eliminar', etiqueta: t('acciones.eliminar'), icono: Trash2, destructiva: true, onClick: () => void pedirEliminar(elegidasParaEliminar()) }]
              : []),
          ]}
          onLimpiar={() => setSeleccion(new Set())}
        />
      )}

      <PanelDetalleImagen
        abierto={detalleId !== null}
        onAbiertoChange={(v) => !v && setDetalleId(null)}
        detalle={detalle}
        estado={estadoDetalle}
        onReintentar={() => detalleId && void cargarDetalle(detalleId)}
        puedeEditar={permisos.editar}
        onGuardar={guardarDetalle}
        onAsignar={() => detalle && setAsignarA({ ids: [detalle.id], nombre: detalle.file_name })}
        onDescargar={() => detalle && void descargar(detalle.url, detalle.file_name)}
      />

      <DialogoSubirImagenes
        abierto={subirAbierto}
        onAbiertoChange={setSubirAbierto}
        organizacionId={org}
        nombreOrganizacion={nombreOrg}
        onSubidas={(n) => {
          toast({ title: t('toast.subidas', { n }) });
          if (!esBiblioteca) listado.setFiltro('vista', null);
          recargar();
        }}
      />

      <DialogoAsignarProductos
        abierto={asignarA !== null}
        onAbiertoChange={(v) => !v && setAsignarA(null)}
        organizacionId={org}
        nombre={asignarA?.nombre ?? ''}
        onAsignar={asignar}
      />

      <ConfirmDialog
        open={aEliminar !== null}
        onOpenChange={(v) => !v && !procesando && setAEliminar(null)}
        title={tituloEliminar}
        description={descripcionEliminar}
        confirmLabel={t('acciones.eliminar')}
        variant="destructive"
        loading={procesando}
        onConfirm={eliminar}
      />
    </div>
  );
}
