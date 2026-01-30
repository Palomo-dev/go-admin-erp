'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Eye, 
  Pencil, 
  Trash2, 
  Copy, 
  MoreVertical,
  Send,
  Package,
  XCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/Utils';
import type { PurchaseOrder } from '@/lib/services/purchaseOrderService';

interface OrdenesCompraTableProps {
  orders: PurchaseOrder[];
  onDuplicate: (uuid: string) => void;
  onDelete: (uuid: string) => void;
  onStatusChange: (uuid: string, status: 'sent' | 'partial' | 'received' | 'cancelled') => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Borrador', className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
  sent: { label: 'Enviada', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  partial: { label: 'Parcial', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  received: { label: 'Recibida', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'Cancelada', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' }
};

export function OrdenesCompraTable({ 
  orders, 
  onDuplicate, 
  onDelete, 
  onStatusChange 
}: OrdenesCompraTableProps) {
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const totalPages = Math.ceil(orders.length / itemsPerPage);
  const start = (page - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedOrders = orders.slice(start, end);

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || statusConfig.draft;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800">
              <TableHead className="dark:text-gray-300">ID</TableHead>
              <TableHead className="dark:text-gray-300">Proveedor</TableHead>
              <TableHead className="hidden md:table-cell dark:text-gray-300">Sucursal</TableHead>
              <TableHead className="dark:text-gray-300">Estado</TableHead>
              <TableHead className="hidden lg:table-cell dark:text-gray-300">Fecha Esperada</TableHead>
              <TableHead className="text-right dark:text-gray-300">Total</TableHead>
              <TableHead className="hidden sm:table-cell dark:text-gray-300">Creado</TableHead>
              <TableHead className="text-right dark:text-gray-300">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-gray-500 dark:text-gray-400">
                  No hay órdenes de compra
                </TableCell>
              </TableRow>
            ) : (
              paginatedOrders.map((order) => (
                <TableRow key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                    OC-{order.id}
                  </TableCell>
                  <TableCell className="text-gray-700 dark:text-gray-300">
                    {order.suppliers?.name || '-'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-gray-700 dark:text-gray-300">
                    {order.branches?.name || '-'}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(order.status)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-gray-700 dark:text-gray-300">
                    {order.expected_date ? formatDate(order.expected_date) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(order.total || 0)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-gray-500 dark:text-gray-400 text-sm">
                    {formatDate(order.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/inventario/ordenes-compra/${order.uuid}`} className="flex items-center">
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalle
                          </Link>
                        </DropdownMenuItem>
                        
                        {order.status === 'draft' && (
                          <DropdownMenuItem asChild>
                            <Link href={`/app/inventario/ordenes-compra/${order.uuid}/editar`} className="flex items-center">
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </Link>
                          </DropdownMenuItem>
                        )}
                        
                        <DropdownMenuItem onClick={() => onDuplicate(order.uuid)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        
                        <DropdownMenuSeparator />
                        
                        {order.status === 'draft' && (
                          <DropdownMenuItem onClick={() => onStatusChange(order.uuid, 'sent')}>
                            <Send className="h-4 w-4 mr-2" />
                            Enviar a Proveedor
                          </DropdownMenuItem>
                        )}
                        
                        {(order.status === 'sent' || order.status === 'partial') && (
                          <DropdownMenuItem onClick={() => onStatusChange(order.uuid, 'received')}>
                            <Package className="h-4 w-4 mr-2" />
                            Marcar Recibida
                          </DropdownMenuItem>
                        )}
                        
                        {order.status !== 'cancelled' && order.status !== 'received' && (
                          <DropdownMenuItem 
                            onClick={() => onStatusChange(order.uuid, 'cancelled')}
                            className="text-red-600 dark:text-red-400"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Cancelar
                          </DropdownMenuItem>
                        )}
                        
                        {order.status === 'draft' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => onDelete(order.uuid)}
                              className="text-red-600 dark:text-red-400"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Mostrando {start + 1}-{Math.min(end, orders.length)} de {orders.length}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="dark:border-gray-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-700 dark:text-gray-300 px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              className="dark:border-gray-700"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrdenesCompraTable;
