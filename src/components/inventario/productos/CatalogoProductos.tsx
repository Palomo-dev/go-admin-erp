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


  // Cargar productos desde Supabase
  useEffect(() => {
    const fetchProductos = async () => {
      try {
        setLoading(true);
        
        // Obtener el ID de organización del almacenamiento local
        let organizationId = null;
        
        if (typeof window !== 'undefined') {
          // Obtener directamente el currentOrganizationId guardado durante la autenticación
          const orgId = localStorage.getItem('currentOrganizationId');
          if (orgId) {
            organizationId = parseInt(orgId, 10);
          }
          
          // Si no existe en localStorage, buscar en sessionStorage
          if (!organizationId) {
            const sessionOrgId = sessionStorage.getItem('currentOrganizationId');
            if (sessionOrgId) {
              organizationId = parseInt(sessionOrgId, 10);
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

        // Construir consulta base
        let query = supabase
          .from('products')
          .select('*, categories(id, name)') // Incluir información de categorías
          .eq('organization_id', organizationId);
        
        // Aplicar filtros
        if (filters.busqueda) {
          query = query.or(`name.ilike.%${filters.busqueda}%,sku.ilike.%${filters.busqueda}%,barcode.ilike.%${filters.busqueda}%`);
        }
        
        if (filters.categoria) {
          query = query.eq('category_id', filters.categoria);
        }
        
        // Si se selecciona un estado específico, filtrar por ese estado
        if (filters.estado && filters.estado !== 'todos') {
          query = query.eq('status', filters.estado);
        } else if (filters.estado === 'todos') {
          // Si se selecciona explícitamente "todos", mostrar todos los productos incluyendo eliminados
          // No aplicamos ningún filtro adicional
        } else {
          // Por defecto (sin filtro de estado), no mostrar productos eliminados
          query = query.neq('status', 'deleted');
        }
        
        // Ordenar resultados
        query = query.order(filters.ordenarPor, { ascending: true });
        
        // Ejecutar consulta
        const { data, error } = await query;
        
        if (error) throw error;
        
        // Formatear productos y obtener información adicional de stock
        const formattedProductos = data.map((producto: any) => ({
          ...producto,
          category: producto.categories
        }));
        
        // Obtener información de stock para cada producto
        await fetchStockInfo(formattedProductos);

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
      // Obtener stock por sucursal para el producto seleccionado
      const { data: stockData, error: stockError } = await supabase
        .from('stock_levels')
        .select('branch_id, qty_on_hand, branches(id, name)')
        .eq('product_id', productId);
      
      if (stockError) throw stockError;
      
      // Formatear datos de stock por sucursal
      const formattedStockData: StockSucursal[] = stockData.map((item: any) => ({
        branch_id: item.branch_id,
        branch_name: item.branches?.name || 'Sucursal sin nombre',
        product_id: productId,
        qty: item.qty_on_hand || 0
      }));
      
      setStockPorSucursal(formattedStockData);
    } catch (error) {
      console.error('Error al obtener stock por sucursal:', error);
      setStockPorSucursal([]);
    }
  };

  // Función para obtener información de stock agregada
  const fetchStockInfo = async (productsArray: Producto[]) => {
    try {
      // IDs de los productos para consulta
      const productIds = productsArray.map((p: any) => p.id);
      
      if (productIds.length === 0) {
        setProductos([]);
        return;
      }
      
      // Obtener stock por producto y sucursal
      const { data: stockData, error: stockError } = await supabase
        .from('stock_levels')
        .select('product_id, branch_id, qty_on_hand')
        .in('product_id', productIds);
      
      if (stockError) throw stockError;
      
      // Agrupar stock por producto
      const stockByProduct: { [key: number]: number } = {};
      
      stockData?.forEach((item: any) => {
        if (!stockByProduct[item.product_id]) {
          stockByProduct[item.product_id] = 0;
        }
        stockByProduct[item.product_id] += item.qty_on_hand || 0;
      });
      
      // Actualizar productos con información de stock
      const productsWithStock = productsArray.map((producto: any) => ({
        ...producto,
        stock: stockByProduct[producto.id] || 0
      }));
      
      setProductos(productsWithStock);
    } catch (error) {
      console.error('Error al obtener información de stock:', error);
    }
  };

  // Funciones para gestionar los dialogos y acciones CRUD
  const handleCrear = () => {
    // Redireccionar a la nueva página de creación de productos
    router.push('/app/inventario/productos/nuevo');
  };

  const handleEditar = (producto: Producto) => {
    // Redireccionar a la página de edición del producto
    router.push(`/app/inventario/productos/${producto.id}/editar`);
  };

  const handleDuplicar = (producto: Producto) => {
    // Clonar el producto pero eliminar el ID y modificar SKU para que sea único
    const duplicatedProduct = {
      ...producto,
      id: 0, // Usar 0 temporalmente, se asignará un nuevo ID al guardar
      sku: `${producto.sku}-COPIA`,
      name: `${producto.name} (Copia)`
    } as Producto;
    
    setSelectedProducto(duplicatedProduct);
  };

  const handleVer = async (producto: Producto) => {
    // Redireccionar a la página de detalle del producto
    router.push(`/app/inventario/productos/${producto.id}`);
  };

  const handleEliminarClick = (id: number) => {
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
    <div className="flex flex-col gap-5">
      {/* Header con título y botón de nuevo */}
      <ProductosPageHeader onCrearClick={handleCrear} />
      
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
        onDelete={(id: number) => handleEliminarClick(id)}
        onDuplicate={(producto: Producto) => handleDuplicar(producto)}
      />
      
      {/* Diálogo de confirmación para eliminar */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className={`sm:max-w-md ${theme === 'dark' ? 'dark:bg-gray-950 dark:text-gray-200' : 'bg-white text-gray-800'}`}>
          <DialogHeader>
            <DialogTitle>¿Eliminar producto?</DialogTitle>
            <DialogDescription className={theme === 'dark' ? 'dark:text-gray-400' : 'text-gray-500'}>
              Esta acción no se puede deshacer. ¿Está seguro de que desea eliminar este producto?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row justify-end gap-3 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              className={theme === 'dark' ? 'dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700' : ''}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={loading}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CatalogoProductos;
