"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { Producto, FiltrosProductos, StockSucursal } from './types';
import { cargarCatalogo, pedirLote, type ParametrosCatalogo } from './catalogoLotes';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { Button } from "@/components/ui/button";
import { toast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

// Importaciones de los componentes
// @ts-ignore - Ignorar errores de importación
import ProductosPageHeader from './ProductosPageHeader';
// @ts-ignore - Ignorar errores de importación
import FiltrosProductosComponent from './FiltrosProductos';
// @ts-ignore - Ignorar errores de importación
import ProductosTable from './ProductosTable';
import AccionesMasivas from './bulk/AccionesMasivas';
import ScrapingProductos from './scraping/ScrapingProductos';
import { FacebookFeedDialog } from './FacebookFeedDialog';
import {
  exportToFacebookCatalog,
  downloadCSV,
  getOrganizationDomain,
  getOrganizationCurrency,
  fetchAllProductsForFacebook,
} from './facebookCatalogExport';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

/**
 * Componente principal para el catálogo de productos
 * 
 * Este componente orquesta la visualización y gestión de productos,
 * incluyendo listado, filtrado, creación, edición y visualización de detalles.
 */
const CatalogoProductos: React.FC = () => {
  // Tema actual

  // Router para navegación
  const router = useRouter();
  // Obtener organización y sucursal del hook
  const { organization } = useOrganization();
  const { branchFilter, branches } = useBranch();
  
  // Estados para gestionar la interfaz y los datos
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [filters, setFilters] = useState<FiltrosProductos>({
    busqueda: '',
    categoria: null,
    estado: '',
    ordenarPor: 'name',
    mostrarEliminados: false // Nuevo estado para controlar si se muestran productos eliminados
  });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [productoToDelete, setProductoToDelete] = useState<number | null>(null);
  const [stockPorSucursal, setStockPorSucursal] = useState<StockSucursal[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isScrapingOpen, setIsScrapingOpen] = useState<boolean>(false);
  const [isFacebookFeedOpen, setIsFacebookFeedOpen] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const lastFetchKey = useRef<string>('');
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

  // Filtros de la UI → parámetros de la RPC. La sucursal NO entra: el stock
  // llega por sucursal y la tabla elige cuál pintar, así que cambiar de
  // sucursal ya no recarga el catálogo.
  const parametros = useCallback((): ParametrosCatalogo | null => {
    if (!organization?.id) return null;
    return {
      organizationId: organization.id,
      busqueda: filters.busqueda,
      categoria: filters.categoria ? Number(filters.categoria) : null,
      estado: filters.mostrarEliminados ? 'todos' : (filters.estado || null),
      ordenarPor: filters.ordenarPor || 'name',
    };
  }, [organization?.id, filters]);

  // silent=true: no muestra skeleton ni encoge la lista mientras recarga
  // (tras acciones masivas); la lista se reemplaza al final.
  const fetchProductos = useCallback(async (silent: boolean = false) => {
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

    if (!silent) setLoading(true);
    setBackgroundLoading(true);
    try {
      const lista = await cargarCatalogo(p, {
        cancelado: () => token.cancelled,
        alPrimerLote: (prods, total) => {
          setProgresoCarga({ cargados: prods.length, total });
          if (silent) return;
          setProductos(prods);
          setLoading(false);
        },
        alAvanzar: (prods, total) => {
          setProgresoCarga({ cargados: prods.length, total });
          if (!silent) setProductos(prods);
        },
      });
      if (lista && !token.cancelled) setProductos(lista);
    } catch (error: any) {
      if (!token.cancelled) {
        console.error('Error al cargar productos:', error?.message ?? error);
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

  // Cargar al montar y cuando cambian filtros, organización o «Actualizar».
  useEffect(() => {
    // Evitar doble ejecución en React Strict Mode (desarrollo)
    const fetchKey = JSON.stringify([organization?.id, filters, refreshKey]);
    if (lastFetchKey.current === fetchKey) return;
    lastFetchKey.current = fetchKey;
    fetchProductos(false);
  }, [organization?.id, filters, refreshKey, fetchProductos]);

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
        fetchProductosRef.current(true);
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
        fetchProductosRef.current(true);
      }
    };

    const anotar = (id: unknown) => {
      const n = Number(id);
      if (Number.isFinite(n) && n > 0) pendientes.add(n);
      else recargaCompleta = true;
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(aplicar, 1500);
    };
    const porProducto = (payload: any) => anotar(payload.new?.product_id ?? payload.old?.product_id);

    const channel = supabase
      .channel('productos_catalogo_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `organization_id=eq.${orgId}` },
        (payload: any) => anotar(payload.new?.id ?? payload.old?.id)
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

  // Función para obtener información de stock por sucursal para un producto específico
  const fetchStockPorSucursal = async (productId: number) => {
    try {
      // Buscar el producto seleccionado en los productos ya cargados
      const selectedProduct = productos.find(p => p.id === productId);
      
      if (selectedProduct && selectedProduct.stock_levels) {
        // Ya tenemos la información de stock por sucursal, solo necesitamos formatearla
        const formattedStockData: StockSucursal[] = selectedProduct.stock_levels.map((item: any) => ({
          branch_id: item.branch_id,
          branch_name: item.branches?.name || 'Sucursal sin nombre',
          product_id: productId,
          qty: (item.qty_on_hand || 0) - (item.qty_reserved || 0)
        }));
        
        setStockPorSucursal(formattedStockData);
        return;
      }
      
      // Si no tenemos la información en los productos cargados, hacemos la consulta
      const { data: stockData, error: stockError } = await supabase
        .from('stock_levels')
        .select('branch_id, qty_on_hand, qty_reserved, branches(id, name)')
        .eq('product_id', productId);
      
      if (stockError) throw stockError;
      
      // Formatear datos de stock por sucursal
      const formattedStockData: StockSucursal[] = stockData.map((item: any) => ({
        branch_id: item.branch_id,
        branch_name: item.branches?.name || 'Sucursal sin nombre',
        product_id: productId,
        qty: (item.qty_on_hand || 0) - (item.qty_reserved || 0)
      }));
      
      setStockPorSucursal(formattedStockData);
    } catch (error) {
      console.error('Error al obtener stock por sucursal:', error);
      setStockPorSucursal([]);
    }
  };

  // Funciones para gestionar los dialogos y acciones CRUD
  const handleCrear = () => {
    try {
      // Preparar una estructura de datos de producto vacía como plantilla
      const emptyProduct = {
        id: 'new',
        name: '',
        description: '',
        sku: '',
        barcode: '',
        status: 'active',
        price: 0,
        cost: 0,
        stock: 0,
        category_id: null,
        organization_id: localStorage.getItem('currentOrganizationId') || sessionStorage.getItem('currentOrganizationId'),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        product_prices: [],
        product_costs: [],
        stock_levels: [],
        product_images: [],
        variants: []
      };
      
      // Guardar la plantilla en sessionStorage para usar en la página de creación
      sessionStorage.setItem('new_product_template', JSON.stringify(emptyProduct));
      console.log('Plantilla para nuevo producto guardada en sessionStorage');
      
      // Redireccionar a la nueva página de creación de productos
      router.push('/app/inventario/productos/nuevo');
    } catch (error) {
      console.error('Error al preparar la plantilla para nuevo producto:', error);
      // Redireccionar de todos modos
      router.push('/app/inventario/productos/nuevo');
    }
  };

  const handleEditar = (producto: Producto) => {
    // Usar UUID si está disponible, de lo contrario usar ID
    const productUuid = producto.uuid || producto.id;
    router.push(`/app/inventario/productos/${productUuid}/editar`);
  };

  const handleDuplicar = (producto: Producto) => {
    // Usar UUID si está disponible, de lo contrario usar ID
    const productUuid = producto.uuid || producto.id;
    router.push(`/app/inventario/productos/${productUuid}/duplicar`);
  };

  const handleImportar = () => {
    // Redireccionar a la página de importar
    router.push('/app/inventario/productos/importar');
  };

  // Mantener la función anterior por compatibilidad (no usada actualmente)
  const handleDuplicarLegacy = async (producto: Producto) => {
    try {
      // Obtener datos completos del producto original
      const { data: originalProductData, error } = await supabase
        .from('products')
        .select(`
          *,
          categories(id, name),
          children:products(
            *,
            categories(id, name)
          ),
          product_prices(id, price, compare_price, effective_from, effective_to),
          product_costs(id, cost, effective_from, effective_to),
          product_images(id, storage_path, is_primary)
        `)
        .eq('id', producto.id)
        .single();
        
      if (error) throw error;
      
      if (originalProductData) {
        // Preparar el producto duplicado con cambios en los campos únicos
        const duplicatedProduct: any = {
          ...originalProductData,
          id: 'duplicate', // Marcar como duplicado para la página de creación
          sku: `${originalProductData.sku}-COPIA`,
          name: `${originalProductData.name} (Copia)`,
          barcode: originalProductData.barcode ? `${originalProductData.barcode}-COPIA` : '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // Mantener referencias a datos relacionados pero quitar IDs para que sean nuevos al guardar
          product_prices: originalProductData.product_prices ? originalProductData.product_prices.map((p: any) => ({ ...p, id: 'new', product_id: 'duplicate' })) : [],
          product_costs: originalProductData.product_costs ? originalProductData.product_costs.map((c: any) => ({ ...c, id: 'new', product_id: 'duplicate' })) : [],
          product_images: [], // No duplicar imágenes directamente
          // Preparar variantes (productos hijos)
          children: originalProductData.children ? originalProductData.children.map((child: any) => ({
            ...child,
            id: 'new-child',
            sku: `${child.sku}-COPIA`,
            name: `${child.name} (Copia)`,
            parent_product_id: 'duplicate'
          })) : []
        };
        
        // Guardar el producto duplicado en sessionStorage para la página de creación
        sessionStorage.setItem('duplicated_product_data', JSON.stringify(duplicatedProduct));
        console.log('Datos del producto duplicado guardados en sessionStorage');
        
        // Redireccionar a la página de creación con indicador de que es una duplicación
        router.push('/app/inventario/productos/nuevo?from=duplicate');
      } else {
        throw new Error('No se encontraron los datos completos del producto');
      }
    } catch (error) {
      console.error('Error al duplicar producto:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo duplicar el producto. Intente de nuevo más tarde."
      });
    }
  };

  const handleVer = async (producto: Producto) => {
    // Usar UUID si está disponible, de lo contrario usar ID
    const productUuid = producto.uuid || producto.id;
    
    try {
      // Antes de redireccionar, asegurarse de que tenemos todos los datos del producto
      const { data: productData, error } = await supabase
        .from('products')
        .select(`
          *,
          categories(id, name),
          children:products(
            *,
            categories(id, name),
            product_prices(id, price, compare_price, effective_from, effective_to),
            product_costs(id, cost, effective_from, effective_to),
            stock_levels(branch_id, qty_on_hand, qty_reserved, branches(id, name)),
            product_images(id, storage_path, is_primary)
          ),
          product_prices(id, price, compare_price, effective_from, effective_to),
          product_costs(id, cost, effective_from, effective_to),
          stock_levels(branch_id, qty_on_hand, qty_reserved, branches(id, name)),
          product_images(id, storage_path, is_primary)
        `)
        .eq('id', producto.id)
        .single();
        
      if (error) throw error;
      
      // Almacenamos los datos completos del producto en sessionStorage
      if (productData) {
        sessionStorage.setItem(`product_${productUuid}_data`, JSON.stringify(productData));
        console.log('Datos completos del producto guardados en sessionStorage');
      }
      
      // Redireccionar a la página de detalle usando UUID
      router.push(`/app/inventario/productos/${productUuid}`);
    } catch (error) {
      console.error('Error al obtener datos detallados del producto:', error);
      // Redireccionar de todos modos usando UUID
      router.push(`/app/inventario/productos/${productUuid}`);
    }
  };

  const handleEliminarClick = async (productoId: number | string) => {
    const id = typeof productoId === 'string' ? parseInt(productoId, 10) : productoId;
    setProductoToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!productoToDelete) return;

    try {
      setActionLoading(true);

      if (!productoToDelete) {
        throw new Error('No se seleccionó ningún producto para eliminar');
      }

      console.log('Eliminando producto via RPC:', { productoToDelete });

      // Usar función RPC con SECURITY DEFINER para evitar problemas de RLS
      const { data: rpcResult, error: rpcError } = await supabase
        .rpc('soft_delete_product', {
          p_product_id: productoToDelete
        });

      console.log('Respuesta RPC soft_delete_product:', { rpcResult, rpcError });

      if (rpcError) {
        console.error('RPC error details:', rpcError);
        throw new Error(rpcError.message || 'Error al eliminar el producto');
      }

      if (!rpcResult) {
        throw new Error('No se pudo eliminar el producto. Verifique permisos.');
      }

      toast({
        title: "Producto eliminado",
        description: "El producto ha sido eliminado correctamente."
      });

      // Actualizar lista de productos (eliminarlo de la vista)
      setProductos(productos.filter(p => p.id !== productoToDelete));
    } catch (error: any) {
      console.error('Error al eliminar producto:', error);

      const errorMessage = error.message || "No se pudo eliminar el producto. Intente de nuevo más tarde.";

      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setProductoToDelete(null);
      setActionLoading(false);
    }
  };

  // Render de botones de acciones por producto
  const RenderAcciones = ({ producto }: { producto: Producto }) => (
    <div className="flex flex-row justify-end gap-2">
      <Button
        variant="outline"
        onClick={() => handleEditar(producto)}
        className={'dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700'}
      >
        Editar
      </Button>
      <Button
        variant="outline"
        onClick={() => handleVer(producto)}
        className={'dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700'}
      >
        Ver
      </Button>
      <Button
        variant="outline"
        onClick={() => handleDuplicar(producto)}
        className={'dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700'}
      >
        Duplicar
      </Button>
      <Button
        variant="destructive"
        onClick={() => handleEliminarClick(producto.id)}
        disabled={loading}
      >
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Eliminar
      </Button>
    </div>
  );

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
      for (const mg of modGroups as any[]) {
        const opts = (mg.product_modifiers || [])
          .filter((m: any) => m.is_active)
          .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0))
          .map((m: any) => `${m.name}=${m.extra_price ?? 0}`);
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

    const formatProductRow = (p: Producto, parentSku: string, isParent: boolean): string[] => {
      const pid = Number(p.id);
      const modifiersStr = modifiersMap.get(pid) || '';

      let comparePrice = '';
      if (p.product_prices && p.product_prices.length > 0) {
        const valid = p.product_prices
          .filter((pp: any) => !pp.effective_to || new Date(pp.effective_to) > new Date())
          .sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
        if (valid.length > 0 && valid[0].compare_price) {
          comparePrice = String(valid[0].compare_price);
        }
      }

      let imageUrls = '';
      if (p.product_images && p.product_images.length > 0) {
        imageUrls = p.product_images.map((img: any) => {
          const path = img.storage_path || '';
          if (!path) return '';
          const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
          return urlData?.publicUrl || '';
        }).filter(Boolean).join(';');
      }

      let variantData = '';
      if ((p as any).variant_data) {
        const vd = (p as any).variant_data;
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
        (p as any).station || 'none',
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

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `productos_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ title: 'Exportación exitosa', description: `Se exportaron ${productosActuales.length} productos.` });
  };

  const handleExportarFacebook = async () => {
    if (!organization?.id) {
      toast({ title: 'Error', description: 'No hay organización seleccionada.' });
      return;
    }

    try {
      setActionLoading(true);

      const [currency, webDomain] = await Promise.all([
        getOrganizationCurrency(organization.id),
        getOrganizationDomain(organization.id),
      ]);

      // Consultar TODOS los productos de la BD (no depende de la UI)
      const allProducts = await fetchAllProductsForFacebook(organization.id);

      if (allProducts.length === 0) {
        toast({ title: 'Sin productos', description: 'No hay productos activos para exportar.' });
        setActionLoading(false);
        return;
      }

      const { csv, count } = await exportToFacebookCatalog({
        organizationId: organization.id,
        products: allProducts,
        currency,
        webDomain: webDomain || undefined,
        organizationName: organization.name,
      });

      if (count === 0) {
        toast({ title: 'Sin productos válidos', description: 'No hay productos activos para exportar a Facebook.' });
        setActionLoading(false);
        return;
      }

      const dateStr = new Date().toISOString().split('T')[0];
      downloadCSV(csv, `facebook_catalog_${dateStr}.csv`);

      toast({
        title: 'Exportación a Facebook exitosa',
        description: `Se exportaron ${count} productos al formato de catálogo de Facebook.`,
      });
    } catch (error: any) {
      console.error('Error exportando a Facebook:', error);
      toast({
        title: 'Error de exportación',
        description: error?.message || 'Ocurrió un error al exportar a Facebook.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:gap-4 lg:gap-5">
      {/* Header con título y botón de nuevo */}
      <ProductosPageHeader 
        onCrearClick={handleCrear} 
        onImportarClick={handleImportar}
        onExportarClick={handleExportar}
        onExportarFacebookClick={handleExportarFacebook}
        onFacebookFeedClick={() => setIsFacebookFeedOpen(true)}
        onScrapingClick={() => setIsScrapingOpen(true)}
        onRefreshClick={() => {
          setLoading(true);
          setRefreshKey(k => k + 1);
        }}
        isRefreshing={loading || actionLoading || backgroundLoading}
        totalProducts={progresoCarga?.total ?? productos.length}
        backgroundLoading={backgroundLoading}
        progresoCarga={progresoCarga}
      />
      
      {/* Filtros de búsqueda */}
      <FiltrosProductosComponent 
        filters={filters}
        onFiltersChange={setFilters}
      />
      
      {/* Barra de acciones masivas (visible cuando hay selección) */}
      <AccionesMasivas
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds([])}
        onActionComplete={() => fetchProductos(true)}
      />
      
      {/* Tabla de productos */}
      <ProductosTable
        productos={productos}
        loading={loading}
        onEdit={(producto: Producto) => handleEditar(producto)}
        onView={(producto: Producto) => handleVer(producto)}
        onDelete={(id: string | number) => handleEliminarClick(id)}
        onDuplicate={(producto: Producto) => handleDuplicar(producto)}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        branchFilter={branchFilter}
        branches={branches}
      />
      
      {/* Modal de scraping con IA */}
      <ScrapingProductos
        open={isScrapingOpen}
        onOpenChange={setIsScrapingOpen}
        onImportComplete={() => setRefreshKey(k => k + 1)}
      />
      
      {/* Diálogo de confirmación para eliminar */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg dark:text-gray-100">¿Eliminar producto?</DialogTitle>
            <DialogDescription className="text-sm dark:text-gray-400">
              Esta acción no se puede deshacer. ¿Está seguro de que desea eliminar este producto?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="w-full sm:w-auto dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 text-sm"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={loading}
              className="w-full sm:w-auto text-sm"
            >
              {loading ? <Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" /> : null}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de URL Feed para Facebook */}
      <FacebookFeedDialog
        open={isFacebookFeedOpen}
        onOpenChange={setIsFacebookFeedOpen}
        organizationId={organization?.id}
      />
    </div>
  );
};

export default CatalogoProductos;
