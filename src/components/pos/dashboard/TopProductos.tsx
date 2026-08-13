'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Crown } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { TopProductoPos } from '@/lib/services/posDashboardService';

interface TopProductosProps {
  productos: TopProductoPos[];
  isLoading?: boolean;
}

export function TopProductos({ productos, isLoading }: TopProductosProps) {
  const maxCantidad = productos.length > 0 ? Math.max(...productos.map((p) => p.cantidad)) : 0;

  return (
    <Card className="dark:bg-gray-800/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <Package className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          Top productos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        ) : productos.length === 0 ? (
          <div className="py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
            Sin datos en el período
          </div>
        ) : (
          <div className="space-y-3">
            {productos.map((producto, index) => {
              const porcentaje = maxCantidad > 0 ? (producto.cantidad / maxCantidad) * 100 : 0;
              return (
                <div key={producto.productId} className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {index === 0 && <Crown className="h-4 w-4 shrink-0 text-yellow-500" />}
                      <span className="text-sm text-gray-700 dark:text-gray-300 break-words whitespace-normal min-w-0">
                        {producto.productName}
                      </span>
                      {producto.sku && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                          ({producto.sku})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {producto.cantidad} u.
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatCurrency(producto.total, 'COP')}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-violet-100 dark:bg-violet-900/30">
                    <div
                      className="h-full rounded-full transition-all bg-violet-500 dark:bg-violet-600"
                      style={{ width: `${porcentaje}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TopProductos;
