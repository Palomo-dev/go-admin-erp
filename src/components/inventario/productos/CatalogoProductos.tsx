"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { Producto, FiltrosProductos, StockSucursal } from './types';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
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
  const { organization, branch_id } = useOrganization();
  
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
  // Carga híbrida: primera página rápida vía RPC + carga completa en background
  const [backgroundLoading, setBackgroundLoading] = useState<boolean>(false);
  const [fastTotalCount, setFastTotalCount] = useState<number | null>(null);
  const backgroundAbortRef = useRef<{ cancelled: boolean } | null>(null);


  // Carga híbrida — Primera carga rápida vía RPC server-side
  // Trae 50 productos ya calculados (precio/costo/stock vigentes) en 1 request.
  // Mientras tanto, fetchProductos() corre en background para traer TODO.
  const fetchProductosFast = useCallback(async () => {
    if (!organization?.id) {
      setLoading(false);
      return;
    }

    try {
      // Mapear filtros UI → parámetros RPC
      const p_status = filters.mostrarEliminados
        ? 'todos'
        : (filters.estado && filters.estado !== 'todos' ? filters.estado : null);

      const { data, error } = await supabase.rpc('get_catalogo_productos', {
        p_organization_id: organization.id,
        p_page: 1,
        p_page_size: 50,
        p_search: filters.busqueda || null,
        p_category_id: filters.categoria || null,
        p_status,
        p_branch_id: branch_id || null,
        p_sort_by: filters.ordenarPor || 'name',
        p_sort_dir: 'asc',
      });

      if (error) {
        console.error('Error en RPC get_catalogo_productos:', error);
        // Si falla el RPC, caer al flujo completo
        return false;
      }

      if (!data || !data.items || data.items.length === 0) {
        setProductos([]);
        setFastTotalCount(0);
        setLoading(false);
        return true;
      }

      // Mapear items del RPC al tipo Producto
      const fastProducts: Producto[] = data.items.map((item: any) => ({
        id: item.id,
        uuid: item.uuid,
        organization_id: item.organization_id,
        sku: item.sku,
        name: item.name,
        description: item.description,
        category_id: item.category_id,
        category: item.category_id ? { id: item.category_id, name: item.category_name } : undefined,
        unit_code: item.unit_code,
        barcode: item.barcode,
        status: item.status,
        track_stock: item.track_stock,
        parent_product_id: item.parent_product_id,
        is_parent: item.is_parent,
        product_type: item.product_type,
        brand: item.brand,
        reference: item.reference,
        variant_data: item.variant_data,
        station: item.station,
        tax_id: item.tax_id,
        is_composite: item.is_composite,
        production_type: item.production_type,
        created_at: item.created_at,
        updated_at: item.updated_at,
        price: Number(item.out_price) || 0,
        compare_price: Number(item.out_compare_price) || 0,
        cost: Number(item.out_cost) || 0,
        stock: item.out_stock !== null ? Number(item.out_stock) : undefined,
        stock_branch: item.out_stock_branch !== null ? Number(item.out_stock_branch) : undefined,
        // Las relaciones detalladas se cargan en background
        product_prices: [],
        product_costs: [],
        stock_levels: [],
        product_images: [],
        children: [],
        variants: [],
        modifier_groups_count: 0,
      }));

      setProductos(fastProducts);
      setFastTotalCount(data.total || 0);
      setLoading(false);
      return true;
    } catch (error: any) {
      console.error('Error en fetchProductosFast:', error);
      return false;
    }
  }, [organization?.id, branch_id, filters]);

  // Cargar productos desde Supabase con una sola consulta eficiente
  // silent=true: no muestra skeleton (usado después de acciones masivas)
  const fetchProductos = useCallback(async (silent: boolean = false) => {
    if (!organization?.id) {
      console.log('Esperando organization_id...');
      setLoading(false);
      return;
    }

    try {
      if (!silent) setLoading(true);
        
      const organizationId = organization.id;
      const branchId = branch_id;

        // Consulta 1: Productos principales con solo categories (ligero)
        let mainProductsQuery = supabase
          .from('products')
          .select(`
            id, uuid, organization_id, sku, name, description, category_id, unit_code,
            barcode, status, track_stock, parent_product_id, is_parent,
            product_type, brand, reference, variant_data, station,
            tax_id, is_composite, production_type, created_at, updated_at,
            categories(id, name)
          `)
          .eq('organization_id', organizationId)
          .is('parent_product_id', null); // Solo productos principales

          // Aplicar filtros
        if (filters.busqueda) {
          // Usar comillas dobles alrededor del valor para escapar comas en PostgREST
          const searchTerm = filters.busqueda;
          mainProductsQuery = mainProductsQuery.or(`name.ilike."%${searchTerm}%",sku.ilike."%${searchTerm}%",barcode.ilike."%${searchTerm}%"`);
        }
        
        if (filters.categoria) {
          mainProductsQuery = mainProductsQuery.eq('category_id', filters.categoria);
        }
        
        // Filtrar por estado
        if (filters.estado && filters.estado !== 'todos') {
          mainProductsQuery = mainProductsQuery.eq('status', filters.estado);
        } else if (filters.estado === 'todos') {
          // Si se selecciona explícitamente "todos", mostrar todos los productos incluyendo eliminados
        } else {
          // Por defecto (sin filtro de estado), no mostrar productos eliminados
          mainProductsQuery = mainProductsQuery.neq('status', 'deleted');
        }
        
        // Ordenar resultados
        mainProductsQuery = mainProductsQuery.order(filters.ordenarPor, { ascending: true });
        
        // El proyecto de Supabase limita cada respuesta a 1000 filas (config "Max Rows" de PostgREST),
        // sin importar el .limit() del cliente. Para traer TODOS los productos hay que paginar con .range().
        const PAGE_SIZE = 200;
        let mainProductsData: any[] = [];
        for (let page = 0; ; page++) {
          const desde = page * PAGE_SIZE;
          const hasta = desde + PAGE_SIZE - 1;
          const { data: pageData, error } = await mainProductsQuery.range(desde, hasta);

          if (error) {
            console.error('Error de Supabase al cargar productos:', {
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
            });
            throw new Error(`Supabase error: ${error.message || error.code || 'Unknown error'}`);
          }

          if (!pageData || pageData.length === 0) break;
          mainProductsData = mainProductsData.concat(pageData);
          if (pageData.length < PAGE_SIZE) break; // última página
        }
        
        if (mainProductsData.length === 0) {
          setProductos([]);
          setLoading(false);
          return;
        }

        // Consulta 2: Datos relacionados en paralelo (precios, costos, stock, imagenes, children)
        // PostgREST limita cada respuesta a 1000 filas, así que paginamos por lotes de IDs
        const productIds = mainProductsData.map((p: any) => p.id);
        const BATCH_SIZE = 200;

        // PostgREST limita cada respuesta a 1000 filas (config "Max Rows").
        // Un batch de 200 productos puede tener más de 1000 filas relacionadas
        // (ej. product_prices con historial), por lo que paginamos con .range()
        // dentro de cada batch hasta traer todas las filas. Sin esto, los
        // productos cuyas filas caen después del límite quedan sin precio/costo/
        // stock en la lista y muestran "-" en la tabla.
        const ROWS_PER_PAGE = 1000;
        const batchedFetch = async (table: string, select: string, column: string) => {
          const allData: any[] = [];
          for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
            const batch = productIds.slice(i, i + BATCH_SIZE);
            for (let from = 0; ; from += ROWS_PER_PAGE) {
              const to = from + ROWS_PER_PAGE - 1;
              const { data, error } = await supabase
                .from(table)
                .select(select)
                .in(column, batch)
                .range(from, to);
              if (error) throw error;
              if (data && data.length > 0) allData.push(...data);
              if (!data || data.length < ROWS_PER_PAGE) break; // última página
            }
          }
          return allData;
        };

        const [pricesData, costsData, stockData, imagesData, childrenData, modifiersData] = await Promise.all([
          batchedFetch('product_prices', 'id, product_id, price, compare_price, effective_from, effective_to', 'product_id'),
          batchedFetch('product_costs', 'id, product_id, cost, effective_from, effective_to', 'product_id'),
          batchedFetch('stock_levels', 'product_id, branch_id, qty_on_hand, qty_reserved, avg_cost', 'product_id'),
          batchedFetch('product_images', 'id, product_id, storage_path, is_primary', 'product_id'),
          batchedFetch('products', 'id, uuid, sku, name, parent_product_id, product_type, brand, reference, status, category_id, track_stock, categories(id, name), stock_levels(branch_id, qty_on_hand, qty_reserved)', 'parent_product_id'),
          batchedFetch('product_modifier_groups', 'id, product_id', 'product_id'),
        ]);

        // Mapear cantidad de grupos de modificadores por product_id
        const modifiersCountMap = new Map<number, number>();
        modifiersData.forEach((mg: any) => {
          const pid = mg.product_id;
          modifiersCountMap.set(pid, (modifiersCountMap.get(pid) ?? 0) + 1);
        });

        // Mapear datos relacionados por product_id
        const pricesMap = new Map<number, any[]>();
        pricesData.forEach((p: any) => {
          if (!pricesMap.has(p.product_id)) pricesMap.set(p.product_id, []);
          pricesMap.get(p.product_id)!.push(p);
        });

        const costsMap = new Map<number, any[]>();
        costsData.forEach((c: any) => {
          if (!costsMap.has(c.product_id)) costsMap.set(c.product_id, []);
          costsMap.get(c.product_id)!.push(c);
        });

        const stockMap = new Map<number, any[]>();
        stockData.forEach((s: any) => {
          if (!stockMap.has(s.product_id)) stockMap.set(s.product_id, []);
          stockMap.get(s.product_id)!.push(s);
        });

        const imagesMap = new Map<number, any[]>();
        imagesData.forEach((img: any) => {
          if (!imagesMap.has(img.product_id)) imagesMap.set(img.product_id, []);
          imagesMap.get(img.product_id)!.push(img);
        });

        const childrenMap = new Map<number, any[]>();
        childrenData.forEach((child: any) => {
          const parentId = child.parent_product_id;
          if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
          childrenMap.get(parentId)!.push(child);
        });

        // Añadir datos relacionados a cada producto
        mainProductsData = mainProductsData.map((product: any) => ({
          ...product,
          product_prices: pricesMap.get(product.id) || [],
          product_costs: costsMap.get(product.id) || [],
          stock_levels: stockMap.get(product.id) || [],
          product_images: imagesMap.get(product.id) || [],
          children: childrenMap.get(product.id) || [],
          modifier_groups_count: modifiersCountMap.get(product.id) ?? 0,
        }));
        
        // Procesar y formatear los datos obtenidos
        const processedProducts = mainProductsData.map((product: any) => {
          // Obtener el precio actual (el más reciente y vigente)
          let currentPrice = 0;
          let comparePrice = 0;
        
          if (product.product_prices && product.product_prices.length > 0) {
            const validPrices = product.product_prices
              .filter((pp: any) => !pp.effective_to || new Date(pp.effective_to) > new Date())
              .sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
            
            if (validPrices.length > 0) {
              currentPrice = Number(validPrices[0].price) || 0;
              comparePrice = Number(validPrices[0].compare_price) || 0;
            }
          }
          
          // Obtener el costo actual (el más reciente y vigente)
          let currentCost = 0;
          if (product.product_costs && product.product_costs.length > 0) {
            const validCosts = product.product_costs
              .filter((pc: any) => !pc.effective_to || new Date(pc.effective_to) > new Date())
              .sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
            
            if (validCosts.length > 0) {
              currentCost = Number(validCosts[0].cost) || 0;
            }
          }
          
          // Calcular el stock disponible para la sucursal actual
          let stockTotal: number | undefined = 0;
          let stockBranch: number | undefined = 0;

          // Si el producto no rastrea inventario, no mostrar stock
          if (product.track_stock === false) {
            stockTotal = undefined;
            stockBranch = undefined;
          } else if (product.stock_levels && product.stock_levels.length > 0) {
            // Stock total en todas las sucursales
            stockTotal = product.stock_levels.reduce((sum: number, sl: any) => {
              return sum + (sl.qty_on_hand || 0) - (sl.qty_reserved || 0);
            }, 0);
            
            // Stock en la sucursal actual (si se ha seleccionado una)
            if (branchId) {
              const branchStock = product.stock_levels.find((sl: any) => sl.branch_id === branchId);
              if (branchStock) {
                stockBranch = (branchStock.qty_on_hand || 0) - (branchStock.qty_reserved || 0);
              }
            }
          }
          
          // Para productos padre, sumar stock de variantes hijas
          if (product.is_parent && product.children && product.children.length > 0 && stockTotal !== undefined) {
            product.children.forEach((child: any) => {
              if (child.stock_levels && child.stock_levels.length > 0) {
                stockTotal += child.stock_levels.reduce((sum: number, sl: any) => {
                  return sum + (sl.qty_on_hand || 0) - (sl.qty_reserved || 0);
                }, 0);
                
                if (branchId && stockBranch !== undefined) {
                  const childBranchStock = child.stock_levels.find((sl: any) => sl.branch_id === branchId);
                  if (childBranchStock) {
                    stockBranch += (childBranchStock.qty_on_hand || 0) - (childBranchStock.qty_reserved || 0);
                  }
                }
              }
            });
          }
          
          // Obtener la ruta de almacenamiento de la imagen principal si existe
          let imagePath = null;
          if (product.product_images && product.product_images.length > 0) {
            const primaryImage = product.product_images.find((img: any) => img.is_primary);
            if (primaryImage && primaryImage.storage_path) {
              imagePath = primaryImage.storage_path;
            }
          }
          
          // Procesar variantes (productos hijos)
          const variants = product.children ? product.children.map((child: any) => {
            // Aplicar la misma lógica de procesamiento a cada variante
            let childPrice = 0;
            // Para las variantes, podríamos necesitar consultar sus precios por separado si no se incluyen
            // en la consulta principal, pero por ahora usamos el valor de la variante directamente
            
            return {
              ...child,
              category: child.categories,
              price: childPrice || 0,
              cost: 0, // Similar a price, necesitaríamos consultar esto por separado
              stock: 0  // Lo mismo para stock
            };
          }) : [];
          
          // Retornar el producto formateado con toda la información
          return {
            ...product,
            category: product.categories,
            price: currentPrice,
            compare_price: comparePrice,
            cost: currentCost,
            stock: stockTotal,
            stock_branch: stockBranch,
            image_url: imagePath,
            variants: variants,
            modifier_groups_count: product.modifier_groups_count ?? 0,
          };
        });

        console.log('processedProducts', processedProducts);  
        
        setProductos(processedProducts);
        
      } catch (error: any) {
        console.error('Error al cargar productos:', {
          message: error?.message,
          name: error?.name,
          stack: error?.stack,
          raw: error,
        });
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudieron cargar los productos. Intente de nuevo más tarde."
        });
      } finally {
        if (!silent) setLoading(false);
      }
    }, [organization?.id, branch_id, filters]);

  // Carga híbrida al montar y cuando cambian filtros/organización
  // 1. fetchProductosFast() → 50 productos vía RPC en < 1s (quita skeleton)
  // 2. fetchProductos(true) → carga completa en background (sin skeleton)
  //    Cuando termina, reemplaza la lista y habilita filtros/acciones masivas
  useEffect(() => {
    // Evitar doble ejecución en React Strict Mode (desarrollo)
    const fetchKey = JSON.stringify([organization?.id, branch_id, filters, refreshKey]);
    if (lastFetchKey.current === fetchKey) return;
    lastFetchKey.current = fetchKey;

    // Cancelar carga en background anterior si aún está corriendo
    if (backgroundAbortRef.current) {
      backgroundAbortRef.current.cancelled = true;
    }
    const abortToken = { cancelled: false };
    backgroundAbortRef.current = abortToken;

    (async () => {
      setLoading(true);
      // 1. Carga rápida vía RPC
      const ok = await fetchProductosFast();
      // 2. Carga completa en background (silent=true para no mostrar skeleton)
      setBackgroundLoading(true);
      await fetchProductos(true);
      if (!abortToken.cancelled) {
        setBackgroundLoading(false);
        setFastTotalCount(null); // ya tenemos todos, no necesitamos el total parcial
      }
    })();
  }, [organization?.id, branch_id, filters, refreshKey, fetchProductosFast, fetchProductos]);

  // Suscripción en tiempo real a cambios en products, stock_levels, product_prices
  // y product_costs para que la lista se actualice sin recargar manualmente.
  // Se usa un debounce suave (1.5s) para agrupar ráfagas de cambios y evitar
  // recargas múltiples cuando se editan varios campos a la vez.
  useEffect(() => {
    if (!organization?.id) return;
    const orgId = organization.id;

    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        // silent=true para no mostrar skeleton y mantener la UI estable
        fetchProductos(true);
      }, 1500);
    };

    const channel = supabase
      .channel('productos_catalogo_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `organization_id=eq.${orgId}` },
        scheduleReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_levels' },
        scheduleReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_prices' },
        scheduleReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_costs' },
        scheduleReload
      )
      .subscribe();

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
    // fetchProductos es estable por useCallback; organization.id cambia el canal
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (productos.length === 0) {
      toast({ title: 'Sin productos', description: 'No hay productos para exportar.' });
      return;
    }

    if (!organization?.id) {
      toast({ title: 'Error', description: 'No hay organización seleccionada.' });
      return;
    }

    const productIds = productos.map(p => Number(p.id)).filter(id => !isNaN(id));

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

    productos.forEach((p) => {
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

    toast({ title: 'Exportación exitosa', description: `Se exportaron ${productos.length} productos.` });
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
        totalProducts={productos.length}
        backgroundLoading={backgroundLoading}
        fastTotalCount={fastTotalCount}
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
