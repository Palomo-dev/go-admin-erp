'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Factory, Loader2 } from 'lucide-react';
import type { ProductionOrder } from '@/lib/services/productionOrderService';
import { ProductionOrderStatusBadge } from './ProductionOrderStatusBadge';

interface ProductionOrderDetailDialogProps {
  order: ProductionOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
}

export function ProductionOrderDetailDialog({
  order,
  open,
  onOpenChange,
  loading,
}: ProductionOrderDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white flex items-center gap-2">
            <Factory className="h-5 w-5 text-blue-600" />
            Detalle de Orden de Producción
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {order?.product?.name ?? ''}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : order ? (
          <div className="space-y-4">
            {/* Info general */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Producto</p>
                <p className="font-medium dark:text-white">
                  {order.product?.name ?? `#${order.product_id}`}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Receta</p>
                <p className="font-medium dark:text-white">
                  {order.recipe?.name ?? `#${order.recipe_id}`}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cantidad a producir</p>
                <p className="font-mono font-medium dark:text-white">{order.qty_to_produce}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cantidad producida</p>
                <p className="font-mono font-medium dark:text-white">{order.produced_qty}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Estado</p>
                <ProductionOrderStatusBadge status={order.status} />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Fecha creación</p>
                <p className="text-sm dark:text-white">
                  {new Date(order.created_at).toLocaleString('es-CO')}
                </p>
              </div>
              {order.started_at && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Iniciada</p>
                  <p className="text-sm dark:text-white">
                    {new Date(order.started_at).toLocaleString('es-CO')}
                  </p>
                </div>
              )}
              {order.completed_at && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Completada</p>
                  <p className="text-sm dark:text-white">
                    {new Date(order.completed_at).toLocaleString('es-CO')}
                  </p>
                </div>
              )}
            </div>

            {/* Notas */}
            {order.notes && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Notas</p>
                <p className="text-sm dark:text-gray-300 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                  {order.notes}
                </p>
              </div>
            )}

            {/* Consumos */}
            {order.consumptions && order.consumptions.length > 0 && (
              <div>
                <p className="text-sm font-medium dark:text-gray-300 mb-2">
                  Consumo de ingredientes ({order.consumptions.length})
                </p>
                <div className="space-y-2">
                  {order.consumptions.map((cons) => (
                    <div
                      key={cons.id}
                      className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm dark:text-white">
                          {cons.ingredient_product?.name ?? `#${cons.ingredient_product_id}`}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          {cons.ingredient_product?.sku ?? 'N/A'}
                        </p>
                      </div>
                      <span className="font-mono text-sm dark:text-white">
                        {cons.quantity_consumed} {cons.unit_code}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
