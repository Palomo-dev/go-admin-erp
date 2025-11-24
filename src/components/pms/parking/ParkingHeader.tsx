'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Car } from 'lucide-react';

interface ParkingHeaderProps {
  onNewEntry: () => void;
}

export function ParkingHeader({ onNewEntry }: ParkingHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
            <Car className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Gestión de Estacionamientos
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Control de sesiones de parqueo y cobros
            </p>
          </div>
        </div>
        <Button onClick={onNewEntry} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Entrada
        </Button>
      </div>
    </div>
  );
}
