"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BadgeCheck, 
  Loader2, 
  MoreHorizontal, 
  Pencil, 
  Eye, 
  Trash2,
  Copy,
  PackageIcon,
  ExternalLink
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { Producto } from './types';
import Image from 'next/image';
import { supabase } from '@/lib/supabase/config';
import { useOrgCurrency, formatMonedaSinDecimales } from '@/lib/hooks/useOrgCurrency';
// Using direct Supabase storage calls for URL generation


interface ProductosTableProps {
  productos: Producto[];
  loading: boolean;
  onEdit: (producto: Producto) => void;
  onView: (producto: Producto) => void;
  onDelete: (id: string | number) => void;
  onDuplicate: (producto: Producto) => void;
  selectedIds?: number[];
  onSelectionChange?: (ids: number[]) => void;
}

// Interfaz para las imágenes de productos
interface ProductImage {
  id: number;
  product_id: number;
  storage_path: string;
  is_primary: boolean;
}

/**
 * Tabla para mostrar el listado de productos con sus acciones
 */
const ProductosTable: React.FC<ProductosTableProps> = ({
  productos,
  loading,
  onEdit,
  onView,
  onDelete,
  onDuplicate,
  selectedIds = [],
  onSelectionChange
}) => {
  const { theme } = useTheme();
  const orgCurrency = useOrgCurrency();
  // Formato sin decimales para la tabla usando la moneda de la organización
  const formatPrecioTabla = (value: number): string =>
    formatMonedaSinDecimales(value, orgCurrency);
  
  // Estado para la paginación
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  
  // Estado para almacenar las imágenes principales de los productos
  const [productImages, setProductImages] = useState<Record<string | number, string>>({});
  
  // Cálculo de productos por página
  const indexOfLastProduct = currentPage * pageSize;
  const indexOfFirstProduct = indexOfLastProduct - pageSize;
  const currentProductos = productos.slice(indexOfFirstProduct, indexOfLastProduct);
  const totalPages = Math.ceil(productos.length / pageSize);

  // Lógica de selección múltiple
  const numericIds = currentProductos
    .map(p => typeof p.id === 'number' ? p.id : parseInt(String(p.id), 10))
    .filter(id => !isNaN(id));
  const allPageSelected = numericIds.length > 0 && numericIds.every(id => selectedIds.includes(id));

  const toggleSelectAll = () => {
    if (!onSelectionChange) return;
    if (allPageSelected) {
      onSelectionChange(selectedIds.filter(id => !numericIds.includes(id)));
    } else {
      onSelectionChange([...new Set([...selectedIds, ...numericIds])]);
    }
  };

  const toggleSelect = (productoId: number | string) => {
    if (!onSelectionChange) return;
    const id = typeof productoId === 'number' ? productoId : parseInt(String(productoId), 10);
    if (isNaN(id)) return;
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(sid => sid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };
  
  // Cargar las imágenes principales de los productos cuando cambia la lista
  useEffect(() => {
    // Si no hay productos, no hacemos nada
    if (!productos?.length) return;
    
    const fetchProductImages = async () => {
      console.log('Fetching product images for', productos.length, 'products');
      
      // Extraer IDs de productos
      const productIds = productos.map(p => p.id);
      
      // Consultar imágenes principales para estos productos
      const { data, error } = await supabase
        .from('product_images')
        .select('id, product_id, storage_path, is_primary')
        .in('product_id', productIds)
        .eq('is_primary', true);
        
      if (error) {
        console.error('Error al cargar imágenes de productos:', error);
        return;
      }
      
      console.log('Received product images data:', data);
      
      // Crear un mapa de productId -> URL pública
      const imageMap: Record<string | number, string> = {};
      if (data && data.length > 0) {
        data.forEach((img: ProductImage) => {
          if (!img.storage_path) return;
          
          // Generar URL pública usando supabase.storage (detectar bucket correcto)
          const bucket = img.storage_path.startsWith('products/') ? 'product-images' : 'organization_images';
          const { data: urlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(img.storage_path);
          
          if (urlData?.publicUrl) {
            imageMap[img.product_id] = urlData.publicUrl;
          }
        });
      }
      
      setProductImages(imageMap);
    };
    
    fetchProductImages();
  }, [productos]);
  
  // Función para renderizar estado del producto
  const renderEstado = (estado: string) => {
    switch (estado?.toLowerCase()) {
      case 'active':
        return (
          <div className="flex items-center">
            <span className="w-2 h-2 rounded-full mr-2 bg-green-500 dark:bg-green-400"></span>
            <span className="text-sm dark:text-gray-200">Activo</span>
          </div>
        );
      case 'inactive':
        return (
          <div className="flex items-center">
            <span className="w-2 h-2 rounded-full mr-2 bg-gray-400 dark:bg-gray-500"></span>
            <span className="text-sm dark:text-gray-200">Inactivo</span>
          </div>
        );
      case 'discontinued':
        return (
          <div className="flex items-center">
            <span className="w-2 h-2 rounded-full mr-2 bg-red-500"></span>
            <span className="text-sm dark:text-gray-200">Descontinuado</span>
          </div>
        );
      case 'deleted':
        return (
          <div className="flex items-center">
            <span className="w-2 h-2 rounded-full mr-2 bg-purple-500"></span>
            <span className="text-sm dark:text-gray-200">Eliminado</span>
          </div>
        );
      default:
        return <span>{estado || 'No definido'}</span>;
    }
  };
  
  // Función para determinar el color de fondo según stock
  const getBgColorByStock = (stock: number | undefined, trackStock?: boolean) => {
    // Si no rastrea inventario o no hay stock definido, color predeterminado
    if (trackStock === false || stock === undefined) return '';
    
    if (stock <= 0) {
      return 'bg-red-50 dark:bg-red-950/30';
    } else if (stock < 5) {
      return 'bg-amber-50 dark:bg-amber-950/30';
    }
    
    return '';
  };

  if (loading) {
    return (
      <div className="rounded-lg border shadow-sm overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        {/* Skeleton header */}
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3">
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20 hidden md:block" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24 hidden lg:block" />
            <Skeleton className="h-4 w-16 ml-auto" />
            <Skeleton className="h-4 w-16 hidden xl:block" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20 hidden sm:block" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        {/* Skeleton rows */}
        {[...Array(8)].map((_, i) => (
          <div key={i} className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-4 shrink-0" />
              <Skeleton className="h-12 w-12 sm:h-14 sm:w-14 rounded-md shrink-0" />
              <Skeleton className="h-4 w-20 hidden md:block" />
              <Skeleton className="h-4 w-40 sm:w-48" />
              <Skeleton className="h-4 w-24 hidden lg:block" />
              <Skeleton className="h-4 w-16 ml-auto" />
              <Skeleton className="h-4 w-16 hidden xl:block" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-4 w-20 hidden sm:block" />
              <Skeleton className="h-8 w-8 rounded-md shrink-0" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (productos.length === 0) {
    return (
      <div className="rounded-lg border p-6 sm:p-8 text-center bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <PackageIcon className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-gray-400 dark:text-gray-500 mb-3" />
        <p className="text-base sm:text-lg font-semibold text-gray-700 dark:text-gray-300">
          No se encontraron productos
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Intente con otros filtros o cree un nuevo producto.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow-sm overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-gray-50 dark:bg-gray-800">
            <TableRow className="dark:border-gray-700">
              {onSelectionChange && (
                <TableHead className="w-[40px]">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    title="Seleccionar todos en esta página"
                  />
                </TableHead>
              )}
              <TableHead className="w-[60px] sm:w-[80px] text-xs sm:text-sm dark:text-gray-300">Imagen</TableHead>
              <TableHead className="hidden md:table-cell w-[80px] sm:w-[100px] text-xs sm:text-sm dark:text-gray-300">Código</TableHead>
              <TableHead className="text-xs sm:text-sm dark:text-gray-300">Nombre</TableHead>
              <TableHead className="hidden lg:table-cell text-xs sm:text-sm dark:text-gray-300">Categoría</TableHead>
              <TableHead className="text-right text-xs sm:text-sm dark:text-gray-300">Precio</TableHead>
              <TableHead className="hidden xl:table-cell text-right text-xs sm:text-sm dark:text-gray-300">Costo</TableHead>
              <TableHead className="text-center text-xs sm:text-sm dark:text-gray-300">Stock</TableHead>
              <TableHead className="hidden sm:table-cell text-xs sm:text-sm dark:text-gray-300">Estado</TableHead>
              <TableHead className="w-[60px] sm:w-[80px] text-right text-xs sm:text-sm dark:text-gray-300">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentProductos.map((producto) => (
              <TableRow 
                key={typeof producto.id === 'number' ? producto.id : String(producto.id)}
                className={`dark:border-gray-700 ${getBgColorByStock(producto.stock, producto.track_stock)} cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${selectedIds.includes(typeof producto.id === 'number' ? producto.id : parseInt(String(producto.id), 10)) ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
                onClick={() => onView(producto)}
              >
                {onSelectionChange && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(typeof producto.id === 'number' ? producto.id : parseInt(String(producto.id), 10))}
                      onChange={() => toggleSelect(producto.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </TableCell>
                )}
                <TableCell>
                  <div className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-md overflow-hidden border dark:border-gray-600 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    {productImages[String(producto.id)] ? (
                      <img
                        src={productImages[String(producto.id)]}
                        alt={producto.name}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          // Evitar bucles infinitos verificando si ya intentamos cargar la imagen de respaldo
                          const target = e.target as HTMLImageElement;
                          if (!target.dataset.usedFallback) {
                            target.dataset.usedFallback = 'true';
                            target.src = '/placeholder-image.png';
                          } else {
                            // Si ya intentamos cargar la imagen de respaldo y también falló,
                            // mostrar un elemento alternativo en lugar de intentar cargar otra imagen
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
                      <span className="text-gray-400 dark:text-gray-500 text-xs">Sin imagen</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell font-mono text-xs sm:text-sm dark:text-gray-300">{producto.sku}</TableCell>
                <TableCell className="font-medium text-xs sm:text-sm dark:text-gray-200">
                  <div className="max-w-[150px] sm:max-w-none truncate">{producto.name}</div>
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs sm:text-sm dark:text-gray-300">{producto.category?.name || '-'}</TableCell>
                <TableCell className="text-right text-xs sm:text-sm dark:text-gray-300">
                  {typeof producto.price === 'number' ? (
                    <div>
                      <span className="font-semibold">{formatPrecioTabla(producto.price)}</span>
                      {typeof producto.compare_price === 'number' && producto.compare_price > producto.price && (
                        <>
                          <span className="block text-xs text-gray-400 line-through">{formatPrecioTabla(producto.compare_price)}</span>
                          <span className="text-xs text-red-500 font-medium">-{Math.round((1 - producto.price / producto.compare_price) * 100)}%</span>
                        </>
                      )}
                    </div>
                  ) : '-'}
                </TableCell>
                <TableCell className="hidden xl:table-cell text-right text-xs sm:text-sm dark:text-gray-300">{typeof producto.cost === 'number' ? formatPrecioTabla(producto.cost) : '-'}</TableCell>
                <TableCell className="text-center text-xs sm:text-sm">
                  {producto.track_stock === false ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />
                      Sin seguimiento
                    </span>
                  ) : (
                    <span className={`font-semibold ${producto.stock !== undefined && producto.stock <= 0 ? 'text-red-500' : 'dark:text-gray-200'}`}>{producto.stock ?? 0}</span>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">{renderEstado(producto.status)}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <span className="sr-only">Abrir menú</span>
                        <MoreHorizontal className="h-4 w-4 dark:text-gray-300" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      align="end"
                      className="dark:bg-gray-800 dark:border-gray-700 w-48"
                    >
                      <DropdownMenuItem 
                        onClick={() => onView(producto)}
                        className="cursor-pointer"
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        <span>Ver detalle</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => onEdit(producto)}
                        className="cursor-pointer"
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        <span>Editar</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => onDuplicate(producto)}
                        className="cursor-pointer"
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        <span>Duplicar</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => onDelete(producto.id)}
                        className="text-red-600 dark:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        <span>Eliminar</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {/* Paginación */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-3 sm:px-4 py-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Mostrar</span>
          <select
            className="border rounded-md px-2 py-1 text-xs sm:text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            de {productos.length}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev: number) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <span className="hidden sm:inline">Anterior</span>
            <span className="sm:hidden">«</span>
          </Button>
          
          <span className="flex items-center px-2 sm:px-3 text-xs sm:text-sm text-gray-700 dark:text-gray-300">
            {currentPage} / {totalPages || 1}
          </span>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev: number) => Math.min(prev + 1, totalPages))}
            disabled={currentPage >= totalPages}
            className="text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <span className="hidden sm:inline">Siguiente</span>
            <span className="sm:hidden">»</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProductosTable;
