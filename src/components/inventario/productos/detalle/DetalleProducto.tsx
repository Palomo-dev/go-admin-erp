'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  ArrowLeftRight,
  Barcode,
  Boxes,
  Copy,
  Package,
  Pencil,
  Power,
  Printer,
  Ban,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import {
  EmptyState,
  PageHeader,
  RowActionsMenu,
  StatusBadge,
  TabBar,
  idPanel,
  idPestana,
  type AccionFila,
  type PestanaTab,
} from '@/components/kit';
import { Dialogo } from '@/components/kit/Dialogo';
import { Button } from '@/components/ui/button';
import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { loadProductImages, getPublicUrl, type ProductImageType } from '@/lib/supabase/imageUtils';
import { avisarCambioCatalogo } from '@/lib/services/website/avisarCambioCatalogo';
import { productoService } from '@/lib/services/productoService';
import { ImprimirEtiquetasDialog } from '../etiquetas/ImprimirEtiquetasDialog';
import { GenerarCodigosDialog } from '../etiquetas/GenerarCodigosDialog';
import { ProveedorContextoProducto, useMensajeErrorProducto, useProductoDetalle } from './ContextoProducto';
import { cargarProductoDetalle } from './cargarProducto';
import { KpisProducto } from './KpisProducto';
import { CabeceraMovilProducto } from './CabeceraProducto';
import {
  esPestana,
  subPestanaValida,
  type PestanaDetalle,
  type ProductoDetalle,
} from './tipos';
import { ResumenProducto } from './resumen/ResumenProducto';
import { StockSucursales } from './inventario/StockSucursales';
import { LotesProducto } from './inventario/LotesProducto';
import { KardexProducto } from './inventario/KardexProducto';
import { SerialesProducto } from './inventario/SerialesProducto';
import { PreciosCostos } from './precios/PreciosCostos';
import { VariantesProducto } from './variantes/VariantesProducto';
import { ModificadoresProducto } from './variantes/ModificadoresProducto';
import { ImagenesProducto } from './imagenes/ImagenesProducto';
import { ProveedoresProducto } from './proveedores/ProveedoresProducto';
import { EtiquetasProducto } from './proveedores/EtiquetasProducto';
import { NotasProducto } from './notas/NotasProducto';
import { HistorialProducto } from './historial/HistorialProducto';
import { PestanaProduccion, debeMostrarPestanaProduccion } from './produccion';

const RUTA_CATALOGO = '/app/inventario/productos';
const ID_TABS = 'producto';

/**
 * Detalle de producto (Figma `04 Inventario › Producto — Cabecera` y
 * secciones). Carga el producto por uuid dentro de la organización de la
 * sesión y reparte el resto en pestañas que cargan lo suyo.
 */
export function DetalleProducto({ uuid }: { uuid: string }) {
  const t = useTranslations('productoDetalle');
  const { organization, isLoading: cargandoOrg } = useOrganization();
  const orgId = organization?.id ?? null;
  const [producto, setProducto] = useState<ProductoDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mensajeError = useMensajeErrorProducto();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab');
  const tab: PestanaDetalle = esPestana(tabParam) ? tabParam : 'resumen';
  const sub = subPestanaValida(tab, searchParams?.get('sub'));

  const irA = useCallback(
    (nueva: PestanaDetalle, nuevaSub?: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (nueva === 'resumen') params.delete('tab');
      else params.set('tab', nueva);
      const s = subPestanaValida(nueva, nuevaSub);
      if (s && s !== subPestanaValida(nueva, null)) params.set('sub', s);
      else params.delete('sub');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname ?? RUTA_CATALOGO), { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const recargarProducto = useCallback(async () => {
    if (!orgId) return;
    try {
      const p = await cargarProductoDetalle(orgId, uuid);
      if (!p) {
        setError(t('carga.noEncontrado'));
        setProducto(null);
      } else {
        setProducto(p);
        setError(null);
      }
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  }, [orgId, uuid, t, mensajeError]);

  useEffect(() => {
    setCargando(true);
    void recargarProducto();
  }, [recargarProducto]);

  if (cargando || cargandoOrg) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <PageHeaderSkeleton />
        <DetailSkeleton />
      </div>
    );
  }

  if (error || !producto || !orgId) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          variante="error"
          titulo={t('carga.errorTitulo')}
          descripcion={error ?? t('carga.noEncontrado')}
          accion={{ etiqueta: t('carga.volver'), href: RUTA_CATALOGO, icono: ArrowLeft }}
          onReintentar={() => {
            setCargando(true);
            void recargarProducto();
          }}
        />
      </div>
    );
  }

  return (
    <ProveedorContextoProducto producto={producto} organizacionId={orgId} recargarProducto={recargarProducto} irA={irA}>
      <ContenidoDetalle tab={tab} sub={sub} />
    </ProveedorContextoProducto>
  );
}

function ContenidoDetalle({ tab, sub }: { tab: PestanaDetalle; sub: string | null }) {
  const t = useTranslations('productoDetalle');
  const router = useRouter();
  const { toast } = useToast();
  const { producto, organizacionId, resumen, permisos, recargar, irA, mensajeError } = useProductoDetalle();
  // «Transferir» lleva el producto y, si hay una sucursal elegida en la cabecera, el origen (B3 lee ambos).
  const { selectedBranchId } = useBranch();
  const [imagenes, setImagenes] = useState<ProductImageType[]>([]);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [dialogoEtiquetas, setDialogoEtiquetas] = useState(false);
  const [dialogoCodigos, setDialogoCodigos] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const eliminado = producto.status === 'deleted';
  const esServicio = producto.product_type === 'service';
  const rastrea = producto.track_stock !== false && !esServicio;
  const conteos = resumen?.conteos;
  const productoIds = useMemo(() => [producto.id], [producto.id]);

  useEffect(() => {
    let vivo = true;
    loadProductImages(producto.id)
      .then((imgs) => {
        if (vivo) setImagenes(imgs);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [producto.id, conteos?.imagenes, producto.updated_at]);

  const principal = imagenes.find((i) => i.is_primary) ?? imagenes[0];
  const urlPrincipal = principal ? getPublicUrl(principal.storage_path) : null;

  const cambiarEstado = async (estado: 'active' | 'inactive' | 'discontinued' | 'deleted') => {
    setOcupado(true);
    try {
      await productoService.cambiarEstado(organizacionId, producto.id, estado);
      avisarCambioCatalogo();
      if (estado === 'deleted') {
        toast({ title: t('toasts.eliminado'), description: t('toasts.eliminadoDetalle') });
        router.push(RUTA_CATALOGO);
        return;
      }
      toast({ title: t('toasts.estadoActualizado'), description: t('toasts.estadoDetalle', { estado: t(`estado.${estado}`) }) });
      await recargar();
    } catch (e) {
      toast({ variant: 'destructive', title: estado === 'deleted' ? t('toasts.errorEliminar') : t('toasts.errorEstado'), description: mensajeError(e) });
    } finally {
      setOcupado(false);
      setConfirmarEliminar(false);
    }
  };

  const motivoEdicion = eliminado ? t('acciones.motivoEliminado') : !permisos.editar && resumen ? t('acciones.motivoSinPermiso') : undefined;
  const rutaProducto = `${RUTA_CATALOGO}/${producto.uuid}`;

  const masAcciones: AccionFila[] = [
    { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => router.push(`${rutaProducto}/duplicar`),
      deshabilitada: !!resumen && !permisos.crear, motivo: t('acciones.motivoSinPermiso') },
    { id: 'transferir', etiqueta: t('acciones.transferir'), icono: ArrowLeftRight,
      onSelect: () =>
        router.push(
          `/app/inventario/transferencias/nuevo?producto_id=${producto.id}${selectedBranchId ? `&origen=${selectedBranchId}` : ''}`,
        ),
      deshabilitada: !rastrea || eliminado, motivo: eliminado ? t('acciones.motivoEliminado') : t('acciones.motivoSinInventario') },
    { id: 'imprimir', etiqueta: t('acciones.imprimirEtiqueta'), icono: Printer, onSelect: () => setDialogoEtiquetas(true) },
    { id: 'codigos', etiqueta: t('acciones.codigosBarras'), icono: Barcode, onSelect: () => setDialogoCodigos(true),
      deshabilitada: !!resumen && !permisos.editar, motivo: t('acciones.motivoSinPermiso') },
    producto.status === 'active'
      ? { id: 'desactivar', etiqueta: t('acciones.desactivar'), icono: Power, onSelect: () => void cambiarEstado('inactive'),
          deshabilitada: !!motivoEdicion || ocupado, motivo: motivoEdicion }
      : { id: 'activar', etiqueta: t('acciones.activar'), icono: Power, onSelect: () => void cambiarEstado('active'),
          deshabilitada: !!resumen && !permisos.editar, motivo: t('acciones.motivoSinPermiso') },
    { id: 'descontinuar', etiqueta: t('acciones.descontinuar'), icono: Ban, onSelect: () => void cambiarEstado('discontinued'),
      oculta: producto.status === 'discontinued' || eliminado, deshabilitada: !!motivoEdicion || ocupado, motivo: motivoEdicion },
    { id: 'eliminar', etiqueta: t('acciones.eliminar'), icono: Trash2, destructiva: true, onSelect: () => setConfirmarEliminar(true),
      deshabilitada: eliminado || (!!resumen && !permisos.eliminar), motivo: eliminado ? t('acciones.motivoEliminado') : t('acciones.motivoSinPermiso') },
  ];

  const pestanas: PestanaTab<PestanaDetalle>[] = [
    { valor: 'resumen', etiqueta: t('pestanas.resumen') },
    { valor: 'inventario', etiqueta: t('pestanas.inventario') },
    { valor: 'precios', etiqueta: t('pestanas.precios') },
    { valor: 'variantes', etiqueta: t('pestanas.variantes'), contador: conteos ? conteos.variantes + conteos.modificadores : undefined },
    // Producción (B5): compuesto, preparación o producto que ya se abrió en esa pestaña (enlace directo).
    ...(debeMostrarPestanaProduccion(producto) || tab === 'produccion'
      ? [{ valor: 'produccion' as const, etiqueta: t('pestanas.produccion') }]
      : []),
    { valor: 'imagenes', etiqueta: t('pestanas.imagenes'), contador: conteos?.imagenes },
    { valor: 'proveedores', etiqueta: t('pestanas.proveedores'), contador: conteos ? conteos.proveedores + conteos.etiquetas : undefined },
    { valor: 'notas', etiqueta: t('pestanas.notas'), contador: conteos?.notas },
    { valor: 'historial', etiqueta: t('pestanas.historial') },
  ];

  const subPestanas: Partial<Record<PestanaDetalle, PestanaTab<string>[]>> = {
    inventario: [
      { valor: 'stock', etiqueta: t('pestanas.sub.stock') },
      { valor: 'lotes', etiqueta: t('pestanas.sub.lotes'), contador: conteos?.lotes },
      { valor: 'kardex', etiqueta: t('pestanas.sub.kardex'), contador: conteos?.movimientos },
      { valor: 'seriales', etiqueta: t('pestanas.sub.seriales'), contador: conteos?.seriales },
    ],
    variantes: [
      { valor: 'variantes', etiqueta: t('pestanas.sub.variantes'), contador: conteos?.variantes },
      { valor: 'modificadores', etiqueta: t('pestanas.sub.modificadores'), contador: conteos?.modificadores },
    ],
    proveedores: [
      { valor: 'proveedores', etiqueta: t('pestanas.sub.proveedores'), contador: conteos?.proveedores },
      { valor: 'etiquetas', etiqueta: t('pestanas.sub.etiquetas'), contador: conteos?.etiquetas },
    ],
  };

  const meta = [
    `${t('meta.sku')} ${producto.sku}`,
    producto.categories?.name ?? t('meta.sinCategoria'),
    producto.unit_code,
    esServicio ? t('meta.servicio') : t('meta.producto'),
    producto.brand,
    producto.reference ? `${t('meta.referencia')} ${producto.reference}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const accionesCabecera = (
    <>
      {rastrea && (
        <Button
          variant="outline"
          onClick={() => router.push(`/app/inventario/ajustes/nuevo?producto_id=${producto.id}`)}
          disabled={eliminado || (!!resumen && !permisos.ajustar)}
          title={eliminado ? t('acciones.motivoEliminado') : !!resumen && !permisos.ajustar ? t('acciones.motivoSinPermiso') : undefined}
        >
          <Boxes className="h-4 w-4" aria-hidden /> {t('acciones.ajustarStock')}
        </Button>
      )}
      <Button asChild={!motivoEdicion} disabled={!!motivoEdicion} title={motivoEdicion}>
        {motivoEdicion ? (
          <span>
            <Pencil className="h-4 w-4" aria-hidden /> {t('acciones.editar')}
          </span>
        ) : (
          <Link href={`${rutaProducto}/editar`}>
            <Pencil className="h-4 w-4" aria-hidden /> {t('acciones.editar')}
          </Link>
        )}
      </Button>
      <RowActionsMenu orientacion="horizontal" tamano="md" titulo={producto.name} acciones={masAcciones} />
    </>
  );

  const miniatura = urlPrincipal ? (
    // eslint-disable-next-line @next/next/no-img-element -- miniatura de 48 px desde storage público
    <img src={urlPrincipal} alt="" className="size-12 rounded-lg border border-line object-cover" />
  ) : (
    <div className="flex size-12 items-center justify-center rounded-lg border border-line bg-subtle text-fg-muted">
      <Package className="size-5" aria-hidden />
    </div>
  );

  const subActual = sub ?? undefined;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        variante="detail"
        titulo={producto.name}
        subtitulo={meta}
        migas={[
          { etiqueta: t('migas.inventario'), href: '/app/inventario' },
          { etiqueta: t('migas.productos'), href: RUTA_CATALOGO },
          { etiqueta: producto.name },
        ]}
        badge={<StatusBadge estado={producto.status} etiqueta={t(`estado.${estadoConocido(producto.status)}`)} />}
        miniatura={miniatura}
        acciones={accionesCabecera}
        movil={{
          titulo: producto.name,
          subtitulo: `${producto.sku} · ${t(`estado.${estadoConocido(producto.status)}`)}`,
          accion: <RowActionsMenu orientacion="vertical" tamano="md" titulo={producto.name} acciones={masAcciones} />,
        }}
      />

      <CabeceraMovilProducto imagenes={imagenes} acciones={accionesCabecera} />

      <KpisProducto />

      <TabBar id={ID_TABS} etiqueta={t('pestanas.etiqueta')} pestanas={pestanas} valor={tab} onValorChange={(v) => irA(v)} />

      <div role="tabpanel" id={idPanel(ID_TABS, tab)} aria-labelledby={idPestana(ID_TABS, tab)} className="min-w-0">
        {subPestanas[tab] && (
          <TabBar
            id={`${ID_TABS}-${tab}`}
            etiqueta={t('pestanas.etiquetaSub')}
            tamano="sm"
            className="mb-4"
            pestanas={subPestanas[tab]!}
            valor={subActual ?? subPestanas[tab]![0].valor}
            onValorChange={(v) => irA(tab, v)}
          />
        )}
        <div
          role={subPestanas[tab] ? 'tabpanel' : undefined}
          id={subPestanas[tab] ? idPanel(`${ID_TABS}-${tab}`, subActual ?? '') : undefined}
          aria-labelledby={subPestanas[tab] ? idPestana(`${ID_TABS}-${tab}`, subActual ?? '') : undefined}
        >
          {tab === 'resumen' && <ResumenProducto />}
          {tab === 'inventario' && subActual === 'stock' && <StockSucursales />}
          {tab === 'inventario' && subActual === 'lotes' && <LotesProducto />}
          {tab === 'inventario' && subActual === 'kardex' && <KardexProducto />}
          {tab === 'inventario' && subActual === 'seriales' && <SerialesProducto />}
          {tab === 'precios' && <PreciosCostos />}
          {tab === 'variantes' && subActual === 'variantes' && <VariantesProducto />}
          {tab === 'variantes' && subActual === 'modificadores' && <ModificadoresProducto />}
          {tab === 'produccion' && <PestanaProduccion producto={producto} permisos={permisos} />}
          {tab === 'imagenes' && <ImagenesProducto />}
          {tab === 'proveedores' && subActual === 'proveedores' && <ProveedoresProducto />}
          {tab === 'proveedores' && subActual === 'etiquetas' && <EtiquetasProducto />}
          {tab === 'notas' && <NotasProducto />}
          {tab === 'historial' && <HistorialProducto />}
        </div>
      </div>

      <Dialogo
        abierto={confirmarEliminar}
        onAbiertoChange={setConfirmarEliminar}
        titulo={t('eliminar.titulo')}
        descripcion={t('eliminar.descripcion')}
        textoCancelar={t('comun.cancelar')}
        ancho={440}
        primario={{ etiqueta: t('eliminar.confirmar'), destructiva: true, cargando: ocupado, onClick: () => void cambiarEstado('deleted') }}
      >
        <div className="flex items-center gap-2 rounded-md bg-warning-subtle p-3 text-sm text-warning-text">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          <span>{t('eliminar.aviso')}</span>
        </div>
      </Dialogo>

      <ImprimirEtiquetasDialog abierto={dialogoEtiquetas} onAbiertoChange={setDialogoEtiquetas} productIds={productoIds} />
      <GenerarCodigosDialog
        abierto={dialogoCodigos}
        onAbiertoChange={(a) => {
          setDialogoCodigos(a);
          if (!a) void recargar();
        }}
        productIds={productoIds}
      />
    </div>
  );
}

function estadoConocido(estado: string): 'active' | 'inactive' | 'discontinued' | 'deleted' {
  return (['active', 'inactive', 'discontinued', 'deleted'] as const).includes(estado as 'active')
    ? (estado as 'active' | 'inactive' | 'discontinued' | 'deleted')
    : 'inactive';
}

export default DetalleProducto;
