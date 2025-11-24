'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Wrench } from 'lucide-react';

interface MaintenanceHeaderProps {
  onNewOrder: () => void;
}

export function MaintenanceHeader({ onNewOrder }: MaintenanceHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
            <Wrench className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Órdenes de Mantenimiento
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Gestión de reparaciones y mantenimiento de espacios
            </p>
          </div>
        </div>

        <Button onClick={onNewOrder} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Orden
        </Button>
      </div>
    </div>
  );
}
