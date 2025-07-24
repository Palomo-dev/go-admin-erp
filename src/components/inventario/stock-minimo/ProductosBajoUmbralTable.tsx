'use client';

import { useState } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis
} from '@/components/ui/pagination';
import type { ProductoBajoUmbral } from './StockMinimoReporte';
import { NumericInput } from '@/components/ui/NumericInput';

interface ProductosBajoUmbralTableProps {
  productos: ProductoBajoUmbral[];
  isLoading: boolean;
  error: string | null;
  onSelectionChange: (selectedProducts: ProductoBajoUmbral[]) => void;
  // Pagination props
  currentPage?: number;
  itemsPerPage?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
}

/**
 * Tabla que muestra los productos por debajo del umbral de stock
 * Permite seleccionar productos para generar órdenes de compra
 */
export default function ProductosBajoUmbralTable({ 
  productos, 
  isLoading, 
  error,
  onSelectionChange,
  currentPage = 1,
  itemsPerPage = 10,
  totalItems = 0,
  onPageChange,
  onItemsPerPageChange
}: ProductosBajoUmbralTableProps) {
  const [selectedRows, setSelectedRows] = useState<Record<number, boolean>>({});
  const [search, setSearch] = useState('');
  
  // Filtra productos según la búsqueda
  const filteredProductos = productos.filter(producto => 
    producto.name.toLowerCase().includes(search.toLowerCase()) || 
    producto.sku.toLowerCase().includes(search.toLowerCase())
  );
  
  // Manejador de selección de filas
  const handleRowSelect = (id: number, checked: boolean) => {
    const newSelectedRows = { ...selectedRows, [id]: checked };
    setSelectedRows(newSelectedRows);
    
    // Notificar al componente padre sobre los productos seleccionados
    const selectedProducts = productos.filter(p => newSelectedRows[p.id]);
    onSelectionChange(selectedProducts);
  };
  
  // Manejador de selección de todas las filas
  const handleSelectAll = (checked: boolean) => {
    const newSelectedRows: Record<number, boolean> = {};
    
    filteredProductos.forEach(producto => {
      newSelectedRows[producto.id] = checked;
    });
    
    setSelectedRows(newSelectedRows);
    
    // Notificar al componente padre sobre los productos seleccionados
    const selectedProducts = checked ? [...filteredProductos] : [];
    onSelectionChange(selectedProducts);
  };
  
  // Verificar si todas las filas están seleccionadas
  const allSelected = filteredProductos.length > 0 && 
    filteredProductos.every(producto => selectedRows[producto.id]);
  
  // Verificar si algunas filas están seleccionadas
  const someSelected = filteredProductos.some(producto => selectedRows[producto.id]) && 
    !allSelected;

  // Cálculos de paginación
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredProductos.length);
  const currentProducts = filteredProductos.slice(startIndex, endIndex);

  // Generar números de página para mostrar
  const generatePageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      const start = Math.max(1, currentPage - 2);
      const end = Math.min(totalPages, start + maxVisiblePages - 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  };

  // Renderizar estado de carga o error
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="flex flex-col items-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
          <p className="text-gray-500 dark:text-gray-400">Cargando productos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center p-6 border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" className="mt-4">
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (filteredProductos.length === 0 && !search) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No hay productos por debajo del umbral de stock mínimo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Búsqueda */}
      <div className="flex items-center relative">
        <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 text-gray-400" />
        <Input 
          placeholder="Buscar por nombre o SKU" 
          value={search} 
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>
      
      {filteredProductos.length === 0 && search ? (
        <div className="flex justify-center items-center h-32">
          <p className="text-gray-500 dark:text-gray-400">
            {`No se encontraron productos para "${search}".`}
          </p>
        </div>
      ) : (
        <>
          <div className="border rounded-md overflow-hidden">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox 
                    checked={allSelected} 
                    {...(someSelected && { indeterminate: true })}
                    onCheckedChange={handleSelectAll}
                    aria-label="Seleccionar todos"
                  />
                </TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="min-w-[180px]">Producto</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Stock Actual</TableHead>
                <TableHead>Stock Mínimo</TableHead>
                <TableHead>Diferencia</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentProducts.map((producto) => (
                <TableRow key={producto.id}>
                  <TableCell>
                    <Checkbox 
                      checked={!!selectedRows[producto.id]} 
                      onCheckedChange={(checked) => handleRowSelect(producto.id, !!checked)}
                      aria-label={`Seleccionar ${producto.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono">{producto.sku}</TableCell>
                  <TableCell className="font-medium">{producto.name}</TableCell>
                  <TableCell>{producto.branch_name}</TableCell>
                  <TableCell>
                    <NumericInput 
                      defaultValue={producto.qty_on_hand} 
                      className="w-24"
                      disabled
                    />
                  </TableCell>
                  <TableCell>
                    <NumericInput 
                      defaultValue={producto.min_level} 
                      className="w-24"
                      disabled
                    />
                  </TableCell>
                  <TableCell className="font-medium text-right">
                    {producto.diferencia.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {producto.qty_on_hand === 0 ? (
                      <Badge className="bg-red-500 text-white hover:bg-red-600 text-center justify-center">Sin stock</Badge>
                    ) : (
                      <Badge variant="warning" className="text-center justify-center">Stock bajo</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        {/* Paginación - Siempre visible */}
        <div className="border-t pt-4 mt-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            {/* Sección izquierda: Items por página e información */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Items por página */}
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Mostrar</span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => onItemsPerPageChange?.(parseInt(value))}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">por página</span>
              </div>
              
              {/* Información de resultados */}
              <div className="text-sm text-gray-600 dark:text-gray-400 px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded-md">
                <span className="font-medium">{startIndex + 1}-{Math.min(endIndex, totalItems)}</span> de <span className="font-medium">{totalItems}</span> resultados
              </div>
            </div>
            
            {/* Sección derecha: Controles de navegación - Solo si hay más de una página */}
            {totalPages > 1 && (
              <div className="flex justify-center lg:justify-end w-full lg:w-auto">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        disabled={currentPage === 1}
                        onClick={() => onPageChange?.(currentPage - 1)}
                      />
                    </PaginationItem>
                    
                    {generatePageNumbers().map((page, index) => (
                      <PaginationItem key={index}>
                        <PaginationLink
                          isActive={currentPage === page}
                          onClick={() => onPageChange?.(page)}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    
                    {totalPages > 5 && currentPage < totalPages - 2 && (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    )}
                    
                    <PaginationItem>
                      <PaginationNext 
                        disabled={currentPage === totalPages}
                        onClick={() => onPageChange?.(currentPage + 1)}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
