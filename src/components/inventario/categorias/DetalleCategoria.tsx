'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Globe, Package, Pencil, Star, Tags, TicketPercent, TriangleAlert, Wand2 } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  FormSection,
  ListCard,
  PageHeader,
  PaginationCompact,
  RowActionsMenu,
  StatusBadge,
  type ColumnaTabla,
} from '@/components/kit';
import { RelatedLinkCard } from '@/components/kit/RelatedLinkCard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOrganization } from '@/lib/hooks/useOrganization';
import categoryService, {
  ErrorCategoria,
  type CategoriaListado,
  type ConexionesCategoria,
  type ProductoDeCategoria,
} from '@/lib/services/categoryService';
import { accionesDeCategoria } from './accionesCategoria';
import CategoryRulesCard from './CategoryRulesCard';
import { EliminarCategoriaDialog } from './EliminarCategoriaDialog';
import { MoverCategoriaDialog } from './MoverCategoriaDialog';
import { etiquetaEstacion, iconoCategoria, RUTAS_CATEGORIAS } from './iconoCategoria';

/**
 * Detalle de categoría (Figma `586:302540`): resumen, subcategorías,
 * productos con su origen (principal · por regla · adicional), reglas con
 * retroalimentación, apariencia y «Cómo se conecta» con conteos reales.
 */
type EstadoDetalle = 'cargando' | 'listo' | 'noEncontrada' | 'error' | 'sinPermiso';

const NUM = new Intl.NumberFormat('es-CO');
const n = (v: number) => NUM.format(v);
const plural = (v: number, uno: string, varios: string) => `${n(v)} ${v === 1 ? uno : varios}`;
const PRODUCTOS_POR_PAGINA = 5;

const ORIGEN: Record<ProductoDeCategoria['origen'], { etiqueta: string; tono: 'neutro' | 'informacion' | 'marca' }> = {
  principal: { etiqueta: 'Principal', tono: 'neutro' },
  regla: { etiqueta: 'Por regla', tono: 'informacion' },
  adicional: { etiqueta: 'Adicional', tono: 'marca' },
};

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 py-1.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-fg-secondary">{etiqueta}</dt>
      <dd className="min-w-0 text-sm text-fg">{children}</dd>
    </div>
  );
}

export function DetalleCategoria({ uuid }: { uuid: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? null;
  const { formatDate } = useFormatDate();

  const [estado, setEstado] = useState<EstadoDetalle>('cargando');
  const [todas, setTodas] = useState<CategoriaListado[]>([]);
  const [categoria, setCategoria] = useState<CategoriaListado | null>(null);
  const [conexiones, setConexiones] = useState<ConexionesCategoria | null>(null);
  const [productos, setProductos] = useState<ProductoDeCategoria[] | null>(null);
  const [errorProductos, setErrorProductos] = useState(false);
  const [paginaProductos, setPaginaProductos] = useState(1);
  const [moverAbierto, setMoverAbierto] = useState(false);
  const [eliminarAbierto, setEliminarAbierto] = useState(false);

  const cargarProductos = useCallback(async (orgId: number, id: number) => {
    setErrorProductos(false);
    try {
      setProductos(await categoryService.getProductosDeCategoria(orgId, id));
    } catch {
      setErrorProductos(true);
      setProductos([]);
    }
  }, []);

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!organizationId) return;
      if (!silencioso) setEstado('cargando');
      try {
        const listado = await categoryService.getListado(organizationId);
        const cat = listado.categorias.find((c) => c.uuid === uuid) ?? null;
        setTodas(listado.categorias);
        setCategoria(cat);
        if (!cat) {
          setEstado('noEncontrada');
          return;
        }
        setEstado('listo');
        const [con] = await Promise.all([
          categoryService.getConexiones(organizationId, cat.id).catch(() => null),
          cargarProductos(organizationId, cat.id),
        ]);
        setConexiones(con);
      } catch (e) {
        setEstado(e instanceof ErrorCategoria && e.sinPermiso ? 'sinPermiso' : 'error');
      }
    },
    [organizationId, uuid, cargarProductos],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const padre = useMemo(
    () => (categoria?.parent_id ? todas.find((c) => c.id === categoria.parent_id) ?? null : null),
    [categoria, todas],
  );
  const hijas = useMemo(
    () =>
      categoria
        ? todas
            .filter((c) => c.parent_id === categoria.id)
            .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name, 'es'))
        : [],
    [categoria, todas],
  );
  const categoriasMovibles = useMemo(() => todas.map((c) => ({ ...c })), [todas]);

  // ── Acciones ─────────────────────────────────────────────────────────────
  const alternarActiva = async () => {
    if (!organizationId || !categoria) return;
    try {
      await categoryService.setActivas(organizationId, [categoria.id], !categoria.is_active);
      toast({ title: categoria.is_active ? 'Categoría desactivada' : 'Categoría activada', description: `«${categoria.name}»` });
      await cargar(true);
    } catch (e) {
      toast({ title: 'No se pudo cambiar el estado', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const duplicar = async () => {
    if (!organizationId || !categoria) return;
    try {
      const copia = await categoryService.duplicate(categoria.id, organizationId);
      toast({ title: 'Categoría duplicada', description: `Se creó «${copia.name}».` });
      router.push(RUTAS_CATEGORIAS.detalle(copia.uuid));
    } catch (e) {
      toast({ title: 'No se pudo duplicar', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const mover = async (padreId: number | null) => {
    if (!organizationId || !categoria) return;
    try {
      await categoryService.moverCategorias(organizationId, [categoria.id], padreId);
      const destino = padreId !== null ? todas.find((c) => c.id === padreId)?.name : null;
      toast({
        title: 'Categoría movida',
        description: destino ? `Ahora es subcategoría de «${destino}».` : 'Quedó como categoría principal.',
      });
      await cargar(true);
    } catch (e) {
      toast({ title: 'No se pudo mover', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
      throw e;
    }
  };

  const eliminar = async (destino: number | null) => {
    if (!organizationId || !categoria) return;
    try {
      await categoryService.eliminarCategoria(organizationId, categoria.id, destino);
      toast({ title: 'Categoría eliminada', description: `«${categoria.name}»` });
      router.push(RUTAS_CATEGORIAS.listado);
    } catch (e) {
      toast({ title: 'No se pudo eliminar', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
      throw e;
    }
  };

  const alternarFavorita = async () => {
    if (!organizationId || !categoria || !conexiones) return;
    const nueva = !conexiones.favorita;
    try {
      await categoryService.setFavorita(organizationId, categoria.id, nueva);
      setConexiones({ ...conexiones, favorita: nueva });
      toast({ title: nueva ? 'Marcada como favorita del POS' : 'Ya no es favorita del POS' });
    } catch (e) {
      toast({ title: 'No se pudo cambiar la favorita', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const copiarId = async () => {
    if (!categoria) return;
    try {
      await navigator.clipboard.writeText(categoria.uuid);
      toast({ title: 'ID copiado', description: categoria.uuid });
    } catch {
      toast({ title: 'No se pudo copiar', description: categoria.uuid, variant: 'destructive' });
    }
  };

  const irAProductos = () => document.getElementById('productos-de-la-categoria')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // ── Estados sin datos ────────────────────────────────────────────────────
  const migasBase = [
    { etiqueta: 'Inventario', href: '/app/inventario' },
    { etiqueta: 'Categorías', href: RUTAS_CATEGORIAS.listado },
  ];

  if (estado !== 'listo' || !categoria) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        <PageHeader
          titulo="Categoría"
          icono={Tags}
          variante="detail"
          cargando={estado === 'cargando'}
          migas={[...migasBase, { etiqueta: 'Detalle' }]}
        />
        {estado === 'cargando' ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col gap-4">
              <Skeleton className="h-56 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
              <Skeleton className="h-72 rounded-xl" />
            </div>
            <div className="flex flex-col gap-4">
              <Skeleton className="h-44 rounded-xl" />
              <Skeleton className="h-96 rounded-xl" />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-surface">
            {estado === 'noEncontrada' && (
              <EmptyState
                titulo="No encontramos esta categoría"
                descripcion="Puede que la hayan eliminado o que el enlace sea de otra organización."
                icono={Tags}
                accion={{ etiqueta: 'Volver a categorías', href: RUTAS_CATEGORIAS.listado }}
              />
            )}
            {estado === 'error' && (
              <EmptyState variante="error" titulo="No pudimos cargar la categoría" onReintentar={() => void cargar()} />
            )}
            {estado === 'sinPermiso' && (
              <EmptyState
                variante="forbidden"
                titulo="No tienes acceso a esta categoría"
                accion={{ etiqueta: 'Volver al inventario', href: '/app/inventario' }}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Listo ────────────────────────────────────────────────────────────────
  const acciones = accionesDeCategoria(categoria, {
    agregarSubcategoria: () => router.push(RUTAS_CATEGORIAS.nueva(categoria.id)),
    mover: () => setMoverAbierto(true),
    moverARaiz: () => void mover(null).catch(() => undefined),
    duplicar: () => void duplicar(),
    verProductos: () => router.push(RUTAS_CATEGORIAS.productos(categoria.id)),
    alternarActiva: () => void alternarActiva(),
    copiarId: () => void copiarId(),
    eliminar: () => setEliminarAbierto(true),
  });
  const accionesMovil = [
    { id: 'editar', etiqueta: 'Editar', icono: Pencil, onSelect: () => router.push(RUTAS_CATEGORIAS.editar(categoria.uuid)) },
    ...acciones.filter((a) => a.id !== 'copiar-id'),
  ];

  const totalProductos = productos?.length ?? categoria.productos;
  const Icono = iconoCategoria(categoria.icon);
  const subtitulo = [
    `/${categoria.slug}`,
    padre ? `subcategoría de ${padre.name}` : 'categoría principal',
    categoria.is_active ? 'Activa' : 'Inactiva',
  ].join(' · ');

  const columnasProductos: ColumnaTabla<ProductoDeCategoria>[] = [
    { id: 'producto', encabezado: 'Producto', celda: (p) => <span className="font-medium">{p.name}</span> },
    { id: 'sku', encabezado: 'SKU', variante: 'mono', ancho: 130, celda: (p) => p.sku || '—' },
    {
      id: 'origen',
      encabezado: 'Origen',
      ancho: 120,
      celda: (p) => (
        <Badge tono={ORIGEN[p.origen].tono} tamano="sm">
          {ORIGEN[p.origen].etiqueta}
        </Badge>
      ),
    },
    { id: 'estado', encabezado: 'Estado', ancho: 110, celda: (p) => <StatusBadge estado={p.status ?? 'active'} /> },
  ];
  const paginaVisible = (productos ?? []).slice(
    (paginaProductos - 1) * PRODUCTOS_POR_PAGINA,
    paginaProductos * PRODUCTOS_POR_PAGINA,
  );

  const enlaceTexto =
    'rounded-md text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo={categoria.name}
        subtitulo={subtitulo}
        icono={Icono}
        variante="detail"
        badge={<StatusBadge estado={categoria.is_active ? 'activa' : 'inactiva'} tamano="md" />}
        migas={[...migasBase, { etiqueta: categoria.name }]}
        acciones={
          <>
            <Link
              href={RUTAS_CATEGORIAS.productos(categoria.id)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Package aria-hidden="true" className="size-4" strokeWidth={1.5} />
              Ver {plural(categoria.productos, 'producto', 'productos')}
            </Link>
            <Link
              href={RUTAS_CATEGORIAS.editar(categoria.uuid)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
              Editar
            </Link>
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={categoria.name} acciones={acciones} />
          </>
        }
        movil={{
          subtitulo: `/${categoria.slug}`,
          accion: <RowActionsMenu orientacion="horizontal" titulo={categoria.name} acciones={accionesMovil} />,
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <FormSection titulo="Resumen">
            <dl className="flex flex-col">
              <Dato etiqueta="Categoría padre">
                {padre ? (
                  <Link href={RUTAS_CATEGORIAS.detalle(padre.uuid)} className={enlaceTexto}>
                    {padre.name}
                  </Link>
                ) : (
                  'Ninguna · es una categoría principal'
                )}
              </Dato>
              <Dato etiqueta="Estación de cocina">{etiquetaEstacion(categoria.station)}</Dato>
              <Dato etiqueta="Requiere preparación">
                {categoria.requires_preparation ? 'Sí · genera comanda en el POS' : 'No'}
              </Dato>
              <Dato etiqueta="Orden en el POS">
                {conexiones?.posicion
                  ? `${conexiones.posicion} de ${conexiones.hermanas} en ${padre ? padre.name : 'las categorías principales'}`
                  : '—'}
                <span className="ml-2 text-xs text-fg-muted">
                  orden {categoria.display_order ?? 0} · rank {categoria.rank ?? 0}
                </span>
              </Dato>
              <Dato etiqueta="Descripción">
                {categoria.description ? (
                  <div className="text-sm text-fg">
                    <HtmlContentRenderer html={categoria.description} />
                  </div>
                ) : (
                  <span className="text-fg-secondary">Sin descripción</span>
                )}
              </Dato>
              {categoria.meta_title && <Dato etiqueta="Título SEO">{categoria.meta_title}</Dato>}
              {categoria.meta_description && <Dato etiqueta="Descripción SEO">{categoria.meta_description}</Dato>}
              <Dato etiqueta="Creada">
                {formatDate(categoria.created_at)} · actualizada {formatDate(categoria.updated_at)}
              </Dato>
              <Dato etiqueta="ID">
                <span className="font-mono text-[13px]">{categoria.id}</span>
              </Dato>
            </dl>
          </FormSection>

          <FormSection
            titulo={`Subcategorías (${hijas.length})`}
            accion={
              <Link href={RUTAS_CATEGORIAS.nueva(categoria.id)} className={enlaceTexto}>
                Agregar subcategoría
              </Link>
            }
          >
            {hijas.length === 0 ? (
              <p className="text-sm text-fg-secondary">No tiene subcategorías.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {hijas.map((h) => {
                  const IconoHija = iconoCategoria(h.icon);
                  return (
                    <li key={h.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <IconoHija aria-hidden="true" className="size-4 shrink-0 text-brand" strokeWidth={1.5} />
                      <Link href={RUTAS_CATEGORIAS.detalle(h.uuid)} className={`min-w-0 flex-1 truncate ${enlaceTexto}`}>
                        {h.name}
                      </Link>
                      <span className="shrink-0 text-[13px] text-fg-secondary tabular-nums">
                        {plural(h.productos, 'producto', 'productos')}
                      </span>
                      <StatusBadge estado={h.is_active ? 'activa' : 'inactiva'} />
                    </li>
                  );
                })}
              </ul>
            )}
          </FormSection>

          <div id="productos-de-la-categoria" className="scroll-mt-20">
            <FormSection
              titulo={`Productos (${n(totalProductos)})`}
              accion={
                <Link href={RUTAS_CATEGORIAS.productos(categoria.id)} className={enlaceTexto}>
                  Ver en el catálogo
                </Link>
              }
            >
              <DataTable
                etiqueta={`Productos de ${categoria.name}`}
                columnas={columnasProductos}
                filas={paginaVisible}
                obtenerId={(p) => String(p.id)}
                estado={productos === null ? 'cargando' : errorProductos ? 'error' : 'listo'}
                densidad="compacta"
                filasEsqueleto={PRODUCTOS_POR_PAGINA}
                onFilaClick={(p) => router.push(`/app/inventario/productos/${p.uuid}`)}
                etiquetaFila={(p) => p.name}
                virtualizar={false}
                tarjetaMovil={(p) => (
                  <ListCard
                    icono={Package}
                    titulo={p.name}
                    subtitulo={p.sku || undefined}
                    meta={ORIGEN[p.origen].etiqueta}
                    estado={<StatusBadge estado={p.status ?? 'active'} />}
                    onClick={() => router.push(`/app/inventario/productos/${p.uuid}`)}
                  />
                )}
                vacio={{
                  titulo: 'Esta categoría no tiene productos',
                  descripcion: 'Asígnala desde el catálogo o con una regla de asignación automática.',
                  icono: Package,
                  compacto: true,
                  accion: { etiqueta: 'Ir al catálogo', href: RUTAS_CATEGORIAS.catalogo },
                }}
                error={{ titulo: 'No pudimos cargar los productos', compacto: true }}
                onReintentar={() => organizationId && void cargarProductos(organizationId, categoria.id)}
                pie={
                  (productos?.length ?? 0) > PRODUCTOS_POR_PAGINA ? (
                    <PaginationCompact
                      pagina={paginaProductos}
                      tamano={PRODUCTOS_POR_PAGINA}
                      total={productos?.length ?? 0}
                      onPaginaChange={setPaginaProductos}
                    />
                  ) : undefined
                }
              />
            </FormSection>
          </div>

          {organizationId && (
            <CategoryRulesCard
              categoryId={categoria.id}
              categoryName={categoria.name}
              organizationId={organizationId}
              onProductsAssigned={() => void cargar(true)}
              onVerProductos={irAProductos}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <FormSection titulo="Apariencia">
            <dl className="flex flex-col">
              <Dato etiqueta="Color">
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-4 shrink-0 rounded border border-line"
                    style={{ backgroundColor: categoria.color || undefined }}
                  />
                  <span className="font-mono text-[13px]">{categoria.color || 'Sin color'}</span>
                </span>
              </Dato>
              <Dato etiqueta="Icono">
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="flex size-7 items-center justify-center rounded-lg"
                    style={
                      categoria.color
                        ? { backgroundColor: `color-mix(in srgb, ${categoria.color} 14%, transparent)`, color: categoria.color }
                        : undefined
                    }
                  >
                    <Icono className="size-4" strokeWidth={1.5} />
                  </span>
                  {categoria.icon || 'Sin icono'}
                </span>
              </Dato>
              <Dato etiqueta="Imagen">
                {categoria.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL de Storage de la organización
                  <img
                    src={categoria.image_url}
                    alt={`Imagen de ${categoria.name}`}
                    className="h-28 w-full max-w-[220px] rounded-lg border border-line object-cover"
                  />
                ) : (
                  <span className="text-fg-secondary">Sin imagen</span>
                )}
              </Dato>
            </dl>
          </FormSection>

          <FormSection titulo="Cómo se conecta">
            <div className="flex flex-col gap-3">
              <RelatedLinkCard
                icono={Package}
                etiqueta="Productos en la categoría"
                valor={n(conexiones?.productos ?? categoria.productos)}
                href={RUTAS_CATEGORIAS.productos(categoria.id)}
              />
              <RelatedLinkCard
                icono={Wand2}
                etiqueta="Asignados por reglas"
                valor={n(conexiones?.por_regla ?? 0)}
                onClick={irAProductos}
              />
              <RelatedLinkCard
                icono={TicketPercent}
                etiqueta="Promociones que la usan"
                valor={n(conexiones?.promociones ?? 0)}
                href={RUTAS_CATEGORIAS.promociones}
              />
              <RelatedLinkCard
                icono={Globe}
                etiqueta="Página y menú de la tienda web"
                valor={n((conexiones?.paginas_web ?? 0) + (conexiones?.menus_web ?? 0))}
                href={RUTAS_CATEGORIAS.tiendaWeb}
              />
              <RelatedLinkCard
                icono={Star}
                etiqueta="Favorita en el POS"
                valor={conexiones ? (conexiones.favorita ? 'Sí' : 'No') : '—'}
                accion={conexiones?.favorita ? 'Quitar' : 'Marcar'}
                onClick={conexiones ? () => void alternarFavorita() : undefined}
              />
              {(conexiones?.paginas_web ?? 0) + (conexiones?.menus_web ?? 0) > 0 || categoria.is_active ? (
                <p className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-[13px] leading-[18px] text-warning-text">
                  <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.5} />
                  Cambiar el slug rompe los enlaces de la tienda web que apuntan a /{categoria.slug}.
                </p>
              ) : null}
            </div>
          </FormSection>

        </div>
      </div>

      <MoverCategoriaDialog
        abierto={moverAbierto}
        onAbiertoChange={setMoverAbierto}
        categorias={categoriasMovibles}
        ids={[categoria.id]}
        onMover={mover}
      />
      <EliminarCategoriaDialog
        abierto={eliminarAbierto}
        onAbiertoChange={setEliminarAbierto}
        categoria={categoria}
        categorias={categoriasMovibles}
        onEliminar={eliminar}
      />
    </div>
  );
}
