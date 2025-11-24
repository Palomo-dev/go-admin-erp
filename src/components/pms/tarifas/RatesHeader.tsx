'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, DollarSign, Upload } from 'lucide-react';

interface RatesHeaderProps {
  onNewRate: () => void;
  onImport: () => void;
}

export function RatesHeader({ onNewRate, onImport }: RatesHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
            <DollarSign className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Gestor de Tarifas
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Administración de precios, planes y temporadas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onImport}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button onClick={onNewRate} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Tarifa
          </Button>
        </div>
      </div>
    </div>
  );
}
