"use client";

import React, { useState, useEffect } from 'react';
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
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { 
  BadgeCheck, 
  Loader2, 
  MoreHorizontal, 
  Pencil, 
  Eye, 
  Trash2,
  Copy,
  PackageIcon
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { Producto } from './types';
import Image from 'next/image';
import { supabase } from '@/lib/supabase/config';


interface ProductosTableProps {
  productos: Producto[];
  loading: boolean;
  onEdit: (producto: Producto) => void;
  onView: (producto: Producto) => void;
  onDelete: (id: number) => void;
  onDuplicate: (producto: Producto) => void;
}

// Interfaz para las imágenes de productos
interface ProductImage {
  id: number;
  product_id: number;
  image_url: string;
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
  onDuplicate
}) => {
  const { theme } = useTheme();
  
  // Estado para la paginación
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  
  // Estado para almacenar las imágenes principales de los productos
  const [productImages, setProductImages] = useState<Record<number, string>>({});
  
  // Cálculo de productos por página
  const indexOfLastProduct = currentPage * pageSize;
  const indexOfFirstProduct = indexOfLastProduct - pageSize;
  const currentProductos = productos.slice(indexOfFirstProduct, indexOfLastProduct);
  const totalPages = Math.ceil(productos.length / pageSize);
  
  // Cargar las imágenes principales de los productos cuando cambia la lista
  useEffect(() => {
    const fetchProductImages = async () => {
      if (productos.length === 0) return;
      
      // Obtener IDs de productos para filtrar
      const productIds = productos.map(p => p.id);
      
      // Consultar imágenes principales (is_primary = true)
      const { data, error } = await supabase
        .from('product_images')
        .select('id, product_id, image_url, storage_path, is_primary')
        .in('product_id', productIds)
        .eq('is_primary', true);
        
      if (error) {
        console.error('Error al cargar imágenes de productos:', error);
        return;
      }
      
      // Crear un mapa de productId -> imageUrl
      const imageMap: Record<number, string> = {};
      if (data) {
        data.forEach((img: ProductImage) => {
          imageMap[img.product_id] = img.image_url;
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
            <span className={`w-2 h-2 rounded-full mr-2 ${theme === 'dark' ? 'bg-green-500' : 'bg-green-500'}`}></span>
            <span>Activo</span>
          </div>
        );
      case 'inactive':
        return (
          <div className="flex items-center">
            <span className={`w-2 h-2 rounded-full mr-2 ${theme === 'dark' ? 'bg-gray-500' : 'bg-gray-400'}`}></span>
            <span>Inactivo</span>
          </div>
        );
      case 'discontinued':
        return (
          <div className="flex items-center">
            <span className={`w-2 h-2 rounded-full mr-2 ${theme === 'dark' ? 'bg-red-500' : 'bg-red-500'}`}></span>
            <span>Descontinuado</span>
          </div>
        );
      case 'deleted':
        return (
          <div className="flex items-center">
            <span className={`w-2 h-2 rounded-full mr-2 ${theme === 'dark' ? 'bg-purple-500' : 'bg-purple-500'}`}></span>
            <span>Eliminado</span>
          </div>
        );
      default:
        return <span>{estado || 'No definido'}</span>;
    }
  };
  
  // Función para determinar el color de fondo según stock
  const getBgColorByStock = (stock: number | undefined, trackStock: boolean) => {
    // Si no se rastrea el stock, no hay color especial
    if (!trackStock) return '';
    
    // Si no hay stock definido, dejamos el color predeterminado
    if (stock === undefined) return '';
    
    if (stock <= 0) {
      return theme === 'dark' 
        ? 'bg-red-950/30 dark:border-red-800/30' 
        : 'bg-red-50 border-red-100';
    } else if (stock < 5) { // Esto debería ser un umbral configurable
      return theme === 'dark' 
        ? 'bg-amber-950/30 dark:border-amber-800/30' 
        : 'bg-amber-50 border-amber-100';
    }
    
    return '';
  };

  if (loading) {
    return (
      <div className={`rounded-lg border p-8 text-center ${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
        <p className={`mt-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          Cargando productos...
        </p>
      </div>
    );
  }

  if (productos.length === 0) {
    return (
      <div className={`rounded-lg border p-8 text-center ${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
        <p className={`text-lg font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          No se encontraron productos
        </p>
        <p className={`mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          Intente con otros filtros o cree un nuevo producto.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border shadow-sm overflow-hidden ${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className={theme === 'dark' ? 'bg-gray-950' : 'bg-gray-50'}>
            <TableRow>
              <TableHead className="w-[80px]">Imagen</TableHead>
              <TableHead className="w-[100px]">Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-center">Stock</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[100px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentProductos.map((producto) => (
              <TableRow 
                key={producto.id}
                className={`${getBgColorByStock(producto.stock, producto.track_stock)}`}
              >
                <TableCell>
                  <div className="relative h-14 w-14 rounded-md overflow-hidden border bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    {productImages[producto.id] ? (
                      <img
                        src={productImages[producto.id]}
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
                      <span className="text-gray-400 text-xs">Sin imagen</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono">{producto.sku}</TableCell>
                <TableCell className="font-medium">{producto.name}</TableCell>
                <TableCell>{producto.category?.name || '-'}</TableCell>
                <TableCell className="text-right">{formatCurrency(producto.price)}</TableCell>
                <TableCell className="text-right">{formatCurrency(producto.cost)}</TableCell>
                <TableCell className="text-center">
                  {producto.track_stock 
                    ? <span className={producto.stock && producto.stock <= 0 ? 'text-red-500 font-semibold' : ''}>{producto.stock || 0}</span>
                    : <span className="text-gray-400">N/A</span>
                  }
                </TableCell>
                <TableCell>{renderEstado(producto.status)}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        className="h-8 w-8 p-0"
                      >
                        <span className="sr-only">Abrir menú</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      align="end"
                      className={theme === 'dark' ? 'dark:bg-gray-950 dark:border-gray-800' : ''}
                    >
                      <DropdownMenuItem 
                        onClick={() => onView(producto)}
                        className={theme === 'dark' ? 'dark:hover:bg-gray-900 dark:focus:bg-gray-900' : ''}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        <span>Ver detalles</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => onEdit(producto)}
                        className={theme === 'dark' ? 'dark:hover:bg-gray-900 dark:focus:bg-gray-900' : ''}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        <span>Editar</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => onDuplicate(producto)}
                        className={theme === 'dark' ? 'dark:hover:bg-gray-900 dark:focus:bg-gray-900' : ''}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        <span>Duplicar</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => onDelete(producto.id)}
                        className={`text-red-600 ${theme === 'dark' ? 'dark:hover:bg-gray-900 dark:focus:bg-gray-900' : ''}`}
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
      <div className={`flex justify-between items-center px-4 py-3 border-t ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
        <div className="flex items-center space-x-2">
          <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Mostrar</span>
          <select
            className={`border rounded-md px-1 py-1 text-sm ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1); // Reset a la primera página al cambiar el tamaño
            }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            de {productos.length} productos
          </span>
        </div>
        
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev: number) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            Anterior
          </Button>
          
          <span className={`flex items-center px-3 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
            {currentPage} de {totalPages || 1}
          </span>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev: number) => Math.min(prev + 1, totalPages))}
            disabled={currentPage >= totalPages}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProductosTable;
