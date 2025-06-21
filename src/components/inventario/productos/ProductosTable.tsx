"use client";

import React from 'react';
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
  Copy 
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { Producto } from './types';

interface ProductosTableProps {
  productos: Producto[];
  loading: boolean;
  onEdit: (producto: Producto) => void;
  onView: (producto: Producto) => void;
  onDelete: (id: number) => void;
  onDuplicate: (producto: Producto) => void;
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
            {productos.map((producto) => (
              <TableRow 
                key={producto.id}
                className={`${getBgColorByStock(producto.stock, producto.track_stock)}`}
              >
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
    </div>
  );
};

export default ProductosTable;
