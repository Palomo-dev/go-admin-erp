'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Eye,
  Trash2,
  Loader2,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  Factory,
} from 'lucide-react';
import type { ProductionOrder } from '@/lib/services/productionOrderService';
import { ProductionOrderStatusBadge } from './ProductionOrderStatusBadge';

interface ProductionOrderTableProps {
  orders: ProductionOrder[];
  loading: boolean;
  actionLoading: number | null;
  onView: (order: ProductionOrder) => void;
  onAction: (order: ProductionOrder, action: 'confirm' | 'start' | 'complete' | 'cancel') => void;
  onDelete: (order: ProductionOrder) => void;
}

export function ProductionOrderTable({
  orders,
  loading,
  actionLoading,
  onView,
  onAction,
  onDelete,
}: ProductionOrderTableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg animate-pulse"
          >
            <div className="w-12 h-12 bg-gray-200 dark:bg-gray-600 rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-48" />
              <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-24" />
            </div>
            <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500 dark:text-gray-400">
        <Factory className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No hay órdenes de producción</p>
        <p className="text-sm mt-1">
          Crea una orden para producir un producto compuesto
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="dark:border-gray-700">
          <TableHead className="dark:text-gray-300">Producto</TableHead>
          <TableHead className="dark:text-gray-300">Receta</TableHead>
          <TableHead className="dark:text-gray-300 text-center">Cantidad</TableHead>
          <TableHead className="dark:text-gray-300 text-center">Producido</TableHead>
          <TableHead className="dark:text-gray-300 text-center">Estado</TableHead>
          <TableHead className="dark:text-gray-300">Fecha</TableHead>
          <TableHead className="dark:text-gray-300 text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow
            key={order.id}
            className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <TableCell>
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Package className="h-4 w-4 text-blue-600" />
                </div>
                <span className="font-medium dark:text-white">
                  {order.product?.name ?? `#${order.product_id}`}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-sm text-gray-500 dark:text-gray-400">
              {order.recipe?.name ?? `Receta #${order.recipe_id}`}
            </TableCell>
            <TableCell className="text-center dark:text-gray-300">
              <span className="font-mono text-sm">{order.qty_to_produce}</span>
            </TableCell>
            <TableCell className="text-center dark:text-gray-300">
              <span className="font-mono text-sm">{order.produced_qty}</span>
            </TableCell>
            <TableCell className="text-center">
              <ProductionOrderStatusBadge status={order.status} />
            </TableCell>
            <TableCell className="text-sm text-gray-500 dark:text-gray-400">
              {new Date(order.created_at).toLocaleDateString('es-CO', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onView(order)}
                  className="h-8 w-8 p-0"
                  title="Ver detalle"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {order.status === 'draft' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onAction(order, 'confirm')}
                    disabled={actionLoading === order.id}
                    className="h-8 w-8 p-0 text-blue-600"
                    title="Confirmar"
                  >
                    {actionLoading === order.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Clock className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {order.status === 'confirmed' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onAction(order, 'start')}
                    disabled={actionLoading === order.id}
                    className="h-8 w-8 p-0 text-green-600"
                    title="Iniciar"
                  >
                    {actionLoading === order.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {order.status === 'in_progress' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onAction(order, 'complete')}
                    disabled={actionLoading === order.id}
                    className="h-8 w-8 p-0 text-green-600"
                    title="Completar"
                  >
                    {actionLoading === order.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {(order.status === 'draft' || order.status === 'confirmed') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onAction(order, 'cancel')}
                    disabled={actionLoading === order.id}
                    className="h-8 w-8 p-0 text-red-500"
                    title="Cancelar"
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
                {order.status === 'draft' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(order)}
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
