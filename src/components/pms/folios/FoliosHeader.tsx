'use client';

import React from 'react';
import { Receipt } from 'lucide-react';

export function FoliosHeader() {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
          <Receipt className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Gestión de Folios
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Administración de cuentas, cargos y pagos
          </p>
        </div>
      </div>
    </div>
  );
}
