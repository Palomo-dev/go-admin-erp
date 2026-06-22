'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Wrench } from 'lucide-react';

interface MaintenanceHeaderProps {
  onNewOrder: () => void;
}

export function MaintenanceHeader({ onNewOrder }: MaintenanceHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex-shrink-0">
            <Wrench className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
              Órdenes de Mantenimiento
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
              Gestión de reparaciones y mantenimiento de espacios
            </p>
          </div>
        </div>

        <Button size="sm" onClick={onNewOrder} className="bg-blue-600 hover:bg-blue-700 self-start sm:self-auto">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Orden
        </Button>
      </div>
    </div>
  );
}
