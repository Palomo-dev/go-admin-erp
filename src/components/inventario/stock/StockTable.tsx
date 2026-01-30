'use client';

import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  MoreHorizontal, 
  Eye, 
  ClipboardEdit, 
  ArrowRightLeft,
  AlertTriangle,
  PackageX,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { StockLevel } from '@/lib/services/stockService';
import Link from 'next/link';

interface StockTableProps {
  data: StockLevel[];
  isLoading?: boolean;
  onViewProduct?: (productId: number, uuid?: string) => void;
  onCreateAdjustment?: (stockLevel: StockLevel) => void;
  onCreateTransfer?: (stockLevel: StockLevel) => void;
}

type SortField = 'name' | 'sku' | 'branch' | 'qty_on_hand' | 'avg_cost' | 'total_value' | 'status';
type SortOrder = 'asc' | 'desc';

function getStockStatus(qtyOnHand: number, minLevel: number) {
  if (qtyOnHand <= 0) {
    return {
      label: 'Sin Stock',
      color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      icon: PackageX
    };
  }
  if (qtyOnHand < minLevel) {
    return {
      label: 'Bajo Mínimo',
      color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      icon: AlertTriangle
    };
  }
  return {
    label: 'Disponible',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: CheckCircle2
  };
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function StockTable({ 
  data, 
  isLoading,
  onViewProduct,
  onCreateAdjustment,
  onCreateTransfer
}: StockTableProps) {
  // Estados de paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  
  // Estados de ordenamiento
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Función para obtener el valor de ordenamiento
  const getSortValue = (item: StockLevel, field: SortField): string | number => {
    switch (field) {
      case 'name':
        return item.products?.name?.toLowerCase() || '';
      case 'sku':
        return item.products?.sku?.toLowerCase() || '';
      case 'branch':
        return item.branches?.name?.toLowerCase() || '';
      case 'qty_on_hand':
        return item.qty_on_hand || 0;
      case 'avg_cost':
        return item.avg_cost || 0;
      case 'total_value':
        return (item.qty_on_hand || 0) * (item.avg_cost || 0);
      case 'status':
        const qty = item.qty_on_hand || 0;
        const min = item.min_level || 0;
        if (qty <= 0) return 0;
        if (qty < min) return 1;
        return 2;
      default:
        return '';
    }
  };

  // Datos ordenados y paginados
  const { sortedData, paginatedData, totalPages, startIndex, endIndex } = useMemo(() => {
    // Ordenar datos
    const sorted = [...data].sort((a, b) => {
      const aValue = getSortValue(a, sortField);
      const bValue = getSortValue(b, sortField);
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      const comparison = String(aValue).localeCompare(String(bValue));
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Calcular paginación
    const total = Math.ceil(sorted.length / pageSize);
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, sorted.length);
    const paginated = sorted.slice(start, end);

    return {
      sortedData: sorted,
      paginatedData: paginated,
      totalPages: total,
      startIndex: start + 1,
      endIndex: end
    };
  }, [data, sortField, sortOrder, currentPage, pageSize]);

  // Resetear página al cambiar datos o pageSize
  React.useEffect(() => {
    setCurrentPage(1);
  }, [data.length, pageSize]);

  // Manejar ordenamiento
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  // Componente de header ordenable
  const SortableHeader = ({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) => {
    const isActive = sortField === field;
    return (
      <TableHead 
        className={`font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 select-none ${className}`}
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center gap-1">
          {children}
          {isActive ? (
            sortOrder === 'asc' ? (
              <ArrowUp className="h-3 w-3 text-blue-600" />
            ) : (
              <ArrowDown className="h-3 w-3 text-blue-600" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 text-gray-400" />
          )}
        </div>
      </TableHead>
    );
  };

  // Generar números de página visibles
  const getVisiblePages = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      
      if (currentPage > 3) pages.push('...');
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) pages.push(i);
      
      if (currentPage < totalPages - 2) pages.push('...');
      
      pages.push(totalPages);
    }
    
    return pages;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Cargando stock...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <PackageX className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          No hay registros de stock
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          No se encontraron productos con los filtros aplicados
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controles superiores */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Mostrar</span>
          <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(parseInt(v))}>
            <SelectTrigger className="w-20 h-9 dark:bg-gray-800 dark:border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-gray-600 dark:text-gray-400">registros</span>
        </div>
        
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Mostrando <span className="font-medium text-gray-900 dark:text-white">{startIndex}</span> - <span className="font-medium text-gray-900 dark:text-white">{endIndex}</span> de <span className="font-medium text-gray-900 dark:text-white">{data.length}</span> registros
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-800/50">
                <SortableHeader field="name">Producto</SortableHeader>
                <SortableHeader field="sku">SKU</SortableHeader>
                <SortableHeader field="branch">Sucursal</SortableHeader>
                <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                  Categoría
                </TableHead>
                <SortableHeader field="qty_on_hand" className="text-right">
                  <span className="ml-auto">Disponible</span>
                </SortableHeader>
                <TableHead className="font-semibold text-gray-700 dark:text-gray-300 text-right">
                  Reservado
                </TableHead>
                <TableHead className="font-semibold text-gray-700 dark:text-gray-300 text-right">
                  Mínimo
                </TableHead>
                <SortableHeader field="avg_cost" className="text-right">
                  <span className="ml-auto">Costo Prom.</span>
                </SortableHeader>
                <SortableHeader field="total_value" className="text-right">
                  <span className="ml-auto">Valor Total</span>
                </SortableHeader>
                <SortableHeader field="status">Estado</SortableHeader>
                <TableHead className="font-semibold text-gray-700 dark:text-gray-300 text-right">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map((item, index) => {
                const status = getStockStatus(item.qty_on_hand || 0, item.min_level || 0);
                const StatusIcon = status.icon;
                const totalValue = (item.qty_on_hand || 0) * (item.avg_cost || 0);
                const productUuid = item.products?.uuid || item.product_id;

                return (
                  <TableRow 
                    key={item.id}
                    className={`hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors ${
                      index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'
                    }`}
                  >
                    <TableCell className="font-medium text-gray-900 dark:text-white">
                      <Link 
                        href={`/app/inventario/productos/${productUuid}`}
                        className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                      >
                        {item.products?.name || 'N/A'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400 font-mono text-sm">
                      {item.products?.sku || '-'}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {item.branches?.name || '-'}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {item.products?.categories?.name || '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium text-gray-900 dark:text-white tabular-nums">
                      {(item.qty_on_hand || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-gray-600 dark:text-gray-400 tabular-nums">
                      {(item.qty_reserved || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-gray-600 dark:text-gray-400 tabular-nums">
                      {(item.min_level || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-gray-600 dark:text-gray-400 tabular-nums">
                      {formatCurrency(item.avg_cost || 0)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-gray-900 dark:text-white tabular-nums">
                      {formatCurrency(totalValue)}
                    </TableCell>
                    <TableCell>
                      <Badge className={status.color}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent 
                          align="end"
                          className="dark:bg-gray-900 dark:border-gray-700"
                        >
                          <Link href={`/app/inventario/productos/${productUuid}`}>
                            <DropdownMenuItem className="cursor-pointer">
                              <Eye className="h-4 w-4 mr-2" />
                              Ver producto
                            </DropdownMenuItem>
                          </Link>
                          <Link href={`/app/inventario/ajustes/nuevo`}>
                            <DropdownMenuItem className="cursor-pointer">
                              <ClipboardEdit className="h-4 w-4 mr-2" />
                              Crear ajuste
                            </DropdownMenuItem>
                          </Link>
                          <DropdownMenuItem 
                            className="cursor-pointer"
                            onClick={() => onCreateTransfer?.(item)}
                          >
                            <ArrowRightLeft className="h-4 w-4 mr-2" />
                            Crear transferencia
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Página <span className="font-medium text-gray-900 dark:text-white">{currentPage}</span> de <span className="font-medium text-gray-900 dark:text-white">{totalPages}</span>
          </div>
          
          <div className="flex items-center gap-1">
            {/* Ir al inicio */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="h-9 w-9 p-0 dark:border-gray-700 dark:hover:bg-gray-800"
              title="Primera página"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            
            {/* Anterior */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-9 w-9 p-0 dark:border-gray-700 dark:hover:bg-gray-800"
              title="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            {/* Números de página */}
            <div className="hidden sm:flex items-center gap-1">
              {getVisiblePages().map((page, idx) => (
                page === '...' ? (
                  <span key={`dots-${idx}`} className="px-2 text-gray-400">...</span>
                ) : (
                  <Button
                    key={page}
                    variant={currentPage === page ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(page as number)}
                    className={`h-9 w-9 p-0 ${
                      currentPage === page 
                        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                        : 'dark:border-gray-700 dark:hover:bg-gray-800'
                    }`}
                  >
                    {page}
                  </Button>
                )
              ))}
            </div>
            
            {/* Input de página para móvil */}
            <div className="flex sm:hidden items-center gap-2 px-2">
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const page = parseInt(e.target.value);
                  if (page >= 1 && page <= totalPages) {
                    setCurrentPage(page);
                  }
                }}
                className="w-12 h-9 text-center text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              />
            </div>
            
            {/* Siguiente */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-9 w-9 p-0 dark:border-gray-700 dark:hover:bg-gray-800"
              title="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            
            {/* Ir al final */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="h-9 w-9 p-0 dark:border-gray-700 dark:hover:bg-gray-800"
              title="Última página"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default StockTable;
