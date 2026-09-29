'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { useOrganization } from '@/lib/hooks/useOrganization';
import categoryService, {
  ErrorCategoria,
  type CategoriaListado,
  type ConexionesCategoria,
  type ProductoDeCategoria,
} from '@/lib/services/categoryService';
import { accionesDeCategoria, mensajeErrorCategoria, segunPermisos } from './accionesCategoria';
import { usePermisosCatalogo } from './usePermisosCatalogo';
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

const PRODUCTOS_POR_PAGINA = 5;

/** Tono del origen; la etiqueta sale de `categorias.detalle.origen.*`. */
const TONO_ORIGEN: Record<ProductoDeCategoria['origen'], 'neutro' | 'informacion' | 'marca'> = {
  principal: 'neutro',
  regla: 'informacion',
  adicional: 'marca',
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
  const t = useTranslations('categorias');
  const n = useFormatoEntero();
  const localeIntl = useLocaleIntl();
  const router = useRouter();
  const permisos = usePermisosCatalogo();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? null;
  const { timezone } = useFormatDate();
  const formatDate = (valor: string | null | undefined) => formatDateInTz(valor, timezone, { locale: localeIntl });
  const mensajeError = (e: unknown) => mensajeErrorCategoria(e, t);

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
      toast({
        title: categoria.is_active ? t('toasts.desactivada') : t('toasts.activada'),
        description: t('comun.entreComillas', { nombre: categoria.name }),
      });
      await cargar(true);
    } catch (e) {
      toast({ title: t('toasts.noCambioEstado'), description: mensajeError(e), variant: 'destructive' });
    }
  };

  const duplicar = async () => {
    if (!organizationId || !categoria) return;
    try {
      const copia = await categoryService.duplicate(categoria.id, organizationId);
      toast({ title: t('toasts.duplicada'), description: t('toasts.seCreo', { nombre: copia.name }) });
      router.push(RUTAS_CATEGORIAS.detalle(copia.uuid));
    } catch (e) {
      toast({ title: t('toasts.noDuplicar'), description: mensajeError(e), variant: 'destructive' });
    }
  };

  const mover = async (padreId: number | null) => {
    if (!organizationId || !categoria) return;
    try {
      await categoryService.moverCategorias(organizationId, [categoria.id], padreId);
      const destino = padreId !== null ? todas.find((c) => c.id === padreId)?.name : null;
      toast({
        title: t('toasts.movidas', { count: 1 }),
        description: destino ? t('toasts.ahoraSubcategoria', { destino }) : t('toasts.quedoPrincipal'),
      });
      await cargar(true);
    } catch (e) {
      toast({ title: t('toasts.noMover'), description: mensajeError(e), variant: 'destructive' });
      throw e;
    }
  };

  const eliminar = async (destino: number | null) => {
    if (!organizationId || !categoria) return;
    try {
      await categoryService.eliminarCategoria(organizationId, categoria.id, destino);
      toast({ title: t('toasts.eliminada'), description: t('comun.entreComillas', { nombre: categoria.name }) });
      router.push(RUTAS_CATEGORIAS.listado);
    } catch (e) {
      toast({ title: t('toasts.noEliminar'), description: mensajeError(e), variant: 'destructive' });
      throw e;
    }
  };

  const alternarFavorita = async () => {
    if (!organizationId || !categoria || !conexiones) return;
    const nueva = !conexiones.favorita;
    try {
      await categoryService.setFavorita(organizationId, categoria.id, nueva);
      setConexiones({ ...conexiones, favorita: nueva });
      toast({ title: nueva ? t('toasts.favoritaMarcada') : t('toasts.favoritaQuitada') });
    } catch (e) {
      toast({ title: t('toasts.noFavorita'), description: mensajeError(e), variant: 'destructive' });
    }
  };

  const copiarId = async () => {
    if (!categoria) return;
    try {
      await navigator.clipboard.writeText(categoria.uuid);
      toast({ title: t('toasts.idCopiado'), description: categoria.uuid });
    } catch {
      toast({ title: t('toasts.noCopiar'), description: categoria.uuid, variant: 'destructive' });
    }
  };

  const irAProductos = () => document.getElementById('productos-de-la-categoria')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // ── Estados sin datos ────────────────────────────────────────────────────
  const migasBase = [
    { etiqueta: t('comun.inventario'), href: '/app/inventario' },
    { etiqueta: t('comun.categorias'), href: RUTAS_CATEGORIAS.listado },
  ];

  if (estado !== 'listo' || !categoria) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        <PageHeader
          titulo={t('detalle.titulo')}
          icono={Tags}
          variante="detail"
          cargando={estado === 'cargando'}
          migas={[...migasBase, { etiqueta: t('detalle.miga') }]}
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
                titulo={t('detalle.noEncontrada.titulo')}
                descripcion={t('detalle.noEncontrada.descripcion')}
                icono={Tags}
                accion={{ etiqueta: t('detalle.noEncontrada.volver'), href: RUTAS_CATEGORIAS.listado }}
              />
            )}
            {estado === 'error' && (
              <EmptyState variante="error" titulo={t('detalle.errorCarga')} onReintentar={() => void cargar()} />
            )}
            {estado === 'sinPermiso' && (
              <EmptyState
                variante="forbidden"
                titulo={t('detalle.sinPermiso')}
                accion={{ etiqueta: t('comun.volverInventario'), href: '/app/inventario' }}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Listo ────────────────────────────────────────────────────────────────
  const acciones = segunPermisos(accionesDeCategoria(categoria, {
    agregarSubcategoria: () => router.push(RUTAS_CATEGORIAS.nueva(categoria.id)),
    mover: () => setMoverAbierto(true),
    moverARaiz: () => void mover(null).catch(() => undefined),
    duplicar: () => void duplicar(),
    verProductos: () => router.push(RUTAS_CATEGORIAS.productos(categoria.id)),
    alternarActiva: () => void alternarActiva(),
    copiarId: () => void copiarId(),
    eliminar: () => setEliminarAbierto(true),
  }, t), permisos);
  const accionesMovil = [
    {
      id: 'editar',
      etiqueta: t('acciones.editar'),
      icono: Pencil,
      onSelect: () => router.push(RUTAS_CATEGORIAS.editar(categoria.uuid)),
      oculta: !permisos.editar,
    },
    ...acciones.filter((a) => a.id !== 'copiar-id'),
  ];

  const totalProductos = productos?.length ?? categoria.productos;
  const Icono = iconoCategoria(categoria.icon);
  const subtitulo = [
    `/${categoria.slug}`,
    padre ? t('detalle.subcategoriaDe', { nombre: padre.name }) : t('detalle.categoriaPrincipal'),
    categoria.is_active ? t('comun.activa') : t('comun.inactiva'),
  ].join(' · ');

  const columnasProductos: ColumnaTabla<ProductoDeCategoria>[] = [
    { id: 'producto', encabezado: t('detalle.columnas.producto'), celda: (p) => <span className="font-medium">{p.name}</span> },
    { id: 'sku', encabezado: t('detalle.columnas.sku'), variante: 'mono', ancho: 130, celda: (p) => p.sku || '—' },
    {
      id: 'origen',
      encabezado: t('detalle.columnas.origen'),
      ancho: 120,
      celda: (p) => (
        <Badge tono={TONO_ORIGEN[p.origen]} tamano="sm">
          {t(`detalle.origen.${p.origen}`)}
        </Badge>
      ),
    },
    { id: 'estado', encabezado: t('detalle.columnas.estado'), ancho: 110, celda: (p) => <StatusBadge estado={p.status ?? 'active'} /> },
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
              {t('detalle.verNProductos', { count: categoria.productos, n: n(categoria.productos) })}
            </Link>
            {permisos.editar && (
              <Link
                href={RUTAS_CATEGORIAS.editar(categoria.uuid)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.editar')}
              </Link>
            )}
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
          <FormSection titulo={t('detalle.resumen.titulo')}>
            <dl className="flex flex-col">
              <Dato etiqueta={t('detalle.resumen.padre')}>
                {padre ? (
                  <Link href={RUTAS_CATEGORIAS.detalle(padre.uuid)} className={enlaceTexto}>
                    {padre.name}
                  </Link>
                ) : (
                  t('detalle.resumen.sinPadre')
                )}
              </Dato>
              <Dato etiqueta={t('detalle.resumen.estacion')}>{etiquetaEstacion(categoria.station, t)}</Dato>
              <Dato etiqueta={t('detalle.resumen.preparacion')}>
                {categoria.requires_preparation ? t('detalle.resumen.generaComanda') : t('comun.no')}
              </Dato>
              <Dato etiqueta={t('detalle.resumen.ordenPos')}>
                {conexiones?.posicion
                  ? t('detalle.resumen.posicion', {
                      posicion: conexiones.posicion,
                      hermanas: conexiones.hermanas,
                      grupo: padre ? padre.name : t('detalle.resumen.lasPrincipales'),
                    })
                  : '—'}
                <span className="ml-2 text-xs text-fg-muted">
                  {t('detalle.resumen.ordenRank', { orden: categoria.display_order ?? 0, rank: categoria.rank ?? 0 })}
                </span>
              </Dato>
              <Dato etiqueta={t('detalle.resumen.descripcion')}>
                {categoria.description ? (
                  <div className="text-sm text-fg">
                    <HtmlContentRenderer html={categoria.description} />
                  </div>
                ) : (
                  <span className="text-fg-secondary">{t('detalle.resumen.sinDescripcion')}</span>
                )}
              </Dato>
              {categoria.meta_title && <Dato etiqueta={t('detalle.resumen.tituloSeo')}>{categoria.meta_title}</Dato>}
              {categoria.meta_description && <Dato etiqueta={t('detalle.resumen.descripcionSeo')}>{categoria.meta_description}</Dato>}
              <Dato etiqueta={t('detalle.resumen.creada')}>
                {t('detalle.resumen.fechas', {
                  creada: formatDate(categoria.created_at),
                  actualizada: formatDate(categoria.updated_at),
                })}
              </Dato>
              <Dato etiqueta={t('detalle.resumen.id')}>
                <span className="font-mono text-[13px]">{categoria.id}</span>
              </Dato>
            </dl>
          </FormSection>

          <FormSection
            titulo={t('detalle.subcategorias.titulo', { n: n(hijas.length) })}
            accion={
              <Link href={RUTAS_CATEGORIAS.nueva(categoria.id)} className={enlaceTexto}>
                {t('acciones.agregarSubcategoria')}
              </Link>
            }
          >
            {hijas.length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('detalle.subcategorias.vacio')}</p>
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
                        {t('comun.nProductos', { count: h.productos, n: n(h.productos) })}
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
              titulo={t('detalle.productos.titulo', { n: n(totalProductos) })}
              accion={
                <Link href={RUTAS_CATEGORIAS.productos(categoria.id)} className={enlaceTexto}>
                  {t('detalle.productos.verCatalogo')}
                </Link>
              }
            >
              <DataTable
                etiqueta={t('detalle.productos.tabla', { nombre: categoria.name })}
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
                    meta={t(`detalle.origen.${p.origen}`)}
                    estado={<StatusBadge estado={p.status ?? 'active'} />}
                    onClick={() => router.push(`/app/inventario/productos/${p.uuid}`)}
                  />
                )}
                vacio={{
                  titulo: t('detalle.productos.vacioTitulo'),
                  descripcion: t('detalle.productos.vacioDescripcion'),
                  icono: Package,
                  compacto: true,
                  accion: { etiqueta: t('detalle.productos.irCatalogo'), href: RUTAS_CATEGORIAS.catalogo },
                }}
                error={{ titulo: t('detalle.productos.error'), compacto: true }}
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
          <FormSection titulo={t('detalle.apariencia.titulo')}>
            <dl className="flex flex-col">
              <Dato etiqueta={t('detalle.apariencia.color')}>
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-4 shrink-0 rounded border border-line"
                    style={{ backgroundColor: categoria.color || undefined }}
                  />
                  <span className="font-mono text-[13px]">{categoria.color || t('detalle.apariencia.sinColor')}</span>
                </span>
              </Dato>
              <Dato etiqueta={t('detalle.apariencia.icono')}>
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
                  {categoria.icon || t('detalle.apariencia.sinIcono')}
                </span>
              </Dato>
              <Dato etiqueta={t('detalle.apariencia.imagen')}>
                {categoria.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL de Storage de la organización
                  <img
                    src={categoria.image_url}
                    alt={t('detalle.apariencia.imagenDe', { nombre: categoria.name })}
                    className="h-28 w-full max-w-[220px] rounded-lg border border-line object-cover"
                  />
                ) : (
                  <span className="text-fg-secondary">{t('detalle.apariencia.sinImagen')}</span>
                )}
              </Dato>
            </dl>
          </FormSection>

          <FormSection titulo={t('detalle.conexiones.titulo')}>
            <div className="flex flex-col gap-3">
              <RelatedLinkCard
                icono={Package}
                etiqueta={t('detalle.conexiones.productos')}
                valor={n(conexiones?.productos ?? categoria.productos)}
                href={RUTAS_CATEGORIAS.productos(categoria.id)}
              />
              <RelatedLinkCard
                icono={Wand2}
                etiqueta={t('detalle.conexiones.porReglas')}
                valor={n(conexiones?.por_regla ?? 0)}
                onClick={irAProductos}
              />
              <RelatedLinkCard
                icono={TicketPercent}
                etiqueta={t('detalle.conexiones.promociones')}
                valor={n(conexiones?.promociones ?? 0)}
                href={RUTAS_CATEGORIAS.promociones}
              />
              <RelatedLinkCard
                icono={Globe}
                etiqueta={t('detalle.conexiones.tiendaWeb')}
                valor={n((conexiones?.paginas_web ?? 0) + (conexiones?.menus_web ?? 0))}
                href={RUTAS_CATEGORIAS.tiendaWeb}
              />
              <RelatedLinkCard
                icono={Star}
                etiqueta={t('detalle.conexiones.favorita')}
                valor={conexiones ? (conexiones.favorita ? t('comun.si') : t('comun.no')) : '—'}
                accion={conexiones?.favorita ? t('detalle.conexiones.quitar') : t('detalle.conexiones.marcar')}
                onClick={conexiones ? () => void alternarFavorita() : undefined}
              />
              {(conexiones?.paginas_web ?? 0) + (conexiones?.menus_web ?? 0) > 0 || categoria.is_active ? (
                <p className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-[13px] leading-[18px] text-warning-text">
                  <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.5} />
                  {t('detalle.conexiones.avisoSlug', { slug: categoria.slug })}
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
