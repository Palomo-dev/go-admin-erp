'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { CreditCard, Plus, RefreshCw } from 'lucide-react';

interface PlanesHeaderProps {
  onNewPlan: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function PlanesHeader({ onNewPlan, onRefresh, isLoading }: PlanesHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
          <CreditCard className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Planes de Parking
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gestión de planes y membresías de estacionamiento
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="self-start md:self-auto"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
        <Button
          onClick={onNewPlan}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Plan
        </Button>
      </div>
    </div>
  );
}

export default PlanesHeader;
