'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, Settings } from 'lucide-react';

interface AbonadosHeaderProps {
  onRefresh: () => void;
  onNewPass: () => void;
  onManageTypes: () => void;
  isLoading: boolean;
}

export function AbonadosHeader({ onRefresh, onNewPass, onManageTypes, isLoading }: AbonadosHeaderProps) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Abonados de Parking
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Gestiona los pases y membresías de estacionamiento
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onManageTypes}
          >
            <Settings className="h-4 w-4 mr-2" />
            Tipos de Plan
          </Button>
          <Button
            size="sm"
            onClick={onNewPass}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Abonado
          </Button>
        </div>
      </div>
    </div>
  );
}
