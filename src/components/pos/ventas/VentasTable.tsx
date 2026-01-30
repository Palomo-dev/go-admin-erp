'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Eye,
  Printer,
  Copy,
  XCircle,
  MoreHorizontal,
  FileText,
  RotateCcw,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SaleWithDetails } from './types';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { cn } from '@/utils/Utils';

interface VentasTableProps {
  sales: SaleWithDetails[];
  onView: (sale: SaleWithDetails) => void;
  onDuplicate: (sale: SaleWithDetails) => void;
  onCancel: (sale: SaleWithDetails) => void;
  onPrint: (sale: SaleWithDetails) => void;
  onCreateReturn: (sale: SaleWithDetails) => void;
  isLoading?: boolean;
}

export function VentasTable({
  sales,
  onView,
  onDuplicate,
  onCancel,
  onPrint,
  onCreateReturn,
  isLoading
}: VentasTableProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completada
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-0">
            <Clock className="h-3 w-3 mr-1" />
            Pendiente
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
            <XCircle className="h-3 w-3 mr-1" />
            Anulada
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">{status}</Badge>
        );
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
            Pagado
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-0">
            Pendiente
          </Badge>
        );
      case 'partial':
        return (
          <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-0">
            Parcial
          </Badge>
        );
      case 'refunded':
        return (
          <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-0">
            Reembolsado
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">{status || 'N/A'}</Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (sales.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          No hay ventas
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          No se encontraron ventas con los filtros seleccionados.
        </p>
        <Link href="/app/pos/ventas/nuevo">
          <Button className="mt-4">
            Crear Nueva Venta
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="dark:border-gray-700">
            <TableHead className="dark:text-gray-400">Fecha</TableHead>
            <TableHead className="dark:text-gray-400">ID</TableHead>
            <TableHead className="dark:text-gray-400">Cliente</TableHead>
            <TableHead className="dark:text-gray-400 text-right">Total</TableHead>
            <TableHead className="dark:text-gray-400">Estado</TableHead>
            <TableHead className="dark:text-gray-400">Pago</TableHead>
            <TableHead className="dark:text-gray-400 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((sale) => (
            <TableRow 
              key={sale.id} 
              className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
              onClick={() => onView(sale)}
            >
              <TableCell className="dark:text-gray-300">
                <div>
                  <p className="font-medium">
                    {formatDate(sale.sale_date || sale.created_at)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(sale.sale_date || sale.created_at).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm dark:text-gray-300">
                {sale.id.slice(0, 8)}...
              </TableCell>
              <TableCell className="dark:text-gray-300">
                {sale.customer ? (
                  <div>
                    <p className="font-medium">{sale.customer.full_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {sale.customer.doc_number || sale.customer.phone || 'Sin datos'}
                    </p>
                  </div>
                ) : (
                  <span className="text-gray-400">Cliente genérico</span>
                )}
              </TableCell>
              <TableCell className="text-right font-semibold dark:text-gray-300">
                {formatCurrency(sale.total)}
              </TableCell>
              <TableCell>
                {getStatusBadge(sale.status)}
              </TableCell>
              <TableCell>
                {getPaymentStatusBadge(sale.payment_status)}
              </TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                    <DropdownMenuItem 
                      onClick={() => onView(sale)}
                      className="dark:hover:bg-gray-700"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver Detalle
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onPrint(sale)}
                      className="dark:hover:bg-gray-700"
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      Imprimir
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onDuplicate(sale)}
                      className="dark:hover:bg-gray-700"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="dark:bg-gray-700" />
                    {sale.status === 'completed' && (
                      <DropdownMenuItem 
                        onClick={() => onCreateReturn(sale)}
                        className="dark:hover:bg-gray-700"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Crear Devolución
                      </DropdownMenuItem>
                    )}
                    {sale.status !== 'cancelled' && (
                      <DropdownMenuItem 
                        onClick={() => onCancel(sale)}
                        className="text-red-600 dark:text-red-400 dark:hover:bg-gray-700"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Anular Venta
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
