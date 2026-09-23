"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Barcode, Copy, Eye, Pencil, Plus, Printer, Trash } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Producto } from './types';
import { cargarCatalogo, pedirLote, type ParametrosCatalogo } from './catalogoLotes';
import {
  CAMPOS_ORDEN,
  CLAVES_FILTRO,
  categoriaParaRpc,
  estadoParaRpc,
  filtrarCatalogo,
  idsNumericos,
  ordenarCatalogo,
  resumenStock,
} from './catalogoVista';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { toast } from '@/components/ui/use-toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BranchBadgeActiva, Pagination, calcularRango, useListadoServidor, type AccionFila } from '@/components/kit';

import ProductosPageHeader from './ProductosPageHeader';
import FiltrosProductosComponent from './FiltrosProductos';
import ProductosTable from './ProductosTable';
import AccionesMasivas from './bulk/AccionesMasivas';
import { FacebookFeedDialog, type PestanaMeta } from './FacebookFeedDialog';
import { ImprimirEtiquetasDialog } from './etiquetas/ImprimirEtiquetasDialog';
import { GenerarCodigosDialog } from './etiquetas/GenerarCodigosDialog';
import type { CodigoAsignado } from '@/lib/services/codigosBarrasService';

/** 'normal' = esqueleto hasta el primer lote · 'suave' = conserva la lista (búsqueda) · 'silencioso' = reemplaza al final. */
type ModoCarga = 'normal' | 'suave' | 'silencioso';

const TAMANOS_CATALOGO = [25, 50, 100] as const;

/** Lo que interesa de una fila que llega por tiempo real. */
type FilaCambio = { id?: unknown; product_id?: unknown };
const filaDe = (x: unknown): FilaCambio => (x && typeof x === 'object' ? (x as FilaCambio) : {});

/** Grupo de modificadores tal como lo lee la exportación CSV. */
interface GrupoModificadoresCsv {
  product_id: number;
  name: string;
  selection_mode: string | null;
  min_selections: number | null;
  max_selections: number | null;
  required: boolean | null;
  product_modifiers: { name: string; extra_price: number | null; is_active: boolean | null; display_order: number | null }[] | null;
}

/** Columnas del producto que la exportación usa y el tipo `Producto` no declara. */
type ProductoCsv = Producto & { variant_data?: unknown; station?: string | null };

const mensajeDe = (e: unknown): string | undefined => (e instanceof Error ? e.message : undefined);
const fmt = (n: number) => n.toLocaleString('es-CO');

/** Tope de productos para etiquetas/códigos desde la cabecera sin selección. */
const MAX_PRODUCTOS_ETIQUETAS = 1000;

/**
 * Catálogo de productos (`/app/inventario/productos`), rediseño de Figma sobre
 * el kit compartido (`@/components/kit`).
 *
 * La carga no cambia: `catalogoLotes.ts` trae el catálogo completo por lotes
 * (RPC `catalogo_productos_lote`, stock padre + variantes por sucursal), con el
 * avance en la cabecera y el tiempo real por filas. Búsqueda, categoría y
 * estado van a la RPC; el resto de filtros, el orden y la paginación trabajan
 * sobre lo ya cargado (ordenar o paginar no recarga nada). El estado del
 * listado vive en la URL (`useListadoServidor`).
 */
const CatalogoProductos: React.FC = () => {
  const router = useRouter();
  const { organization } = useOrganization();
  // Dia de la organizacion para los nombres de descarga (CSV propio y feed de
  // Facebook). Sin sucursal: el catalogo es de toda la organizacion.
  const { getToday } = useFormatDate();
  const { branchFilter, branches } = useBranch();

  const listado = useListadoServidor({
    filtros: CLAVES_FILTRO,
    camposOrden: CAMPOS_ORDEN,
    ordenPorDefecto: { campo: 'nombre', direccion: 'asc' },
    tamanoPorDefecto: 25,
    tamanosPermitidos: TAMANOS_CATALOGO,
  });
  const busquedaServidor = listado.busqueda;
  const categoriaRpc = categoriaParaRpc(listado.filtros.categoria);
  const estadoRpc = estadoParaRpc(listado.filtros.estado);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorCarga, setErrorCarga] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [productoAEliminar, setProductoAEliminar] = useState<Producto | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
  const [isFacebookFeedOpen, setIsFacebookFeedOpen] = useState<boolean>(false);
  const [pestanaMeta, setPestanaMeta] = useState<PestanaMeta>('feed');
  const [refreshKey, setRefreshKey] = useState<number>(0);
  // Diálogos «Imprimir etiquetas» y «Códigos de barras»: los productos elegidos.
  const [idsEtiquetas, setIdsEtiquetas] = useState<number[] | null>(null);
  const [idsCodigos, setIdsCodigos] = useState<number[] | null>(null);
  const tEtq = useTranslations('inventarioEtiquetas.catalogo');
  // Lo que se lleva escrito en el buscador: filtra al instante lo cargado
  // mientras el debounce (400 ms) confirma la búsqueda en el servidor.
  const [busquedaRapida, setBusquedaRapida] = useState<string>(busquedaServidor);
  // Productos cuya imagen principal no cargó: cuentan como «sin imagen».
  const [imagenesFallidas, setImagenesFallidas] = useState<ReadonlySet<string>>(() => new Set());
  const lastFetchKey = useRef<string>('');
  const ultimaCarga = useRef<string | null>(null);
  // Carga por lotes (catalogoLotes.ts): el primer lote pinta la tabla y quita
  // el skeleton; el resto llega en lotes paralelos que se van sumando EN ORDEN,
  // con el progreso visible en el encabezado.
  const [backgroundLoading, setBackgroundLoading] = useState<boolean>(false);
  const [progresoCarga, setProgresoCarga] = useState<{ cargados: number; total: number } | null>(null);
  // El abort token incluye una promesa que se resuelve al terminar la carga
  // completa. Permite que handleExportar espere a que TODOS los productos estén
  // cargados antes de exportar (sin esto exportaría solo los primeros lotes).
  const backgroundAbortRef = useRef<{
    cancelled: boolean;
    donePromise?: Promise<void>;
    resolveDone?: () => void;
  } | null>(null);
  // Ref espejo de `productos` para leer el valor más reciente dentro de
  // handlers async tras un await (el closure captura el valor al momento del
  // render, no después de que el await libere).
  const productosRef = useRef<Producto[]>([]);
  productosRef.current = productos;

  // Si la búsqueda confirmada cambia desde fuera («Limpiar todo», atrás), el
  // filtro rápido se alinea con ella.
  useEffect(() => {
    setBusquedaRapida(busquedaServidor);
  }, [busquedaServidor]);

  // Filtros de la UI → parámetros de la RPC. La sucursal NO entra: el stock
  // llega por sucursal y la tabla elige cuál pintar, así que cambiar de
  // sucursal no recarga el catálogo. El orden tampoco: se ordena en el
  // navegador sobre lo cargado.
  const parametros = useCallback((): ParametrosCatalogo | null => {
    if (!organization?.id) return null;
    return {
      organizationId: organization.id,
      busqueda: busquedaServidor,
      categoria: categoriaRpc,
      estado: estadoRpc,
      ordenarPor: 'name',
    };
  }, [organization?.id, busquedaServidor, categoriaRpc, estadoRpc]);

  const fetchProductos = useCallback(async (modo: ModoCarga = 'normal') => {
    const p = parametros();
    if (!p) {
      setLoading(false);
      return;
    }

    // Cancelar la carga anterior si sigue corriendo.
    if (backgroundAbortRef.current) {
      backgroundAbortRef.current.cancelled = true;
      backgroundAbortRef.current.resolveDone?.();
    }
    let resolveDone: () => void = () => {};
    const donePromise = new Promise<void>((resolve) => { resolveDone = resolve; });
    const token = { cancelled: false, donePromise, resolveDone };
    backgroundAbortRef.current = token;

    const silencioso = modo === 'silencioso';
    if (modo === 'normal') setLoading(true);
    setBackgroundLoading(true);
    try {
      const lista = await cargarCatalogo(p, {
        cancelado: () => token.cancelled,
        alPrimerLote: (prods, total) => {
          setProgresoCarga({ cargados: prods.length, total });
          setErrorCarga(false);
          if (silencioso) return;
          setProductos(prods);
          setLoading(false);
        },
        alAvanzar: (prods, total) => {
          setProgresoCarga({ cargados: prods.length, total });
          if (!silencioso) setProductos(prods);
        },
      });
      if (lista && !token.cancelled) setProductos(lista);
    } catch (error: unknown) {
      if (!token.cancelled) {
        console.error('Error al cargar productos:', mensajeDe(error) ?? error);
        setErrorCarga(true);
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudieron cargar los productos. Intente de nuevo más tarde."
        });
      }
    } finally {
      if (!token.cancelled) {
        setLoading(false);
        setBackgroundLoading(false);
        setProgresoCarga(null);
      }
      resolveDone(); // liberar a handleExportar si está esperando
    }
  }, [parametros]);

  // Refs para el canal de tiempo real (se suscribe una vez por organización).
  const fetchProductosRef = useRef(fetchProductos);
  fetchProductosRef.current = fetchProductos;
  const parametrosRef = useRef(parametros);
  parametrosRef.current = parametros;

  // Cargar al montar y cuando cambian búsqueda, categoría, estado, organización o «Actualizar».
  useEffect(() => {
    // Evitar doble ejecución en React Strict Mode (desarrollo)
    const resto = JSON.stringify([organization?.id, categoriaRpc, estadoRpc, refreshKey]);
    const fetchKey = JSON.stringify([resto, busquedaServidor]);
    if (lastFetchKey.current === fetchKey) return;
    lastFetchKey.current = fetchKey;
    // Si solo cambió la búsqueda y ya hay lista, se conserva (con el filtro
    // rápido encima) hasta que llegue el primer lote: sin parpadeo de esqueleto.
    const soloBusqueda = ultimaCarga.current === resto && productosRef.current.length > 0;
    ultimaCarga.current = resto;
    fetchProductos(soloBusqueda ? 'suave' : 'normal');
  }, [organization?.id, categoriaRpc, estadoRpc, busquedaServidor, refreshKey, fetchProductos]);

  // Al salir de la página, cancelar la carga en curso.
  useEffect(() => () => {
    if (backgroundAbortRef.current) backgroundAbortRef.current.cancelled = true;
  }, []);

  // Tiempo real: cambios en products, stock_levels, product_prices y
  // product_costs. Antes cualquier cambio (p. ej. cada venta del POS) recargaba
  // el catálogo entero; ahora se juntan los productos tocados durante 1,5 s y
  // se piden solo sus padres para reemplazar esas filas. Si el cambio no trae
  // el producto (un borrado sin datos) o son demasiados, se recarga en silencio.
  useEffect(() => {
    if (!organization?.id) return;
    const orgId = organization.id;
    const MAX_FILAS_EN_VIVO = 150;

    const pendientes = new Set<number>();
    let recargaCompleta = false;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;

    const aplicar = async () => {
      reloadTimer = null;
      const ids = [...pendientes];
      pendientes.clear();
      const completa = recargaCompleta;
      recargaCompleta = false;
      if (completa || ids.length > MAX_FILAS_EN_VIVO) {
        fetchProductosRef.current('silencioso');
        return;
      }
      const p = parametrosRef.current();
      if (!p || ids.length === 0) return;

      // Padres afectados según la lista actual (una variante → su padre).
      const padreDe = new Map<number, number>();
      for (const prod of productosRef.current) {
        for (const h of prod.children ?? []) padreDe.set(Number(h.id), Number(prod.id));
      }
      const padres = new Set(ids.map((id) => padreDe.get(id) ?? id));

      try {
        const { productos: frescos } = await pedirLote(p, 0, MAX_FILAS_EN_VIVO, ids);
        const porId = new Map(frescos.map((f) => [Number(f.id), f]));
        setProductos((prev) => {
          const vistos = new Set<number>();
          const siguiente: Producto[] = [];
          for (const prod of prev) {
            const id = Number(prod.id);
            const fresco = porId.get(id);
            if (fresco) {
              siguiente.push(fresco);
              vistos.add(id);
            } else if (!padres.has(id)) {
              siguiente.push(prod);
            }
            // Si era un padre afectado y no volvió, ya no cumple los filtros
            // (o se borró): sale de la lista.
          }
          for (const f of frescos) if (!vistos.has(Number(f.id))) siguiente.push(f);
          return siguiente;
        });
      } catch {
        fetchProductosRef.current('silencioso');
      }
    };

    const anotar = (id: unknown) => {
      const n = Number(id);
      if (Number.isFinite(n) && n > 0) pendientes.add(n);
      else recargaCompleta = true;
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(aplicar, 1500);
    };
    type Cambio = RealtimePostgresChangesPayload<FilaCambio>;
    const porProducto = (payload: Cambio) => anotar(filaDe(payload.new).product_id ?? filaDe(payload.old).product_id);

    const channel = supabase
      .channel('productos_catalogo_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `organization_id=eq.${orgId}` },
        (payload: Cambio) => anotar(filaDe(payload.new).id ?? filaDe(payload.old).id)
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_levels' }, porProducto)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_prices' }, porProducto)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_costs' }, porProducto)
      .subscribe();

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, [organization?.id]);

  // ─── Lo que se ve: filtros del navegador, orden y página ──────────────────
  const terminoRapido = busquedaRapida.trim() !== busquedaServidor ? busquedaRapida : '';
  const filtrados = useMemo(
    () => filtrarCatalogo(productos, { termino: terminoRapido, filtros: listado.filtros, branchFilter, imagenesFallidas }),
    [productos, terminoRapido, listado.filtros, branchFilter, imagenesFallidas],
  );
  const ordenados = useMemo(() => ordenarCatalogo(filtrados, listado.orden, branchFilter), [filtrados, listado.orden, branchFilter]);
  // La página se acota si la lista encoge (borrados, filtros): nunca una tabla vacía por estar fuera de rango.
  const rango = calcularRango(listado.pagina, listado.tamano, ordenados.length);
  const paginaVisible = useMemo(
    () => ordenados.slice((rango.pagina - 1) * listado.tamano, rango.pagina * listado.tamano),
    [ordenados, rango.pagina, listado.tamano],
  );
  const resumen = useMemo(() => resumenStock(productos, branchFilter), [productos, branchFilter]);

  const cargandoLotes = backgroundLoading && !!progresoCarga && progresoCarga.cargados < progresoCarga.total;
  const totalCatalogo = progresoCarga?.total ?? productos.length;
  const hayFiltroCliente = !!terminoRapido || Object.keys(listado.filtros).some((k) => k !== 'categoria' && k !== 'estado');

  const estadoTabla = (() => {
    // Carga «normal» (entrar, cambiar categoría o estado, Actualizar): esqueleto
    // hasta el primer lote, nunca la lista vieja bajo un filtro nuevo.
    if (loading) return 'cargando' as const;
    if (errorCarga && productos.length === 0) return 'error' as const;
    if (ordenados.length === 0) {
      if (backgroundLoading) return 'cargando' as const;
      if (listado.hayCriterios || hayFiltroCliente) return 'sinResultados' as const;
    }
    return 'listo' as const;
  })();

  // Subtítulo: «Consolidado · 3 sucursales · 4.368 productos · 12 sin stock · 3 con stock bajo».
  const nombreSucursal =
    branchFilter !== null ? branches.find((b) => b.id === branchFilter)?.name ?? `Sucursal #${branchFilter}` : null;
  const partesSubtitulo = [
    nombreSucursal ?? (branches.length > 1 ? `Consolidado · ${fmt(branches.length)} sucursales` : null),
    `${fmt(totalCatalogo)} ${totalCatalogo === 1 ? 'producto' : 'productos'}`,
    cargandoLotes && progresoCarga ? `cargando ${fmt(progresoCarga.cargados)} de ${fmt(progresoCarga.total)}` : null,
    !cargandoLotes && resumen.sinStock > 0 ? `${fmt(resumen.sinStock)} sin stock` : null,
    !cargandoLotes && resumen.bajo > 0 ? `${fmt(resumen.bajo)} con stock bajo` : null,
  ].filter(Boolean);
  const subtitulo = loading && productos.length === 0 ? 'Cargando catálogo…' : partesSubtitulo.join(' · ');
  const subtituloMovil =
    loading && productos.length === 0 ? 'Cargando…' : `${fmt(totalCatalogo)} ${totalCatalogo === 1 ? 'producto' : 'productos'}`;

  // ─── Acciones por producto ────────────────────────────────────────────────
  const handleVer = useCallback((p: Producto) => router.push(`/app/inventario/productos/${p.uuid || p.id}`), [router]);

  const handleConfirmDelete = async () => {
    const producto = productoAEliminar;
    if (!producto) return;
    const id = Number(producto.id);
    try {
      setActionLoading(true);
      // Función RPC con SECURITY DEFINER para evitar problemas de RLS
      const { data: rpcResult, error: rpcError } = await supabase.rpc('soft_delete_product', { p_product_id: id });
      if (rpcError) throw new Error(rpcError.message || 'Error al eliminar el producto');
      if (!rpcResult) throw new Error('No se pudo eliminar el producto. Verifique permisos.');

      toast({ title: "Producto eliminado", description: "El producto ha sido eliminado correctamente." });
      // Quitarlo de la vista y de la selección
      setProductos((prev) => prev.filter((p) => Number(p.id) !== id));
      setSeleccion((prev) => {
        if (!prev.has(String(id))) return prev;
        const siguiente = new Set(prev);
        siguiente.delete(String(id));
        return siguiente;
      });
    } catch (error: unknown) {
      console.error('Error al eliminar producto:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: mensajeDe(error) || "No se pudo eliminar el producto. Intente de nuevo más tarde."
      });
    } finally {
      setProductoAEliminar(null);
      setActionLoading(false);
    }
  };

  const copiarId = useCallback(async (p: Producto) => {
    try {
      await navigator.clipboard.writeText(String(p.uuid || p.id));
      toast({ title: 'ID copiado', description: 'El identificador del producto quedó en el portapapeles.' });
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo copiar', description: 'El navegador no permitió usar el portapapeles.' });
    }
  }, []);

  const accionesProducto = useCallback(
    (p: Producto): AccionFila[] => {
      const base = `/app/inventario/productos/${p.uuid || p.id}`;
      const id = Number(p.id);
      return [
        { id: 'ver', etiqueta: 'Ver detalle', icono: Eye, onSelect: () => handleVer(p) },
        { id: 'editar', etiqueta: 'Editar', icono: Pencil, onSelect: () => router.push(`${base}/editar`) },
        { id: 'duplicar', etiqueta: 'Duplicar', icono: Copy, onSelect: () => router.push(`${base}/duplicar`) },
        { id: 'imprimir-etiquetas', etiqueta: tEtq('imprimirEtiquetas'), icono: Printer, onSelect: () => setIdsEtiquetas([id]), separadorAntes: true },
        { id: 'codigos-barras', etiqueta: tEtq('codigosBarras'), icono: Barcode, onSelect: () => setIdsCodigos([id]) },
        { id: 'copiar-id', etiqueta: 'Copiar ID', icono: Copy, onSelect: () => void copiarId(p), separadorAntes: true },
        { id: 'eliminar', etiqueta: 'Eliminar', icono: Trash, destructiva: true, onSelect: () => setProductoAEliminar(p) },
      ];
    },
    [copiarId, handleVer, router, tEtq],
  );

  // ─── Exportar ─────────────────────────────────────────────────────────────
  const handleExportar = async () => {
    // Si la carga completa en background sigue corriendo, esperar a que termine
    // para no exportar un subconjunto parcial (ej: solo la primera página de 1000).
    if (backgroundAbortRef.current?.donePromise) {
      setActionLoading(true);
      await backgroundAbortRef.current.donePromise;
      setActionLoading(false);
    }

    // Usar la ref para leer el valor más reciente tras el await (el closure
    // captura `productos` al momento del render, no después del await).
    const productosActuales = productosRef.current;

    if (productosActuales.length === 0) {
      toast({ title: 'Sin productos', description: 'No hay productos para exportar.' });
      return;
    }

    if (!organization?.id) {
      toast({ title: 'Error', description: 'No hay organización seleccionada.' });
      return;
    }

    const productIds = productosActuales.map(p => Number(p.id)).filter(id => !isNaN(id));

    const { data: modGroups } = await supabase
      .from('product_modifier_groups')
      .select('id, product_id, name, selection_mode, min_selections, max_selections, required, product_modifiers(id, name, extra_price, is_active, display_order)')
      .in('product_id', productIds);

    const modifiersMap = new Map<number, string>();
    if (modGroups) {
      for (const mg of modGroups as unknown as GrupoModificadoresCsv[]) {
        const opts = (mg.product_modifiers || [])
          .filter((m) => m.is_active)
          .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
          .map((m) => `${m.name}=${m.extra_price ?? 0}`);
        const groupStr = `${mg.name}|${mg.selection_mode || 'single'}|${mg.min_selections ?? 0}|${mg.max_selections ?? ''}|${mg.required ? 'true' : 'false'}|${opts.join(',')}`;
        const existing = modifiersMap.get(mg.product_id);
        modifiersMap.set(mg.product_id, existing ? `${existing}; ${groupStr}` : groupStr);
      }
    }

    const headers = [
      'SKU', 'Nombre', 'Tipo', 'Descripción', 'Categoría', 'Unidad', 'Código de Barras',
      'Marca', 'Referencia', 'Proveedor', 'Precio de Venta', 'Precio de Comparación',
      'Costo', 'Impuesto', 'Rastrear Inventario', 'Stock Total', 'Stock Mínimo',
      'Etiquetas', 'Notas', 'URLs de Imágenes', 'SKU Padre', 'Datos de Variante',
      'Es Producto Padre', 'Estación', 'Modificadores', 'Estado'
    ];

    const formatProductRow = (p: ProductoCsv, parentSku: string, isParent: boolean): string[] => {
      const pid = Number(p.id);
      const modifiersStr = modifiersMap.get(pid) || '';

      let comparePrice = '';
      if (p.product_prices && p.product_prices.length > 0) {
        const valid = p.product_prices
          .filter((pp) => !pp.effective_to || new Date(pp.effective_to) > new Date())
          .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
        if (valid.length > 0 && valid[0].compare_price) {
          comparePrice = String(valid[0].compare_price);
        }
      }

      let imageUrls = '';
      if (p.product_images && p.product_images.length > 0) {
        imageUrls = p.product_images.map((img) => {
          const path = img.storage_path || '';
          if (!path) return '';
          const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
          return urlData?.publicUrl || '';
        }).filter(Boolean).join(';');
      }

      let variantData = '';
      if (p.variant_data) {
        const vd = p.variant_data;
        variantData = typeof vd === 'string' ? vd : JSON.stringify(vd);
      }

      return [
        p.sku || '',
        p.name || '',
        p.product_type === 'service' ? 'Servicio' : 'Producto',
        p.description || '',
        p.category?.name || '',
        p.unit_code || 'UN',
        p.barcode || '',
        p.brand || '',
        p.reference || '',
        '',
        (p.price ?? 0).toString(),
        comparePrice,
        (p.cost ?? 0).toString(),
        '',
        p.track_stock === false ? 'false' : 'true',
        (p.stock ?? 0).toString(),
        '',
        '',
        '',
        imageUrls,
        parentSku,
        variantData,
        isParent ? 'true' : 'false',
        p.station || 'none',
        modifiersStr,
        p.status || 'active',
      ];
    };

    const rows: string[][] = [];

    productosActuales.forEach((p) => {
      rows.push(formatProductRow(p, '', !p.parent_product_id));

      if (p.children && p.children.length > 0) {
        p.children.forEach((v) => {
          rows.push(formatProductRow(v, p.sku || '', false));
        });
      }
    });

    const escapeCSV = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map(escapeCSV).join(',')),
    ].join('\n');

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `productos_${getToday()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ title: 'Exportación exitosa', description: `Se exportaron ${productosActuales.length} productos.` });
  };

  // «Exportar a Facebook» y «URL del feed» abren el mismo diálogo de Meta
  // (exportación y feed salen del mismo generador en el servidor).
  const abrirMeta = (pestana: PestanaMeta) => {
    setPestanaMeta(pestana);
    setIsFacebookFeedOpen(true);
  };

  const recargar = () => setRefreshKey((k) => k + 1);
  const registrarImagenFallida = useCallback((id: string) => {
    setImagenesFallidas((prev) => {
      if (prev.has(id)) return prev;
      const siguiente = new Set(prev);
      siguiente.add(id);
      return siguiente;
    });
  }, []);

  const selectedIds = useMemo(() => idsNumericos(seleccion), [seleccion]);

  // Desde la cabecera: la selección o, sin ella, lo que se ve con los filtros.
  const alcanceCabecera = (abrir: (ids: number[]) => void) => () => {
    const ids = selectedIds.length ? selectedIds : ordenados.map((p) => Number(p.id)).filter((n) => Number.isFinite(n));
    if (ids.length === 0) {
      toast({ title: tEtq('sinProductos') });
      return;
    }
    if (ids.length > MAX_PRODUCTOS_ETIQUETAS) {
      toast({ variant: 'destructive', title: tEtq('demasiados', { n: MAX_PRODUCTOS_ETIQUETAS }) });
      return;
    }
    abrir(ids);
  };

  // Códigos recién asignados: se pintan ya en su fila (padre o variante).
  const aplicarCodigos = useCallback((asignados: CodigoAsignado[]) => {
    if (asignados.length === 0) return;
    const porId = new Map(asignados.map((a) => [a.productId, a.codigo]));
    const conCodigo = (p: Producto): Producto => {
      const propio = porId.get(Number(p.id));
      const hijos = p.children?.map(conCodigo);
      return propio !== undefined || hijos ? { ...p, ...(propio !== undefined ? { barcode: propio } : {}), ...(hijos ? { children: hijos } : {}) } : p;
    };
    setProductos((prev) => prev.map(conCodigo));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <ProductosPageHeader
        onImportarArchivo={() => router.push('/app/inventario/productos/importar')}
        onImportarWeb={() => router.push('/app/inventario/productos/importar?origen=web')}
        onExportarCsv={handleExportar}
        onExportarFacebook={() => abrirMeta('exportar')}
        onFeedFacebook={() => abrirMeta('feed')}
        onActualizar={recargar}
        onImprimirEtiquetas={alcanceCabecera(setIdsEtiquetas)}
        onCodigosBarras={alcanceCabecera(setIdsCodigos)}
        actualizando={loading || actionLoading || backgroundLoading}
        subtitulo={subtitulo}
        subtituloMovil={subtituloMovil}
        progresoCarga={backgroundLoading ? progresoCarga : null}
      />

      <FiltrosProductosComponent
        listado={listado}
        onBusquedaRapida={setBusquedaRapida}
        buscando={backgroundLoading && !loading && busquedaServidor !== ''}
        totalResultados={ordenados.length}
      />

      {/* La sucursal manda en el stock que se ve; en escritorio va en el subtítulo. */}
      <div className="lg:hidden">
        <BranchBadgeActiva />
      </div>

      <ProductosTable
        productos={paginaVisible}
        estado={estadoTabla}
        orden={listado.orden}
        onOrdenar={listado.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        acciones={accionesProducto}
        onVer={handleVer}
        branchFilter={branchFilter}
        branches={branches}
        onImagenFallida={registrarImagenFallida}
        onReintentar={recargar}
        onLimpiarFiltros={() => {
          setBusquedaRapida('');
          listado.limpiarTodo();
        }}
        termino={busquedaRapida.trim() || undefined}
        vacio={{
          titulo: 'Aún no tienes productos',
          descripcion: 'Crea tu primer producto o impórtalo desde un archivo.',
          accion: { etiqueta: 'Nuevo producto', href: '/app/inventario/productos/nuevo', icono: Plus },
        }}
        pie={
          <Pagination
            pagina={rango.pagina}
            tamano={listado.tamano}
            total={ordenados.length}
            onPaginaChange={listado.setPagina}
            onTamanoChange={listado.setTamano}
            opcionesTamano={TAMANOS_CATALOGO}
            sustantivo={{ singular: 'producto', plural: 'productos' }}
            cargando={estadoTabla === 'cargando'}
          />
        }
      />

      <AccionesMasivas
        selectedIds={selectedIds}
        total={ordenados.length}
        onSeleccionarTodos={() => setSeleccion(new Set(ordenados.map((p) => String(p.id))))}
        onClearSelection={() => setSeleccion(new Set())}
        onActionComplete={() => fetchProductos('silencioso')}
        onImprimirEtiquetas={setIdsEtiquetas}
        onGenerarCodigos={setIdsCodigos}
      />

      <ImprimirEtiquetasDialog
        abierto={idsEtiquetas !== null}
        onAbiertoChange={(v) => !v && setIdsEtiquetas(null)}
        productIds={idsEtiquetas ?? []}
        onCodigosGenerados={aplicarCodigos}
      />
      <GenerarCodigosDialog
        abierto={idsCodigos !== null}
        onAbiertoChange={(v) => !v && setIdsCodigos(null)}
        productIds={idsCodigos ?? []}
        onGenerados={aplicarCodigos}
      />


      <ConfirmDialog
        open={productoAEliminar !== null}
        onOpenChange={(abierto) => {
          if (!abierto && !actionLoading) setProductoAEliminar(null);
        }}
        title="¿Eliminar producto?"
        description={
          productoAEliminar
            ? `«${productoAEliminar.name}» dejará de verse en el catálogo. Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        variant="destructive"
        loading={actionLoading}
        onConfirm={handleConfirmDelete}
      />

      {/* URL del feed para Facebook */}
      <FacebookFeedDialog
        open={isFacebookFeedOpen}
        onOpenChange={setIsFacebookFeedOpen}
        organizationId={organization?.id}
        pestanaInicial={pestanaMeta}
      />
    </div>
  );
};

export default CatalogoProductos;
