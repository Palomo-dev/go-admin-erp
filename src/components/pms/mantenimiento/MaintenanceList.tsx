'use client';

import React from 'react';
import { OrderCard } from './OrderCard';
import { Wrench } from 'lucide-react';
import type { MaintenanceOrder } from '@/lib/services/maintenanceService';

interface MaintenanceListProps {
  orders: MaintenanceOrder[];
  onStatusChange: (orderId: string, status: string) => void;
  onEdit: (order: MaintenanceOrder) => void;
  onDelete: (orderId: string) => void;
  onViewPhotos?: (order: MaintenanceOrder) => void;
}

export function MaintenanceList({
  orders,
  onStatusChange,
  onEdit,
  onDelete,
  onViewPhotos,
}: MaintenanceListProps) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Wrench className="h-16 w-16 text-gray-400 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No hay órdenes de mantenimiento
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-sm">
          No se encontraron órdenes con los filtros seleccionados.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          onStatusChange={onStatusChange}
          onEdit={onEdit}
          onDelete={onDelete}
          onViewPhotos={onViewPhotos}
        />
      ))}
    </div>
  );
}
