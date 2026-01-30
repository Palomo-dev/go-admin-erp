"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Producto, FiltrosProductos, StockSucursal } from './types';
import { supabase } from '@/lib/supabase/config';
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
  const { theme } = useTheme();
  // Router para navegación
  const router = useRouter();
  
  // Estados para gestionar la interfaz y los datos
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
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


  // Cargar productos desde Supabase con una sola consulta eficiente
  useEffect(() => {
    const fetchProductos = async () => {
      try {
        setLoading(true);
        
        // Obtener el ID de organización del almacenamiento local
        let organizationId = null;
        let branchId = null;
        
        if (typeof window !== 'undefined') {
          // Obtener directamente el currentOrganizationId guardado durante la autenticación
          const orgId = localStorage.getItem('currentOrganizationId');
          if (orgId) {
            organizationId = parseInt(orgId, 10);
          }
          
          // Obtener el ID de la sucursal activa
          const activeBranch = localStorage.getItem('currentBranchId');
          if (activeBranch) {
            branchId = parseInt(activeBranch, 10);
          }
          
          // Si no existe en localStorage, buscar en sessionStorage
          if (!organizationId) {
            const sessionOrgId = sessionStorage.getItem('currentOrganizationId');
            if (sessionOrgId) {
              organizationId = parseInt(sessionOrgId, 10);
            }
          }
          
          if (!branchId) {
            const sessionBranchId = sessionStorage.getItem('currentBranchId');
            if (sessionBranchId) {
              branchId = parseInt(sessionBranchId, 10);
            }
          }
          
          // Si aún no hay ID, buscar en el formato anterior (selectedOrganization)
          if (!organizationId) {
            // Intentar formato anterior (compatibilidad)
            const storedOrg = localStorage.getItem('selectedOrganization');
            if (storedOrg) {
              try {
                const parsedOrg = JSON.parse(storedOrg);
                organizationId = parsedOrg.id || parsedOrg.organization_id;
              } catch (e) {
                console.error('Error al parsear organización del localStorage:', e);
              }
            }

            // Verificar en sessionStorage con formato anterior
            if (!organizationId) {
              const sessionOrg = sessionStorage.getItem('selectedOrganization');
              if (sessionOrg) {
                try {
                  const parsedOrg = JSON.parse(sessionOrg);
                  organizationId = parsedOrg.id || parsedOrg.organization_id;
                } catch (e) {
                  console.error('Error al parsear organización del sessionStorage:', e);
                }
              }
            }
          }
        }

        if (!organizationId) {
          throw new Error('No se encontró el ID de la organización');
        }

        // Obtener solo productos principales (no variantes)
        let mainProductsQuery = supabase
          .from('products')
          .select(`
            *,
            categories(id, name),
            children:products(
              *,
              categories(id, name)
            ),
            product_prices(
              id, 
              price, 
              effective_from, 
              effective_to
            ),
            product_costs(
              id,
              cost,
              effective_from,
              effective_to
            ),
            stock_levels(
              branch_id,
              qty_on_hand,
              qty_reserved,
              avg_cost,
              branches(id, name)
            ),
            product_images(
              id, 
              storage_path, 
              is_primary
            )
          `)
          .eq('organization_id', organizationId)
          .is('parent_product_id', null); // Solo productos principales

          // Aplicar filtros
        if (filters.busqueda) {
          mainProductsQuery = mainProductsQuery.or(`name.ilike.%${filters.busqueda}%,sku.ilike.%${filters.busqueda}%,barcode.ilike.%${filters.busqueda}%`);
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
        
        // Ejecutar consulta
        const { data: mainProductsData, error } = await mainProductsQuery;
        
        if (error) throw error;
        
        if (!mainProductsData || mainProductsData.length === 0) {
          setProductos([]);
          setLoading(false);
          return;
        }
        
        // Procesar y formatear los datos obtenidos
        const processedProducts = mainProductsData.map((product: any) => {
          // Obtener el precio actual (el más reciente y vigente)
          let currentPrice = 0;
        
          if (product.product_prices && product.product_prices.length > 0) {
            const validPrices = product.product_prices
              .filter((pp: any) => !pp.effective_to || new Date(pp.effective_to) > new Date())
              .sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
            
            if (validPrices.length > 0) {
              currentPrice = validPrices[0].price;
            }
          }
          
          // Obtener el costo actual (el más reciente y vigente)
          let currentCost = 0;
          if (product.product_costs && product.product_costs.length > 0) {
            const validCosts = product.product_costs
              .filter((pc: any) => !pc.effective_to || new Date(pc.effective_to) > new Date())
              .sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
            
            if (validCosts.length > 0) {
              currentCost = validCosts[0].cost;
            }
          }
          
          // Calcular el stock disponible para la sucursal actual
          let stockTotal = 0;
          let stockBranch = 0;
          
          if (product.stock_levels && product.stock_levels.length > 0) {
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
            cost: currentCost,
            stock: stockTotal,
            stock_branch: stockBranch,
            image_url: imagePath,
            variants: variants
          };
        });

        console.log('processedProducts', processedProducts);  
        
        setProductos(processedProducts);
        
      } catch (error) {
        console.error('Error al cargar productos:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudieron cargar los productos. Intente de nuevo más tarde."
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProductos();
  }, [filters]);

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
          product_prices(id, price, effective_from, effective_to),
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
            product_prices(id, price, effective_from, effective_to),
            product_costs(id, cost, effective_from, effective_to),
            stock_levels(branch_id, qty_on_hand, qty_reserved, branches(id, name)),
            product_images(id, storage_path, is_primary)
          ),
          product_prices(id, price, effective_from, effective_to),
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
      setLoading(true);
      
      // Obtener el ID de la organización del localStorage
      const organizationId = parseInt(localStorage.getItem('organization_id') || '0');
      
      if (!organizationId) {
        throw new Error('No se pudo determinar la organización actual');
      }
      
      // Usar la función deactivate_product con ID de organización explícito
      const { data, error } = await supabase
        .rpc('deactivate_product', { 
          p_product_id: productoToDelete,
          p_organization_id: organizationId
        });
        
      if (error) throw error;
      
      toast({
        title: "Producto eliminado",
        description: "El producto ha sido eliminado correctamente."
      });
      
      // Actualizar lista de productos (eliminarlo de la vista)
      setProductos(productos.filter(p => p.id !== productoToDelete));
    } catch (error: any) {
      console.error('Error al eliminar producto:', error);
      
      // Mensaje de error específico si lo proporciona la función
      const errorMessage = error.message || "No se pudo eliminar el producto. Intente de nuevo más tarde.";
      
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setProductoToDelete(null);
      setLoading(false);
    }
  };

  // Render de botones de acciones por producto
  const RenderAcciones = ({ producto }: { producto: Producto }) => (
    <div className="flex flex-row justify-end gap-2">
      <Button
        variant="outline"
        onClick={() => handleEditar(producto)}
        className={theme === 'dark' ? 'dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700' : ''}
      >
        Editar
      </Button>
      <Button
        variant="outline"
        onClick={() => handleVer(producto)}
        className={theme === 'dark' ? 'dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700' : ''}
      >
        Ver
      </Button>
      <Button
        variant="outline"
        onClick={() => handleDuplicar(producto)}
        className={theme === 'dark' ? 'dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700' : ''}
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

  return (
    <div className="flex flex-col gap-3 sm:gap-4 lg:gap-5">
      {/* Header con título y botón de nuevo */}
      <ProductosPageHeader 
        onCrearClick={handleCrear} 
        onImportarClick={handleImportar}
        onRefreshClick={() => {
          setLoading(true);
          window.location.reload();
        }}
        isRefreshing={loading}
        totalProducts={productos.length}
      />
      
      {/* Filtros de búsqueda */}
      <FiltrosProductosComponent 
        filters={filters}
        onFiltersChange={setFilters}
      />
      
      {/* Tabla de productos */}
      <ProductosTable 
        productos={productos}
        loading={loading}
        onEdit={(producto: Producto) => handleEditar(producto)}
        onView={(producto: Producto) => handleVer(producto)}
        onDelete={(id: string | number) => handleEliminarClick(id)}
        onDuplicate={(producto: Producto) => handleDuplicar(producto)}
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
    </div>
  );
};

export default CatalogoProductos;
