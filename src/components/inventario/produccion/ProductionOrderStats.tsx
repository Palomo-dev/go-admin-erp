'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { ProductionOrder, ProductionOrderStatus } from '@/lib/services/productionOrderService';
import { STATUS_LABELS } from './ProductionOrderStatusBadge';

interface ProductionOrderStatsProps {
  orders: ProductionOrder[];
}

const STATUS_ORDER: ProductionOrderStatus[] = ['draft', 'confirmed', 'in_progress', 'completed', 'cancelled'];

export function ProductionOrderStats({ orders }: ProductionOrderStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {STATUS_ORDER.map((status) => {
        const config = STATUS_LABELS[status];
        const count = orders.filter((o) => o.status === status).length;
        return (
          <Card key={status} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{config.label}</p>
                  <p className="text-2xl font-bold dark:text-white">{count}</p>
                </div>
                <div className="opacity-50">{config.icon}</div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
