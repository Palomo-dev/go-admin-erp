'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import { 
  Badge,
  InfoIcon,
  Tag,
  PackageIcon,
  Loader2
} from 'lucide-react';
import { Badge as UIBadge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';

import { useOrganization } from '@/lib/hooks/useOrganization';

interface ProductoHeaderProps {
  producto: any;
}

/**
 * Componente que muestra el encabezado del detalle de producto
 * Incluye imagen principal, nombre, SKU, estado, categoría, etc.
 */
const ProductoHeader: React.FC<ProductoHeaderProps> = ({ producto }) => {
  const { theme } = useTheme();
  const { organization } = useOrganization();
  const [selectedImage, setSelectedImage] = useState<number>(0);
  const [showAllImages, setShowAllImages] = useState<boolean>(false);
  const [totalStock, setTotalStock] = useState({
    total: 0,
    reserved: 0,
    available: 0
  });
  const [loadingStock, setLoadingStock] = useState(false);
  console.log('Producto:', producto);
  // Obtener imágenes del producto
  const images = producto.product_images || [];
  // Get the storage_path instead of image_url
  const mainImage = images.length > 0 ? images[selectedImage]?.storage_path : null;

  // Obtener stock total (similar a StockTab)
  useEffect(() => {
    const fetchStockData = async () => {
      if (!organization?.id) return;
      
      try {
        setLoadingStock(true);
        
        // Obtener niveles de stock por sucursal
        const { data: stock, error: stockError } = await supabase
          .from('stock_levels')
          .select(`
            qty_on_hand, 
            qty_reserved
          `)
          .eq('product_id', producto.id);
        
        if (stockError) throw stockError;
        
        // Calcular totales
        const totals = stock?.reduce(
          (acc, curr) => {
            const qtyOnHand = curr.qty_on_hand || 0;
            const qtyReserved = curr.qty_reserved || 0;
            return {
              total: acc.total + qtyOnHand,
              reserved: acc.reserved + qtyReserved,
              available: acc.available + (qtyOnHand - qtyReserved)
            };
          },
          { total: 0, reserved: 0, available: 0 }
        ) || { total: 0, reserved: 0, available: 0 };
        
        setTotalStock(totals);
      } catch (error) {
        console.error('Error al obtener stock:', error);
      } finally {
        setLoadingStock(false);
      }
    };
    
    fetchStockData();
  }, [organization?.id, producto.id]);

  // Función para renderizar el badge de estado
  const renderEstado = (estado: string) => {
    switch (estado?.toLowerCase()) {
      case 'active':
        return (
          <UIBadge className="bg-green-500 hover:bg-green-600">Activo</UIBadge>
        );
      case 'inactive':
        return (
          <UIBadge className="bg-orange-500 hover:bg-orange-600">Inactivo</UIBadge>
        );
      case 'draft':
        return (
          <UIBadge className="bg-gray-500 hover:bg-gray-600">Borrador</UIBadge>
        );
      case 'deleted':
        return (
          <UIBadge className="bg-red-500 hover:bg-red-600">Eliminado</UIBadge>
        );
      default:
        return (
          <UIBadge className="bg-blue-500 hover:bg-blue-600">
            {estado || 'Desconocido'}
          </UIBadge>
        );
    }
  };

  return (
    <div className={`rounded-lg border p-4 ${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
      <div className="flex flex-col md:flex-row gap-6">
        {/* Mini galería */}
        <div className="w-full md:w-1/4">
          <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-gray-100 dark:bg-gray-800">
            {mainImage ? (
              <img 
                src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/organization_images/${mainImage}`} 
                alt={producto.name} 
                className="h-full w-full object-contain"
                onError={(e) => {
                  // Evitar bucles infinitos verificando si ya intentamos cargar la imagen de respaldo
                  const target = e.target as HTMLImageElement;
                  if (!target.dataset.usedFallback) {
                    target.dataset.usedFallback = 'true';
                    target.src = '/placeholder-image.png';
                  } else {
                    // Si ya intentamos cargar la imagen de respaldo y también falló,
                    // mostrar un elemento alternativo
                    target.style.display = 'none';
                    target.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                    const placeholder = document.createElement('div');
                    placeholder.className = 'text-gray-400 text-xs';
                    placeholder.textContent = 'Sin imagen';
                    target.parentElement?.appendChild(placeholder);
                  }
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <PackageIcon className="h-16 w-16 text-gray-400" />
                <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                  Sin imágenes
                </span>
              </div>
            )}
          </div>

          {/* Miniaturas */}
          {images.length > 1 && (
            <div className={`mt-2 grid ${showAllImages ? 'grid-cols-4 md:grid-cols-5' : 'grid-cols-5'} gap-2 ${showAllImages ? 'max-h-60 overflow-y-auto' : ''}`}>
              {/* Mostrar las primeras 5 imágenes o todas dependiendo del estado */}
              {(showAllImages ? images : images.slice(0, 5)).map((image: any, index: number) => (
                <div 
                  key={index}
                  className={`relative aspect-square cursor-pointer overflow-hidden rounded border ${selectedImage === index 
                    ? 'border-blue-500 ring-2 ring-blue-500' 
                    : 'border-gray-200 dark:border-gray-700'}`}
                  onClick={() => setSelectedImage(index)}
                >
                  <img 
                    src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/organization_images/${image.storage_path}`} 
                    alt={`Imagen ${index + 1}`} 
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      // Evitar bucles infinitos verificando si ya intentamos cargar la imagen de respaldo
                      const target = e.target as HTMLImageElement;
                      if (!target.dataset.usedFallback) {
                        target.dataset.usedFallback = 'true';
                        target.src = '/placeholder-image.png';
                      } else {
                        // Si ya intentamos cargar la imagen de respaldo y también falló,
                        // mostrar un elemento alternativo
                        target.style.display = 'none';
                        target.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                        const placeholder = document.createElement('div');
                        placeholder.className = 'text-gray-400 text-xs';
                        placeholder.textContent = 'N/A';
                        target.parentElement?.appendChild(placeholder);
                      }
                    }}
                  />
                </div>
              ))}
              
              {/* Botón para mostrar más imágenes */}
              {!showAllImages && images.length > 5 && (
                <div 
                  className="relative aspect-square flex items-center justify-center rounded border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => setShowAllImages(true)}
                  title="Ver más imágenes"
                >
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    +{images.length - 5}
                  </span>
                </div>
              )}
              
              {/* Botón para mostrar menos imágenes cuando se están mostrando todas */}
              {showAllImages && (
                <div 
                  className="relative aspect-square flex items-center justify-center rounded border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => setShowAllImages(false)}
                  title="Ver menos imágenes"
                >
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    -
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Información principal */}
        <div className="w-full md:w-3/4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              {renderEstado(producto.status)}
              
              <h1 className="text-2xl font-bold">{producto.name}</h1>
            </div>

            <div className="flex flex-wrap gap-y-2">
              <div className="flex items-center mr-6">
                <Tag className="h-4 w-4 mr-1 text-gray-500 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">SKU:</span>
                <span className="ml-1 font-mono">{producto.sku}</span>
              </div>
              
              <div className="flex items-center mr-6">
                <Badge className="h-4 w-4 mr-1 text-gray-500 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Categoría:</span>
                <span className="ml-1">{producto.categories?.name || 'Sin categoría'}</span>
              </div>

              <div className="flex items-center mr-6">
                <InfoIcon className="h-4 w-4 mr-1 text-gray-500 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Unidad:</span>
                <span className="ml-1">{producto.unit_code || 'N/A'}</span>
              </div>
              
              {producto.supplier_id && (
                <div className="flex items-center">
                  <InfoIcon className="h-4 w-4 mr-1 text-gray-500 dark:text-gray-400" />
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Proveedor:</span>
                  <span className="ml-1">{producto.suppliers?.name || 'Sin proveedor'}</span>
                </div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <TooltipProvider>
                <div className={`rounded-md border p-3 ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Precio de venta
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 cursor-help text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Precio de venta al público</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatCurrency(
                      producto.product_prices.reduce((prev: any, current: any) =>
                        current.effective_from > prev.effective_from ? current : prev
                      ).price
                    )}
                  </p>
                </div>
              </TooltipProvider>

              <TooltipProvider>
                <div className={`rounded-md border p-3 ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Costo
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 cursor-help text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Costo de adquisición</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatCurrency(
                      producto.product_costs && producto.product_costs.length > 0
                        ? producto.product_costs.reduce((prev: any, current: any) =>
                            current.effective_from > prev.effective_from ? current : prev
                          ).cost
                        : 0
                    )}
                  </p>
                </div>
              </TooltipProvider>

              <TooltipProvider>
                <div className={`rounded-md border p-3 ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Stock
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 cursor-help text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Stock total disponible</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="mt-1 text-2xl font-semibold">
                    {loadingStock ? 
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" /> : 
                      totalStock.total
                    }
                  </p>
                </div>
              </TooltipProvider>
            </div>

            {producto.description && (
              <div className="mt-3">
                <h3 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Descripción
                </h3>
                <p className={`text-sm rounded-md p-2 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                  {producto.description}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductoHeader;
