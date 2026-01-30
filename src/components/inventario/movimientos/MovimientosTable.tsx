'use client';

import React from 'react';
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
  MoreHorizontal, 
  Eye, 
  FileText,
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2,
  Package
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/Utils';
import type { StockMovement } from '@/lib/services/stockService';
import Link from 'next/link';

interface MovimientosTableProps {
  data: StockMovement[];
  isLoading?: boolean;
  onViewSource?: (movement: StockMovement) => void;
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    sale: 'Venta',
    purchase: 'Compra',
    transfer: 'Transferencia',
    adjustment: 'Ajuste',
    return: 'Devolución',
    initial: 'Inventario Inicial',
    production: 'Producción',
    waste: 'Merma'
  };
  return labels[source] || source;
}

function getSourceColor(source: string): string {
  const colors: Record<string, string> = {
    sale: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    purchase: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    transfer: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    adjustment: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    return: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
    initial: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    production: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    waste: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
  };
  return colors[source] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
}

function getSourceRoute(source: string, sourceId?: string): string | null {
  if (!sourceId) return null;
  
  const routes: Record<string, string> = {
    sale: `/app/pos/ventas/${sourceId}`,
    purchase: `/app/inventario/compras/${sourceId}`,
    transfer: `/app/inventario/transferencias/${sourceId}`,
    adjustment: `/app/inventario/ajustes/${sourceId}`,
    return: `/app/pos/devoluciones/${sourceId}`
  };
  
  return routes[source] || null;
}

export function MovimientosTable({ 
  data, 
  isLoading,
  onViewSource
}: MovimientosTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Cargando movimientos...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          No hay movimientos registrados
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          No se encontraron movimientos con los filtros aplicados
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800/50">
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Fecha
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Producto
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Sucursal
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300 text-center">
                Dirección
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300 text-right">
                Cantidad
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300 text-right">
                Costo Unit.
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300 text-right">
                Valor Total
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Origen
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Documento
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Nota
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300 text-right">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => {
              const totalValue = (item.qty || 0) * (item.unit_cost || 0);
              const sourceRoute = getSourceRoute(item.source, item.source_id);
              const productUuid = item.products?.uuid || item.product_id;

              return (
                <TableRow 
                  key={item.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <TableCell className="text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {formatDate(item.created_at)}
                    <br />
                    <span className="text-xs">
                      {new Date(item.created_at).toLocaleTimeString('es-CO', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-gray-900 dark:text-white">
                    <div className="max-w-[200px]">
                      <div className="truncate">{item.products?.name || 'N/A'}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                        {item.products?.sku || '-'}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    {item.branches?.name || '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    {item.direction === 'in' ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        <ArrowDownCircle className="h-3 w-3 mr-1" />
                        Entrada
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        <ArrowUpCircle className="h-3 w-3 mr-1" />
                        Salida
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium text-gray-900 dark:text-white">
                    {item.direction === 'in' ? '+' : '-'}{(item.qty || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-gray-600 dark:text-gray-400">
                    {formatCurrency(item.unit_cost || 0)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-gray-900 dark:text-white">
                    {formatCurrency(totalValue)}
                  </TableCell>
                  <TableCell>
                    <Badge className={getSourceColor(item.source)}>
                      {getSourceLabel(item.source)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400 font-mono text-sm">
                    {item.source_id || '-'}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    <div className="max-w-[150px] truncate" title={item.note || ''}>
                      {item.note || '-'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-8 w-8 p-0"
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
                        {sourceRoute && (
                          <Link href={sourceRoute}>
                            <DropdownMenuItem className="cursor-pointer">
                              <FileText className="h-4 w-4 mr-2" />
                              Ver documento
                            </DropdownMenuItem>
                          </Link>
                        )}
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
  );
}

export default MovimientosTable;
