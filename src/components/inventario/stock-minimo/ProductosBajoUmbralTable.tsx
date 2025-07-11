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
import type { ProductoBajoUmbral } from './StockMinimoReporte';
import { NumericInput } from '@/components/ui/NumericInput';

interface ProductosBajoUmbralTableProps {
  productos: ProductoBajoUmbral[];
  isLoading: boolean;
  error: string | null;
  onSelectionChange: (selectedProducts: ProductoBajoUmbral[]) => void;
}

/**
 * Tabla que muestra los productos por debajo del umbral de stock
 * Permite seleccionar productos para generar órdenes de compra
 */
export default function ProductosBajoUmbralTable({ 
  productos, 
  isLoading, 
  error,
  onSelectionChange
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
            No se encontraron productos para "{search}".
          </p>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox 
                    checked={allSelected} 
                    indeterminate={someSelected}
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
                <TableHead>Proveedor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProductos.map((producto) => (
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
                      value={producto.qty_on_hand} 
                      className="w-24"
                      disabled
                    />
                  </TableCell>
                  <TableCell>
                    <NumericInput 
                      value={producto.min_level} 
                      className="w-24"
                      disabled
                    />
                  </TableCell>
                  <TableCell className="font-medium text-right">
                    {producto.diferencia.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {producto.qty_on_hand === 0 ? (
                      <Badge variant="destructive">Sin stock</Badge>
                    ) : (
                      <Badge variant="warning">Stock bajo</Badge>
                    )}
                  </TableCell>
                  <TableCell>{producto.supplier_name || 'No asignado'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
